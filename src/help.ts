import {
  AnyCommand,
  CommandGroup,
  CommandOrGroup,
  HelpContent,
  CommandInfo,
  Cli,
  CliField,
} from './types'
import {
  SchemaCtor,
  toSchemaCtor,
  ObjectType,
  StructType,
  getInstance,
  FieldDescriptors,
  FieldDescriptor,
  ListType,
  OptionalType,
  NullableType,
  UnionType,
  IntersectType,
  TupleType,
  RecordType,
  SchemaCtorInput,
  FieldInfo,
  LiteralType,
  String as StringSchema,
  Number as NumberSchema,
  Boolean as BooleanSchema,
  Int as IntSchema,
  Float as FloatSchema,
  Date as DateSchema,
  ID as IDSchema,
} from 'farrow-schema'
import { getSchemaEntries, isOptionalSchema, isBooleanSchema } from './schema-utils'
import { groupToVirtualCommand } from './match'

/**
 * 从 Schema 提取字段信息（用于帮助生成）
 * 支持 ObjectType、StructType 以及原始类型
 */
function extractSchemaInfo(
  schemaCtor: new () => ObjectType | StructType,
  type: 'arg',
  isRest?: boolean
): CommandInfo['args']
function extractSchemaInfo(
  schemaCtor: new () => ObjectType | StructType,
  type: 'option',
  isRest?: boolean
): CommandInfo['options']
function extractSchemaInfo(
  schemaCtor: new () => ObjectType | StructType,
  type: 'arg' | 'option',
  isRest: boolean = false
): CommandInfo['args'] | CommandInfo['options'] {
  const fields: (CommandInfo['args'][number] | CommandInfo['options'][number])[] = []
  const entries = getSchemaEntries(schemaCtor)

  for (const [key, value] of entries) {
    const fieldInfo = extractFieldInfo(value)

    if (type === 'arg') {
      fields.push({
        name: key,
        type: fieldInfo.displayType,
        required: fieldInfo.required && !isRest,
        description: fieldInfo.description,
        rest: isRest,
      })
    } else {
      const shortName = fieldInfo.alias
      const fullName = key.startsWith('--') ? key.slice(2) : key
      fields.push({
        name: fullName,
        shortName,
        type: fieldInfo.displayType,
        required: fieldInfo.required,
        description: fieldInfo.description,
        global: false,
        isFlag: fieldInfo.isFlag,
      })
    }
  }

  return fields
}

/**
 * 提取单个字段信息
 */
const extractFieldInfo = (
  value: FieldDescriptor | FieldDescriptors
): {
  displayType: string
  required: boolean
  description?: string
  alias?: string
  isFlag?: boolean
} => {
  // 处理嵌套的 FieldDescriptors（对象类型，包含多个字段定义）
  // 递归提取字段，返回结构化的类型描述，如: { name: string, age: number }
  if (value && typeof value === 'object' && !('__type' in value)) {
    const descriptors = value as FieldDescriptors
    const fields = Object.entries(descriptors).map(([key, val]) => {
      const info = extractFieldInfo(val)
      return `${key}: ${info.displayType}${info.required ? '' : '?'}`
    })
    return {
      displayType: fields.length > 0 ? `{ ${fields.join(', ')} }` : '{}',
      required: true,
    }
  }

  // 处理 FieldDescriptor
  // 处理FieldInfo(CliField)
  if (value && typeof value === 'object' && '__type' in value) {
    const info = value as CliField
    const rawType = renderTypeSchema(info.__type)
    const isOptional = isOptionalSchema(info.__type)
    const isFlag = isBooleanSchema(info.__type)

    return {
      displayType: rawType,
      required: !isOptional,
      description: info.description,
      alias: info.alias,
      isFlag,
    }
  }

  // 直接 SchemaCtor（函数类型）
  const rawType = renderTypeSchema(value as SchemaCtor)
  const isOptional = isOptionalSchema(value as SchemaCtor)
  const isFlag = isBooleanSchema(value as SchemaCtor)

  return {
    displayType: rawType,
    required: !isOptional,
    isFlag,
  }
}

/**
 * 渲染类型模式（用于帮助文本）
 * 递归解析并格式化 Schema 为可读的字符串表示
 * 支持 ObjectType/StructType 展开，返回详细的类型描述
 */
