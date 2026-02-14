import { ParsedArgv, ParseOptions } from './types'

/**
 * 解析原始 argv 为结构化对象
 * 遵循 POSIX 和 GNU 标准：
 * - --key=value  → { key: value }
 * - --key value  → { key: value }
 * - -k value     → { k: value }
 * --flag       → { flag: true }
 * -abc         → { a: true, b: true, c: true }
 * -abcvalue    → { a: true, b: true, c: value } (POSIX 选项合并带值)
 * --           → 停止解析，剩余全为位置参数
 * --opt        → GNU 可选参数支持
 * -            → 单横线作为位置参数
 */
export const parseArgv = (argv: string[], options?: ParseOptions): ParsedArgv => {
  const positionals: string[] = []
  const opts: Record<string, string | boolean | (string | boolean)[]> = {}
  let stopParsing = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    // 停止解析标记
    if (arg === '--') {
      stopParsing = true
      continue
    }

    // POSIX标准，停止解析options，后续全部push进入arg中
    if (stopParsing) {
      positionals.push(arg)
      continue
    }

    // 单横线作为位置参数（POSIX 标准）
    if (arg === '-') {
      positionals.push(arg)
      continue
    }

    // 长选项 --key=value 或 --key
    if (arg.startsWith('--') && arg.length > 2) {
      const expandedArg = expandLongOption(arg, options?.knownOptions)
      const eqIndex = expandedArg.indexOf('=')

      if (eqIndex > 2) {
        // --key=value 形式
        const key = expandedArg.slice(2, eqIndex)
        const value = expandedArg.slice(eqIndex + 1)
        setOption(opts, key, value)
      } else {
        // --key 形式，检查下一个参数
        const key = expandedArg.slice(2)
        const nextArg = argv[i + 1]
        const isBoolean = options?.booleanOptions?.has(key) ?? false

        if (!isBoolean && nextArg && !nextArg.startsWith('-')) {
          // 非布尔选项：消费下一个参数作为值
          setOption(opts, key, nextArg)
          i++
        } else {
          setOption(opts, key, true)
        }
      }
      continue
    }

    // 短选项 -k 或 -abc
    if (arg.startsWith('-') && arg.length > 1) {
      // 检查是否包含 = （如 -v=-debug 或 -v=）
      const eqIndex = arg.indexOf('=')
      if (eqIndex >= 2) {
        // 可能是 -v=value 形式
        const keyPart = arg.slice(0, eqIndex) // '-v' 或 '-abc'

        // 只处理单字符短选项 -v=value，不处理 -abc=value
        if (!keyPart.startsWith('--') && keyPart.length === 2) {
          const key = keyPart.slice(1) // 'v'
          const value = arg.slice(eqIndex + 1) // 值部分（可能是空字符串）
          setOption(opts, key, value)
          continue
        }
      }

      // 处理 -abc=value：截断等号，将等号后的部分作为最后一个字符的值
      const eqInChars = arg.indexOf('=', 1)
      const chars = eqInChars > 0 ? arg.slice(1, eqInChars) : arg.slice(1)
      const eqValue = eqInChars > 0 ? arg.slice(eqInChars + 1) : undefined

      // 单字符短选项
      if (chars.length === 1) {
        const key = chars

        // 等号语法优先：-k=value
        if (eqValue !== undefined) {
          setOption(opts, key, eqValue)
        } else {
          const nextArg = argv[i + 1]
          const takesValue = options?.shortOptions?.[key]?.takesValue ?? false

          if (takesValue && nextArg && !nextArg.startsWith('-')) {
            // 明确配置为带值选项
            setOption(opts, key, nextArg)
            i++
          } else {
            // 默认作为布尔标志
            setOption(opts, key, true)
          }
        }
      } else {
        // 多字符短选项 -abc / -fvalue / -abfvalue / -abc=value
        // POSIX: 从左到右扫描，第一个 takesValue 的选项吃掉剩余部分作为值
        for (let j = 0; j < chars.length; j++) {
          const char = chars[j]
          const isLast = j === chars.length - 1
          const charTakesValue = options?.shortOptions?.[char]?.takesValue ?? false

          if (charTakesValue) {
            const rest = chars.slice(j + 1)
            if (rest.length > 0) {
              // -fvalue 或 -abc=value 形式：剩余部分 + 等号后的值
              const fullValue = eqValue !== undefined ? rest + '=' + eqValue : rest
              setOption(opts, char, fullValue)
            } else if (eqValue !== undefined) {
              // -abf=value 形式：等号后的部分是值
              setOption(opts, char, eqValue)
            } else {
              // -abf value 形式：值在下一个参数
              const nextArg = argv[i + 1]
              if (nextArg && !nextArg.startsWith('-')) {
                setOption(opts, char, nextArg)
                i++
              } else {
                setOption(opts, char, true)
              }
            }
            break
          }

          // 当前字符是 flag
          if (isLast && eqValue !== undefined) {
            // -abc=value：最后一个字符接收等号后的值
            setOption(opts, char, eqValue)
          } else {
            setOption(opts, char, true)
          }
        }
      }
      continue
    }

    // 位置参数
    positionals.push(arg)
  }

  return {
    positionals,
    options: opts,
    raw: argv,
  }
}

