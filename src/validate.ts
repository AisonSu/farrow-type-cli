import { SchemaCtor, StructType, TypeOf, ObjectType } from 'farrow-schema'
import { Validator } from 'farrow-schema/validator'
import { ValidationResult, CommandOrGroup, ConstraintDef } from './types'
import { isListSchema, isOptionalSchema, isBooleanSchema, getSchemaEntries } from './schema-utils'

/** 判断选项是否由用户显式提供（而非框架注入的默认值） */
const isOptionPresent = (
  key: string,
  options: Record<string, unknown>,
  userProvidedKeys?: Set<string>
): boolean => {
  if (userProvidedKeys) return userProvidedKeys.has(key)
  return key in options && options[key] !== undefined
}

// 内置约束验证器
const constraintValidators = {
  exclusive: (
    constraint: { options: (string | number | symbol)[]; description?: string },
    options: Record<string, unknown>,
    userProvidedKeys?: Set<string>
  ): string | null => {
    const present = constraint.options.filter((opt) =>
      isOptionPresent(String(opt), options, userProvidedKeys)
    )
    if (present.length > 1) {
      return (
        constraint.description ||
        `Options ${constraint.options.map(String).join(', ')} are mutually exclusive`
      )
    }
    return null
  },

  dependsOn: (
    constraint: {
      option: string | number | symbol
      requires: (string | number | symbol)[]
      description?: string
    },
    options: Record<string, unknown>,
    userProvidedKeys?: Set<string>
  ): string | null => {
    const optKey = String(constraint.option)
    if (!isOptionPresent(optKey, options, userProvidedKeys)) return null
    const missing = constraint.requires.filter(
      (req) => !isOptionPresent(String(req), options, userProvidedKeys)
    )
    if (missing.length > 0) {
      return constraint.description || `Option ${optKey} requires ${missing.map(String).join(', ')}`
    }
    return null
  },

  requiredTogether: (
    constraint: { options: (string | number | symbol)[]; description?: string },
    options: Record<string, unknown>,
    userProvidedKeys?: Set<string>
  ): string | null => {
    const present = constraint.options.filter((opt) =>
      isOptionPresent(String(opt), options, userProvidedKeys)
    )
    if (present.length > 0 && present.length < constraint.options.length) {
      return (
        constraint.description ||
        `Options ${constraint.options.map(String).join(', ')} must be specified together`
      )
    }
    return null
  },
}

/**
 * 使用 farrow-schema 验证输入
 * CLI 环境下使用非严格模式（自动类型转换）
 */
export const validateInput = <T extends SchemaCtor>(
  schema: T,
  input: unknown
): ValidationResult<TypeOf<T>> => {
  const result = Validator.validate(schema, input, { strict: false })

  if (result.isOk) {
    return { success: true, value: result.value as TypeOf<T> }
  }

  const error = result.value as { message?: string; path?: string[] }
  return {
    success: false,
    errors: [
      error.message || 'Validation failed',
      ...(error.path ? [`at: ${error.path.join('.')}`] : []),
    ],
  }
}

/**
 * 准备位置参数输入
 * 将字符串数组转为对象，按 Schema 字段顺序赋值
 * 必填字段优先分配，可选字段在剩余位置参数时分配
 * 支持剩余参数（将剩余位置参数放入 _ 字段）
 */
export const prepareArgsInput = <T extends SchemaCtor>(
  schema: T,
  positionals: string[],
  restSchema?: SchemaCtor
): { args: Record<string, unknown>; rest: unknown[]; errors?: string[] } => {
  const argsInput: Record<string, unknown> = {}
  const entries = getSchemaEntries(schema as unknown as new () => ObjectType | StructType)

  // 分离必填和可选字段
  const requiredFields: string[] = []
  const optionalFields: string[] = []

  for (const [key, fieldSchemaOrCliField] of entries) {
    const fieldSchema =
      fieldSchemaOrCliField &&
      typeof fieldSchemaOrCliField === 'object' &&
      '__type' in fieldSchemaOrCliField
        ? (fieldSchemaOrCliField as Record<string, unknown>).__type
        : fieldSchemaOrCliField

    if (isOptionalSchema(fieldSchema as SchemaCtor)) {
      optionalFields.push(key)
    } else {
      requiredFields.push(key)
    }
  }

  // 先分配必填字段，再分配可选字段
  const allFields = [...requiredFields, ...optionalFields]
  const fixedArgCount = allFields.length

  // 分配固定参数
  for (let i = 0; i < allFields.length && i < positionals.length; i++) {
    const field = allFields[i]
    const value = positionals[i]
    if (value !== undefined) {
      argsInput[field] = value
    }
  }

  // 处理剩余参数
  const restValues: unknown[] = []
  const errors: string[] = []
  if (restSchema && positionals.length > fixedArgCount) {
    const restInput = positionals.slice(fixedArgCount)
    for (const value of restInput) {
      const result = validateInput(restSchema, value)
      if (result.success) {
        restValues.push(result.value)
      } else {
        // 如果验证失败，收集错误而不是保留原始值
        errors.push(`"${value}" is not a valid rest argument: ${result.errors.join(', ')}`)
      }
    }
  } else if (positionals.length > fixedArgCount) {
    // 没有 restSchema，但有多余参数，放入 _
    restValues.push(...positionals.slice(fixedArgCount))
  }

  return { args: argsInput, rest: restValues, errors: errors.length > 0 ? errors : undefined }
}