const renderTypeSchema = (
  schemaCtor: SchemaCtor,
  seen: WeakSet<SchemaCtor> = new WeakSet()
): string => {
  // 防止循环引用
  if (seen.has(schemaCtor)) return '{...}'
  seen.add(schemaCtor)

  // 获取实例进行类型检查（比依赖 constructor.name 更可靠，避免压缩问题）
  const schema = getInstance(schemaCtor)

  // 基础类型检查
  if (schema instanceof StringSchema) return 'string'
  if (schema instanceof NumberSchema) return 'number'
  if (schema instanceof BooleanSchema) return 'boolean'
  if (schema instanceof IntSchema) return 'int'
  if (schema instanceof FloatSchema) return 'float'
  if (schema instanceof IDSchema) return 'id'
  if (schema instanceof DateSchema) return 'date'

  // 复杂类型检查
  if (schema instanceof ListType) {
    const itemType = schema.Item ? renderTypeSchema(schema.Item, seen) : 'unknown'
    return `${itemType}[]`
  }

  if (schema instanceof OptionalType) {
    const inner = schema.Item
    const innerType = inner ? renderTypeSchema(inner, seen) : 'unknown'
    return `${innerType}?`
  }

  if (schema instanceof NullableType) {
    const inner = schema.Item
    const innerType = inner ? renderTypeSchema(inner, seen) : 'unknown'
    return `${innerType} | null`
  }

  if (schema instanceof UnionType) {
    const items = schema.Items
    if (Array.isArray(items)) {
      const types = items.map((item) => renderTypeSchema(item, seen))
      return types.join(' | ')
    }
    return 'union'
  }

  if (schema instanceof IntersectType) {
    const items = schema.Items
    if (Array.isArray(items)) {
      const types = items.map((item) => renderTypeSchema(item, seen))
      return types.join(' & ')
    }
    return 'intersection'
  }

  if (schema instanceof TupleType) {
    const items = schema.Items
    if (Array.isArray(items)) {
      const types = items.map((item) => renderTypeSchema(item, seen))
      return `[${types.join(', ')}]`
    }
    return 'tuple'
  }

  if (schema instanceof RecordType) {
    const inner = schema.Item
    const itemType = inner ? renderTypeSchema(inner, seen) : 'unknown'
    return `Record<string, ${itemType}>`
  }

  if (schema instanceof LiteralType) {
    const val = schema.value
    return typeof val === 'string' ? `'${val}'` : String(val)
  }

  // 包装类型：递归解包
  if (schema instanceof StructType || schema instanceof ObjectType) {
    // StructType 和 ObjectType 是容器类型，展开显示
    const entries =
      schema instanceof StructType
        ? Object.entries(schema.descriptors || {})
        : Object.entries(schema)

    if (entries.length > 0) {
      const fields = entries.map(([key, val]) => {
        if (typeof val === 'object' && val !== null && '__type' in val) {
          // FieldInfo
          const fieldType = renderTypeSchema((val as FieldInfo).__type as SchemaCtor, seen)
          return `${key}: ${fieldType}`
        }
        // SchemaCtorInput
        const fieldType = renderTypeSchema(toSchemaCtor(val as SchemaCtorInput), seen)
        return `${key}: ${fieldType}`
      })
      return `{ ${fields.join(', ')} }`
    }
    return '{}'
  }

  // 其他包装类型 (Strict/NonStrict/ReadOnly/ReadOnlyDeep)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = (schema as any)?.Item
  if (inner) {
    return renderTypeSchema(inner, seen)
  }

  return 'object'
}

/**
 * 构建命令信息
 */
const buildCommandInfo = (cmd: AnyCommand, fullPath?: string[]): CommandInfo => {
  const argsSchemaCtor = toSchemaCtor(cmd.args)
  const optionsSchemaCtor = toSchemaCtor(cmd.options)

  const args = extractSchemaInfo(argsSchemaCtor, 'arg')

  // 如果有剩余参数，直接构建 ArgInfo（rest 通常是简单类型如 String，不是 ObjectType/StructType）
  if (cmd.rest) {
    const restSchemaCtor = toSchemaCtor(cmd.rest) as SchemaCtor
    const typeName = renderTypeSchema(restSchemaCtor)
    args.push({
      name: '...rest',
      type: typeName,
      required: false,
      rest: true,
    })
  }

  return {
    path: fullPath || [cmd.path],
    aliases: cmd.aliases,
    description: cmd.description,
    args,
    options: extractSchemaInfo(optionsSchemaCtor, 'option'),
    constraints: cmd.constraints,
  }
}

/**
 * 提取全局选项信息
 */
const extractGlobalOptions = (cli: Cli): CommandInfo['options'] | undefined => {
  if (!cli.globalOptions) return undefined
  const globalSchema = toSchemaCtor(cli.globalOptions)
  return extractSchemaInfo(globalSchema, 'option').map((o) => ({ ...o, global: true }))
}