/**
 * 设置选项值，始终收集为数组（让 validate 层根据类型决定如何处理）
 */
const setOption = (
  opts: Record<string, string | boolean | (string | boolean)[]>,
  key: string,
  value: string | boolean
): void => {
  const existing = opts[key]

  if (existing === undefined) {
    opts[key] = value
    return
  }

  // 始终收集为数组，validate 层根据 Schema 类型决定如何处理
  if (Array.isArray(existing)) {
    existing.push(value)
  } else {
    opts[key] = [existing, value]
  }
}

/**
 * GNU 长选项缩写扩展
 * 将 --ver 扩展为 --version（如果唯一匹配）
 * 如果有多个匹配，抛出错误
 */
export const expandLongOption = (input: string, knownOptions?: string[]): string => {
  if (!input.startsWith('--') || !knownOptions || knownOptions.length === 0) {
    return input
  }

  // 分离 = 部分，支持 --ver=1.0 → --version=1.0
  const eqIndex = input.indexOf('=')
  // eqIndex > 2 确保 -- 和 = 之间至少有一个字符（如 --opt= 的 eqIndex=5）
  const optPart = eqIndex > 2 ? input.slice(0, eqIndex) : input
  const valPart = eqIndex > 2 ? input.slice(eqIndex) : ''

  const prefix = optPart.slice(2)

  // 空前缀检查（处理 --= 这种非法输入）
  if (prefix.length === 0) {
    return input
  }

  // 完全匹配优先：如果 prefix 恰好等于某个已知选项，直接返回（不视为缩写）
  if (knownOptions.includes(prefix)) {
    return `--${prefix}${valPart}`
  }

  const matches = knownOptions.filter((opt) => opt.startsWith(prefix))

  if (matches.length === 1) {
    return `--${matches[0]}${valPart}`
  }

  if (matches.length > 1) {
    throw new Error(
      `ambiguous option: '${optPart}' could be ${matches.map((m) => `'--${m}'`).join(', ')}`
    )
  }

  // 无匹配，保持原样（后续验证会报错）
  return input
}

/**
 * 合并选项（处理别名映射）
 * 将短选项映射到长选项
 */
export const resolveAliases = (
  options: Record<string, string | boolean | (string | boolean)[]>,
  aliasMap: Record<string, string>
): Record<string, string | boolean | (string | boolean)[]> => {
  const resolved: Record<string, string | boolean | (string | boolean)[]> = {}

  for (const [key, value] of Object.entries(options)) {
    // 有别名映射则用长选项名，否则保持原键
    const targetKey = aliasMap[key] ?? key
    // 如果已经有值，转为数组（支持多值如 --tag a --tag b）
    if (targetKey in resolved) {
      const existing = resolved[targetKey]
      if (Array.isArray(existing)) {
        if (Array.isArray(value)) {
          resolved[targetKey] = [...existing, ...value]
        } else {
          resolved[targetKey] = [...existing, value]
        }
      } else {
        if (Array.isArray(value)) {
          resolved[targetKey] = [existing, ...value]
        } else {
          resolved[targetKey] = [existing, value]
        }
      }
    } else {
      resolved[targetKey] = value
    }
  }

  return resolved
}

/**
 * 将选项键名规范化（移除 -- 前缀）
 */
export const normalizeOptions = (
  options: Record<string, string | boolean | (string | boolean)[]>
): Record<string, string | boolean | (string | boolean)[]> => {
  const normalized: Record<string, string | boolean | (string | boolean)[]> = {}
  for (const [key, value] of Object.entries(options)) {
    // 移除开头的 --
    const cleanKey = key.startsWith('--') ? key.slice(2) : key
    normalized[cleanKey] = value
  }
  return normalized
}

/**
 * 自动尝试解析 JSON 字符串值
 * 如果值是以 { 或 [ 开头的字符串，尝试解析为 JSON 对象/数组
 * 解析失败时保持原值不变
 */
export const autoParseJson = (options: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(options)) {
    result[key] = tryParseJson(value)
  }

  return result
}

/**
 * 尝试解析单个值为 JSON
 * @internal
 */
const tryParseJson = (value: unknown): unknown => {
  // 递归处理数组中的每个元素
  if (Array.isArray(value)) {
    return value.map(tryParseJson)
  }

  // 只处理字符串
  if (typeof value !== 'string') {
    return value
  }

  // 检测是否为 JSON 格式（以 { 或 [ 开头）
  const trimmed = value.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    // 解析失败，保持原值
    return value
  }
}