/**
 * 准备选项输入
 * 处理数组值（多值选项如 --tag a --tag b）
 * 规则：List 类型保持数组，非 List 类型取最后一个值
 */
export const prepareOptionsInput = <T extends SchemaCtor>(
  schema: T,
  options: Record<string, string | boolean | (string | boolean)[]>
): Record<string, unknown> => {
  const input: Record<string, unknown> = { ...options }

  // 检查 Schema 中哪些字段是数组类型
  const entries = getSchemaEntries(schema as unknown as new () => ObjectType | StructType)
  const listFields = new Set<string>()

  for (const [key, fieldSchemaOrCliField] of entries) {
    // Handle CliField (with __type) or direct SchemaCtor
    const fieldSchema =
      fieldSchemaOrCliField &&
      typeof fieldSchemaOrCliField === 'object' &&
      '__type' in fieldSchemaOrCliField
        ? (fieldSchemaOrCliField as Record<string, unknown>).__type
        : fieldSchemaOrCliField
    if (typeof fieldSchema === 'function' && isListSchema(fieldSchema as SchemaCtor)) {
      listFields.add(key)
    }

    // CLI 语义：Boolean flag 未传时默认为 false，List(Boolean) 默认为 []
    // Optional 包装的字段不填充默认值（用户显式选择了可选语义）
    if (!(key in input) && typeof fieldSchema === 'function') {
      const sc = fieldSchema as SchemaCtor
      if (isBooleanSchema(sc) && !isOptionalSchema(sc)) {
        input[key] = isListSchema(sc) ? [] : false
      }
    }
  }

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      if (listFields.has(key)) {
        // List 类型：保持数组
        input[key] = value
      } else {
        // 非 List 类型：取最后一个值（覆盖行为）
        input[key] = value[value.length - 1]
      }
    } else if (listFields.has(key) && value !== undefined) {
      // List 类型但只出现一次（单值）：包装为数组
      input[key] = [value]
    }
  }

  return input
}

/**
 * 检查选项约束
 * 支持声明式和函数式约束
 */
export const checkConstraints = <T = Record<string, unknown>>(
  options: T,
  constraints?: ConstraintDef<T>[],
  userProvidedKeys?: Set<string>
): { valid: boolean; errors: string[] } => {
  if (!constraints || constraints.length === 0) {
    return { valid: true, errors: [] }
  }

  const errors: string[] = []
  const opts = options as Record<string, unknown>

  for (const constraint of constraints) {
    // 函数式约束
    if ('check' in constraint) {
      try {
        const result = constraint.check(options)
        if (!result) {
          errors.push(constraint.description)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`${constraint.description}: ${message}`)
      }
      continue
    }

    // 声明式约束
    switch (constraint.type) {
      case 'exclusive': {
        const error = constraintValidators.exclusive(constraint, opts, userProvidedKeys)
        if (error) errors.push(error)
        break
      }
      case 'dependsOn': {
        const error = constraintValidators.dependsOn(constraint, opts, userProvidedKeys)
        if (error) errors.push(error)
        break
      }
      case 'requiredTogether': {
        const error = constraintValidators.requiredTogether(constraint, opts, userProvidedKeys)
        if (error) errors.push(error)
        break
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 计算字符串编辑距离（Levenshtein Distance）
 */
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * 查找相似命令
 */
export const findSimilarCommands = (
  input: string,
  commands: CommandOrGroup[],
  maxDistance: number = 3,
  limit: number = 3
): string[] => {
  const allNames: string[] = []

  const collectNames = (cmds: CommandOrGroup[], prefix: string[] = []) => {
    for (const cmd of cmds) {
      const fullPath = [...prefix, cmd.path]
      allNames.push(fullPath.join(' '))
      // 收集别名路径
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          allNames.push([...prefix, alias].join(' '))
        }
      }
      if (cmd.type === 'group') {
        // 收集 defaultCommand 的路径和别名
        if (cmd.defaultCommand) {
          const dc = cmd.defaultCommand
          allNames.push([...fullPath, dc.path].join(' '))
          if (dc.aliases) {
            for (const alias of dc.aliases) {
              allNames.push([...fullPath, alias].join(' '))
            }
          }
        }
        // 用完整路径递归
        collectNames(cmd.subCommands, fullPath)
        // 也用别名路径递归，使 sv start 能被建议（而不仅是 server start）
        if (cmd.aliases) {
          for (const alias of cmd.aliases) {
            collectNames(cmd.subCommands, [...prefix, alias])
          }
        }
      }
    }
  }

  collectNames(commands)

  const scored = allNames.map((name) => ({
    name,
    distance: levenshteinDistance(input.toLowerCase(), name.toLowerCase()),
  }))

  return scored
    .filter((s) => s.distance <= maxDistance && s.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((s) => s.name)
}

/**
 * 查找相似选项名
 */
export const findSimilarOptions = (
  input: string,
  knownOptions: string[],
  maxDistance: number = 3,
  limit: number = 3
): string[] => {
  const scored = knownOptions.map((name) => ({
    name,
    distance: levenshteinDistance(input.toLowerCase(), name.toLowerCase()),
  }))

  return scored
    .filter((s) => s.distance <= maxDistance && s.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((s) => s.name)
}

/**
 * 格式化验证错误
 */
export const formatValidationErrors = (errors: string[]): string => {
  return errors.map((e) => `  x ${e}`).join('\n')
}