/**
 * 生成 CLI 根级别帮助
 */
export const generateCliHelp = (cli: Cli): HelpContent => {
  const allCommands = flattenCommandsForHelp(cli.commands)

  return {
    name: cli.name,
    version: cli.version,
    description: cli.description,
    usage: `${cli.name} <command> [options]`,
    commands: allCommands.map((cmd) => buildCommandInfo(cmd, cmd.fullPath)),
    globalOptions: extractGlobalOptions(cli),
  }
}

/**
 * 生成特定命令帮助
 */
export const generateCommandHelp = (
  cli: Cli,
  command: AnyCommand,
  fullPath: string[]
): HelpContent => {
  return {
    name: cli.name,
    version: cli.version,
    description: cli.description,
    usage: `${cli.name} ${fullPath.join(' ')} [args] [options]`,
    currentCommand: buildCommandInfo(command),
    globalOptions: extractGlobalOptions(cli),
  }
}

/**
 * 生成命令组帮助
 */
export const generateGroupHelp = (
  cli: Cli,
  group: CommandGroup,
  fullPath: string[]
): HelpContent => {
  // 构建命令列表
  // 如果 group 有 defaultCommand，先添加 group 作为默认命令
  const commands: CommandInfo[] = []
  if (group.defaultCommand && !group.defaultCommand.hidden) {
    const defaultCmd = buildCommandInfo(group.defaultCommand, [fullPath[fullPath.length - 1]])
    commands.push({
      ...defaultCmd,
      description: group.description ? `${group.description} (default)` : 'Default command',
    })
  }
  commands.push(
    ...group.subCommands
      .filter((cmd) => !cmd.hidden)
      .map((cmd) => {
        if (cmd.type === 'command') {
          return buildCommandInfo(cmd, [cmd.path])
        }
        // 子组：转为虚拟命令条目显示
        return buildCommandInfo(groupToVirtualCommand(cmd, [cmd.path]), [cmd.path])
      })
  )

  // usage 格式：有 defaultCommand 时 subcommand 是可选的，否则是必需的
  const visibleDefault = group.defaultCommand && !group.defaultCommand.hidden
  const subcommandPart = visibleDefault ? '[subcommand]' : '<subcommand>'

  // 如果有可见的 defaultCommand，也显示它的详细信息
  const currentCommand = visibleDefault
    ? buildCommandInfo(group.defaultCommand!, fullPath)
    : undefined

  return {
    name: cli.name,
    version: cli.version,
    description: group.description || cli.description,
    usage: `${cli.name} ${fullPath.join(' ')} ${subcommandPart} [options]`,
    commands,
    currentCommand,
    globalOptions: extractGlobalOptions(cli),
  }
}

/**
 * 扁平化命令列表（用于帮助）
 */
type CommandWithFullPath = AnyCommand & { fullPath: string[] }

const flattenCommandsForHelp = (
  commands: CommandOrGroup[],
  prefix: string[] = []
): CommandWithFullPath[] => {
  const result: CommandWithFullPath[] = []

  for (const cmd of commands) {
    const fullPath = [...prefix, cmd.path]

    if (cmd.type === 'command') {
      if (!cmd.hidden) {
        result.push({ ...cmd, fullPath } as CommandWithFullPath)
      }
    } else if (cmd.type === 'group') {
      if (cmd.hidden) continue
      const virtualFullPath = prefix.length === 0 ? [cmd.path] : fullPath

      if (cmd.defaultCommand && !cmd.defaultCommand.hidden) {
        // 有 defaultCommand 时用它作为代表条目（携带实际的 options/args 元数据）
        // fullPath 使用 group 路径，因为用户可以直接输入 group 路径触发 defaultCommand
        result.push({
          ...cmd.defaultCommand,
          fullPath,
          // 合并 defaultCommand 和 group 的别名
          aliases: [...(cmd.defaultCommand.aliases || []), ...(cmd.aliases || [])],
          description: cmd.defaultCommand.description || cmd.description,
        } as CommandWithFullPath)
      } else {
        // 无 defaultCommand：用虚拟命令占位
        result.push(groupToVirtualCommand(cmd, virtualFullPath) as CommandWithFullPath)
      }
      result.push(...flattenCommandsForHelp(cmd.subCommands, fullPath))
    }
  }

  return result
}

/**
 * 渲染约束信息
 */
const renderConstraints = (constraints?: CommandInfo['constraints']): string[] => {
  if (!constraints || constraints.length === 0) return []

  const lines: string[] = []
  lines.push('Constraints:')

  for (const c of constraints) {
    if (c.type === 'custom') {
      // 自定义约束
      lines.push(`  * ${c.description}`)
    } else {
      // 声明式约束
      switch (c.type) {
        case 'exclusive':
          lines.push(
            `  * ${c.description || c.options.map(String).join(' | ') + ' (mutually exclusive)'}`
          )
          break
        case 'dependsOn':
          lines.push(
            `  * ${
              c.description || String(c.option) + ' requires ' + c.requires.map(String).join(', ')
            }`
          )
          break
        case 'requiredTogether':
          lines.push(
            `  * ${c.description || c.options.map(String).join(' + ') + ' (required together)'}`
          )
          break
      }
    }
  }

  return lines
}

/**
 * 渲染帮助文本
 */
export const renderHelp = (content: HelpContent): string => {
  const lines: string[] = []

  // 标题
  if (content.version) {
    lines.push(`${content.name} v${content.version}`)
  } else {
    lines.push(content.name)
  }
  lines.push('')

  // 描述
  if (content.description) {
    lines.push(content.description)
    lines.push('')
  }

  // 用法
  lines.push(`Usage: ${content.usage}`)
  lines.push('')

  // 命令列表
  if (content.commands && content.commands.length > 0) {
    lines.push('Commands:')
    const pathStrs = content.commands.map((c) => {
      const path = c.path.join(' ')
      const aliases = c.aliases?.length ? ` | ${c.aliases.join(' | ')}` : ''
      return path + aliases
    })
    const maxPathLen = Math.max(...pathStrs.map((s) => s.length))

    for (const cmd of content.commands) {
      const path = cmd.path.join(' ')
      const aliases = cmd.aliases?.length ? ` | ${cmd.aliases.join(' | ')}` : ''
      const displayPath = (path + aliases).padEnd(maxPathLen)
      const desc = cmd.description || ''
      lines.push(`  ${displayPath}  ${desc}`)
    }
    lines.push('')
  }

  // 当前命令详情
  if (content.currentCommand) {
    const cmd = content.currentCommand

    // 位置参数
    if (cmd.args.length > 0) {
      lines.push('Arguments:')
      const maxNameLen = Math.max(...cmd.args.map((a) => a.name.length))

      for (const arg of cmd.args) {
        const name = arg.name.padEnd(maxNameLen)
        const type = arg.required ? `<${arg.type}>` : `[${arg.type}]`
        const desc = arg.description || ''
        lines.push(`  ${name}  ${type}  ${desc}`)
      }
      lines.push('')
    }

    // 选项
    if (cmd.options.length > 0) {
      lines.push('Options:')
      const maxNameLen = Math.max(
        ...cmd.options.map((o) => {
          const name = o.shortName ? `-${o.shortName}, --${o.name}` : `--${o.name}`
          return name.length
        })
      )

      for (const opt of cmd.options) {
        const name = opt.shortName
          ? `-${opt.shortName}, --${opt.name}`.padEnd(maxNameLen)
          : `--${opt.name}`.padEnd(maxNameLen)
        const type = opt.isFlag ? '' : opt.required ? `<${opt.type}>` : `[${opt.type}]`
        const desc = opt.description || ''
        lines.push(`  ${name}  ${type}${type && desc ? '  ' : ''}${desc}`)
      }
      lines.push('')
    }

    // 约束
    if (cmd.constraints && cmd.constraints.length > 0) {
      lines.push(...renderConstraints(cmd.constraints))
      lines.push('')
    }
  }

  // 全局选项
  if (content.globalOptions && content.globalOptions.length > 0) {
    lines.push('Global Options:')
    const maxNameLen = Math.max(
      ...content.globalOptions.map((o) => {
        const name = o.shortName ? `-${o.shortName}, --${o.name}` : `--${o.name}`
        return name.length
      })
    )

    for (const opt of content.globalOptions) {
      const name = opt.shortName
        ? `-${opt.shortName}, --${opt.name}`.padEnd(maxNameLen)
        : `--${opt.name}`.padEnd(maxNameLen)
      const type = opt.isFlag ? '' : opt.required ? `<${opt.type}>` : `[${opt.type}]`
      const desc = opt.description || ''
      lines.push(`  ${name}  ${type}${type && desc ? '  ' : ''}${desc}`)
    }
    lines.push('')
  }

  // 内置选项（始终可用）
  lines.push('Built-in Options:')
  lines.push('  -h, --help     Show help')
  lines.push('  --version      Show version')
  lines.push('')

  return lines.join('\n')
}
