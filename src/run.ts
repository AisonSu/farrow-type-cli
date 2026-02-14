import {
  Cli,
  AnyCommand,
  CommandGroup,
  HookInput,
  HookResult,
  GroupHookResult,
  ParsedArgv,
  ValidationFailure,
  ValidationSuccess,
  CommandOrGroup,
  CliField,
  ConstraintDef,
  ActionResult,
} from './types'
import { parseArgv, resolveAliases, autoParseJson } from './parse'
import { matchCommand, extractAliasMap, getCommandGroupsInPath } from './match'
import {
  validateInput,
  prepareArgsInput,
  prepareOptionsInput,
  formatValidationErrors,
  checkConstraints,
  findSimilarCommands,
  findSimilarOptions,
} from './validate'
import { generateCliHelp, generateCommandHelp, generateGroupHelp, renderHelp } from './help'
import { ObjectType, StructType, toSchemaCtor, SchemaCtor } from 'farrow-schema'
import { applyEnvBindings } from './env'
import { als } from './context'
import { isBooleanSchema, getSchemaEntries, getSchemaKeys } from './schema-utils'

/**
 * 从 Schema 一次性提取解析所需的全部提示信息
 */
type ParseHints = {
  knownOptions: string[]
  shortOptions: Record<string, { takesValue: boolean }>
  /** 每个长选项在该 schema 中是否为布尔类型 */
  longBooleans: Map<string, boolean>
}

const extractParseHints = (optionSchemaCtor: new () => ObjectType | StructType): ParseHints => {
  const knownOptions: string[] = []
  const shortOptions: Record<string, { takesValue: boolean }> = {}
  const longBooleans = new Map<string, boolean>()

  const entries = getSchemaEntries(optionSchemaCtor)

  for (const [key, value] of entries) {
    knownOptions.push(key)

    let schemaCtor: SchemaCtor | undefined
    let alias: string | undefined

    if (value && typeof value === 'object' && '__type' in value) {
      const field = value as CliField
      schemaCtor = field.__type
      alias = field.alias
    } else if (typeof value === 'function') {
      schemaCtor = value as SchemaCtor
    }

    const isBoolean = schemaCtor ? isBooleanSchema(schemaCtor) : false
    longBooleans.set(key, isBoolean)

    if (alias) {
      shortOptions[alias] = { takesValue: !isBoolean }
    }
  }

  return { knownOptions, shortOptions, longBooleans }
}

/**
 * 运行 CLI
 * 解析、匹配、验证、执行，错误时打印帮助并退出
 */
export const run = async (cli: Cli, argv: string[]): Promise<void> => {
  // 处理特殊命令（只检测 -- 之前的部分）
  const ddIndex = argv.indexOf('--')
  const argsBeforeDD = ddIndex === -1 ? argv : argv.slice(0, ddIndex)

  if (argsBeforeDD.includes('--help') || argsBeforeDD.includes('-h')) {
    printHelpAndExit(cli, argv)
    return
  }

  // 注意：-v 通常用于 verbose，不在框架层硬编码为 version
  if (argsBeforeDD.includes('--version')) {
    console.log(cli.version ?? '(version not set)')
    process.exit(0)
    return
  }

  // 收集所有已知选项（全局 + 所有命令），用于解析阶段的类型感知
  // - knownOptions: GNU 长选项缩写扩展
  // - shortOptions: 短选项是否消费下一个参数（冲突时偏向 takesValue=true）
  // - longBooleans: 长选项是否为布尔标志（冲突时偏向非布尔，即消费值）
  const knownOptions = new Set<string>()
  const shortOptions: Record<string, { takesValue: boolean }> = {}
  const longBooleans = new Map<string, boolean>()

  const mergeHints = (hints: ParseHints) => {
    for (const opt of hints.knownOptions) {
      knownOptions.add(opt)
    }
    for (const [alias, info] of Object.entries(hints.shortOptions)) {
      const prev = shortOptions[alias]
      shortOptions[alias] = { takesValue: (prev?.takesValue ?? false) || info.takesValue }
    }
    for (const [key, isBoolean] of hints.longBooleans) {
      const prev = longBooleans.get(key)
      // 只有所有 schema 都定义为布尔时才视为布尔，任一非布尔则降级
      longBooleans.set(key, prev === undefined ? isBoolean : prev && isBoolean)
    }
  }

  const collectHints = (commands: CommandOrGroup[]) => {
    for (const cmd of commands) {
      if (cmd.type === 'command') {
        mergeHints(extractParseHints(toSchemaCtor(cmd.options)))
      } else if (cmd.type === 'group') {
        collectHints(cmd.subCommands)
        if (cmd.defaultCommand) {
          mergeHints(extractParseHints(toSchemaCtor(cmd.defaultCommand.options)))
        }
      }
    }
  }

  if (cli.globalOptions) {
    mergeHints(extractParseHints(toSchemaCtor(cli.globalOptions)))
  }
  collectHints(cli.commands)

  const booleanOptions = new Set([...longBooleans.entries()].filter(([, v]) => v).map(([k]) => k))

  // 解析参数，传入已知选项以支持 GNU 长选项缩写
  // 重复选项始终收集为数组，validate 层根据 Schema 类型决定如何处理
  let parsed: ParsedArgv
  try {
    parsed = parseArgv(argv, {
      knownOptions: Array.from(knownOptions),
      shortOptions,
      booleanOptions,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    printErrorAndExit(cli, message)
    return
  }

  // 匹配命令
  const match = matchCommand(cli.commands, parsed.positionals)

  if (match.type === 'notFound') {
    const suggestions = findSimilarCommands(match.path.join(' '), cli.commands)
    let message = `Unknown command: ${match.path.join(' ')}`
    if (suggestions.length > 0) {
      message += `\n\nDid you mean?\n${suggestions.map((s) => `  ${s}`).join('\n')}`
    }
    printErrorAndExit(cli, message)
    return
  }

  if (match.type === 'group') {
    // 如果 group 有 defaultCommand，执行它（会同时触发 group 和 command 的 hooks）
    if (match.group.defaultCommand) {
      await executeCommand(cli, match.group.defaultCommand, parsed, match.pathArgs)
    } else {
      // 匹配到命令组但没有子命令，显示帮助并正常退出（用户没有做错事）
      const groupHelp = generateGroupHelp(cli, match.group, match.pathArgs)
      console.log(renderHelp(groupHelp))
      process.exit(0)
    }
    return
  }

  // 执行命令
  await executeCommand(cli, match.command, parsed, match.pathArgs)
}

/**
 * 执行具体命令
 */
const executeCommand = async (
  cli: Cli,
  command: AnyCommand,
  parsed: ParsedArgv,
  fullPath: string[]
): Promise<void> => {
  const argsSchemaCtor = toSchemaCtor(command.args)
  const optionsSchemaCtor = toSchemaCtor(command.options)
  const restSchemaCtor = command.rest ? toSchemaCtor(command.rest) : undefined

  // 处理全局选项

  //  转换全局选项为SchemaCtor
  const globalOptionsSchemaCtor = cli.globalOptions ? toSchemaCtor(cli.globalOptions) : undefined

  // 提取别名并解析选项（全局与命令分开解析，支持同名 key 时命令长选项优先，但全局短别名仍可生效）
  const globalAliasMap = globalOptionsSchemaCtor ? extractAliasMap(globalOptionsSchemaCtor) : {}
  const commandAliasMap = extractAliasMap(optionsSchemaCtor)

  const commandOptionKeys = new Set(getSchemaKeys(optionsSchemaCtor))
  const globalOptionKeys = new Set(
    globalOptionsSchemaCtor ? getSchemaKeys(globalOptionsSchemaCtor) : []
  )

  const rawCommandOptions: Record<string, string | boolean | (string | boolean)[]> = {}
  const rawGlobalOptions: Record<string, string | boolean | (string | boolean)[]> = {}

  for (const [key, value] of Object.entries(parsed.options)) {
    // 优先级：命令短别名 > 全局短别名 > 命令长选项 > 全局长选项
    if (key in commandAliasMap) {
      rawCommandOptions[key] = value
      continue
    }
    if (key in globalAliasMap) {
      rawGlobalOptions[key] = value
      continue
    }
    if (commandOptionKeys.has(key)) {
      rawCommandOptions[key] = value
      continue
    }
    if (globalOptionKeys.has(key)) {
      rawGlobalOptions[key] = value
      continue
    }
    // 未知选项：交给命令级验证报错
    rawCommandOptions[key] = value
  }

  // 自动解析 JSON 字符串值（如 --config='{"a":1}' 转为对象）
  const commandOptionsInput = autoParseJson(resolveAliases(rawCommandOptions, commandAliasMap))
  const globalOptionsInput = autoParseJson(resolveAliases(rawGlobalOptions, globalAliasMap))

  // 应用环境变量绑定（在验证之前）
  let finalCommandOptionsInput: Record<string, unknown> = { ...commandOptionsInput }
  if (command.env?.bindings) {
    try {
      finalCommandOptionsInput = applyEnvBindings(
        command.env.bindings,
        finalCommandOptionsInput,
        command.env.prefix
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      printErrorAndExit(cli, message, command, fullPath)
      return
    }
  }

  // 检测未知命令选项（alias 解析和环境变量绑定之后，验证之前）
  const knownCommandKeys = new Set(
    getSchemaKeys(optionsSchemaCtor as unknown as new () => ObjectType | StructType)
  )
  const unknownKeys = Object.keys(finalCommandOptionsInput).filter(
    (key) => !knownCommandKeys.has(key)
  )

  if (unknownKeys.length > 0) {
    const allKnown = [
      ...Array.from(knownCommandKeys),
      ...(globalOptionsSchemaCtor
        ? getSchemaKeys(globalOptionsSchemaCtor as unknown as new () => ObjectType | StructType)
        : []),
    ]
    const messages = unknownKeys.map((key) => {
      const suggestions = findSimilarOptions(key, allKnown)
      let msg = `Unknown option: --${key}`
      if (suggestions.length > 0) {
        msg += ` (did you mean --${suggestions[0]}?)`
      }
      return msg
    })
    printErrorAndExit(cli, messages.join('\n'), command, fullPath)
    return
  }

  // 应用全局选项的环境变量绑定（在验证之前）
  let finalGlobalOptionsInput: Record<string, unknown> = { ...globalOptionsInput }
  if (cli.env?.bindings) {
    try {
      finalGlobalOptionsInput = applyEnvBindings(
        cli.env.bindings,
        finalGlobalOptionsInput,
        cli.env.prefix
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      printErrorAndExit(cli, message)
      return
    }
  }

  // 验证全局选项（支持重复选项：List 收集，非 List 取最后一个）
  let globalOptionsValue: Record<string, unknown> = {}
  if (globalOptionsSchemaCtor) {
    const preparedGlobalInput = prepareOptionsInput(
      globalOptionsSchemaCtor as SchemaCtor,
      finalGlobalOptionsInput as Record<string, string | boolean | (string | boolean)[]>
    )
    const result = validateInput(globalOptionsSchemaCtor as SchemaCtor, preparedGlobalInput)
    if (!result.success) {
      printErrorAndExit(
        cli,
        `Invalid global options:\n${formatValidationErrors((result as ValidationFailure).errors)}`
      )
      return
    }
    globalOptionsValue = (result as ValidationSuccess<unknown>).value as Record<string, unknown>
  }

  // 准备并验证位置参数（支持剩余参数）
  const positionalArgs = parsed.positionals.slice(fullPath.length)
  const {
    args: argsInput,
    rest: restValues,
    errors: restErrors,
  } = prepareArgsInput(argsSchemaCtor, positionalArgs, restSchemaCtor)

  // 处理 rest 参数验证错误
  if (restErrors && restErrors.length > 0) {
    printErrorAndExit(
      cli,
      `Invalid rest arguments:\n${formatValidationErrors(restErrors)}`,
      command,
      fullPath
    )
    return
  }

  // 没有定义 rest 但有多余位置参数时报错
  if (!restSchemaCtor && restValues.length > 0) {
    const argCount = getSchemaKeys(
      argsSchemaCtor as unknown as new () => ObjectType | StructType
    ).length
    printErrorAndExit(
      cli,
      `Too many arguments: expected ${argCount}, got ${positionalArgs.length}`,
      command,
      fullPath
    )
    return
  }

  const argsResult = validateInput(argsSchemaCtor, argsInput)

  if (!argsResult.success) {
    printErrorAndExit(
      cli,
      `Invalid arguments:\n${formatValidationErrors((argsResult as ValidationFailure).errors)}`,
      command,
      fullPath
    )
    return
  }

  // 准备并验证选项
  // 在 prepareOptionsInput 注入 Boolean 默认值之前，记录用户实际提供的选项键
  // 用于约束检查时区分"用户显式传入"和"框架注入的默认值"
  const userProvidedOptionKeys = new Set(Object.keys(finalCommandOptionsInput))
  const optionsInput = prepareOptionsInput(
    optionsSchemaCtor,
    finalCommandOptionsInput as Record<string, string | boolean | (string | boolean)[]>
  )
  const optionsResult = validateInput(optionsSchemaCtor, optionsInput)

  if (!optionsResult.success) {
    printErrorAndExit(
      cli,
      `Invalid options:\n${formatValidationErrors((optionsResult as ValidationFailure).errors)}`,
      command,
      fullPath
    )
    return
  }

  // 检查选项约束
  const finalOptions = (optionsResult as ValidationSuccess<unknown>).value as Record<
    string,
    unknown
  >
  const constraintCheck = checkConstraints(
    finalOptions,
    command.constraints as ConstraintDef<Record<string, unknown>>[] | undefined,
    userProvidedOptionKeys
  )
  if (!constraintCheck.valid) {
    printErrorAndExit(
      cli,
      `Constraint violations:\n${formatValidationErrors(constraintCheck.errors)}`,
      command,
      fullPath
    )
    return
  }

  // 构建 HookInput（命令级钩子输入参数，含 args/options）
  const hookInput: HookInput = {
    args: argsResult.value,
    options: finalOptions,
    command: command as AnyCommand,
    fullPath,
  }

  // 构建 GroupHookInput（Group/CLI 级钩子输入参数，不含 args/options）
  const groupHookInput = {
    command: command as AnyCommand,
    fullPath,
  }

  // 获取命令路径上的所有命令组（从根到叶子）
  const groupsInPath = getCommandGroupsInPath(cli.commands, fullPath)

  // 初始化 ALS 存储
  const contexts = new Map<symbol, unknown>()

  // 使用 ALS 上下文执行钩子和 action
  await als.run({ contexts }, async () => {
    // 设置全局选项到 context 中
    if (cli.globalOptionsContext) {
      cli.globalOptionsContext.set(globalOptionsValue)
    }
    await executeWithHooks(
      cli,
      command,
      hookInput,
      groupHookInput,
      groupsInPath,
      restValues,
      fullPath
    )
  })
}

/**
 * 在 ALS 上下文中执行钩子和 action
 */
const executeWithHooks = async (
  cli: Cli,
  command: AnyCommand,
  initialHookInput: HookInput,
  groupHookInput: { command: AnyCommand; fullPath: string[] },
  groupsInPath: CommandGroup[],
  restValues: unknown[],
  fullPath: string[]
): Promise<void> => {
  const hookInput = initialHookInput
  let aborted = false
  let abortReason = ''

  // 执行 CLI 级别的 preAction 钩子（使用 GroupHookInput，不含 args/options）
  if (cli.hooks?.preAction) {
    const result = await executeGroupHooks(cli.hooks.preAction, groupHookInput)
    if (result.type === 'abort') {
      aborted = true
      abortReason = result.reason || 'Aborted by preAction hook'
    }
  }

  // 执行命令组级别的 preAction 钩子（从根到叶子，逐级执行，使用 GroupHookInput）
  if (!aborted) {
    for (const group of groupsInPath) {
      if (group.hooks?.preAction) {
        const result = await executeGroupHooks(group.hooks.preAction, groupHookInput)
        if (result.type === 'abort') {
          aborted = true
          abortReason = result.reason || `Aborted by group '${group.path}' preAction hook`
          break
        }
      }
    }
  }

  // 执行命令级别的 preAction 钩子
  if (!aborted && command.hooks?.preAction) {
    const result = await executeHooks(command.hooks.preAction, hookInput)
    if (result.type === 'abort') {
      aborted = true
      abortReason = result.reason || 'Aborted by preAction hook'
    }
  }

  // 执行 action（只在未 abort 时执行）
  let actionSuccess = false
  let actionError: Error | undefined

  if (!aborted) {
    try {
      const actionFn = command.action as (
        args: unknown,
        options: unknown,
        rest?: unknown[]
      ) => void | Promise<void>
      if (command.rest) {
        await actionFn(hookInput.args, hookInput.options, restValues)
      } else {
        await actionFn(hookInput.args, hookInput.options)
      }
      actionSuccess = true
    } catch (error: unknown) {
      actionSuccess = false
      actionError = error instanceof Error ? error : new Error(String(error))
    }
  }

  // postAction 始终执行（包括 abort 场景）
  const postActionResult: ActionResult = aborted
    ? { success: false, error: new Error(abortReason), aborted: true }
    : { success: actionSuccess, error: actionError }

  // 执行命令级别的 postAction 钩子（使用 HookInput，含 args/options）
  if (command.hooks?.postAction) {
    await executePostActionHooks(command.hooks.postAction, hookInput, postActionResult)
  }

  // 执行命令组级别的 postAction 钩子（从叶子到根，反向执行，使用 GroupHookInput）
  for (const group of [...groupsInPath].reverse()) {
    if (group.hooks?.postAction) {
      await executeGroupPostActionHooks(group.hooks.postAction, groupHookInput, postActionResult)
    }
  }

  // 执行 CLI 级别的 postAction 钩子（使用 GroupHookInput）
  if (cli.hooks?.postAction) {
    await executeGroupPostActionHooks(cli.hooks.postAction, groupHookInput, postActionResult)
  }

  // 处理退出
  if (aborted) {
    printErrorAndExit(cli, abortReason, command, fullPath)
    return
  }

  if (!actionSuccess) {
    printErrorAndExit(cli, `Error: ${actionError?.message || 'Unknown error'}`, command, fullPath)
    return
  }

  process.exit(0)
}

/**
 * 执行单个 preAction 钩子
 */
const executePreActionHook = async (
  hook: (input: HookInput) => HookResult | Promise<HookResult>,
  input: HookInput
): Promise<HookResult> => {
  try {
    const result = await hook(input)
    return result
  } catch (error) {
    return {
      type: 'abort',
      reason: error instanceof Error ? error.message : 'Hook failed',
    }
  }
}

type PreActionHookFn = (input: HookInput) => HookResult | Promise<HookResult>

/**
 * 执行 preAction 钩子（支持单个或数组）
 * 按顺序执行，如果有任何一个返回 abort，则停止执行
 */
const executeHooks = async (
  hooks: PreActionHookFn | PreActionHookFn[],
  input: HookInput
): Promise<HookResult> => {
  const hookArray = Array.isArray(hooks) ? hooks : [hooks]

  for (const hook of hookArray) {
    const result = await executePreActionHook(hook, input)
    if (result.type === 'abort') {
      return result
    }
  }

  return { type: 'continue' }
}

type PostActionHookFn = (input: HookInput, result: ActionResult) => void | Promise<void>

/**
 * 执行单个 postAction 钩子
 */
const executePostActionHook = async (
  hook: PostActionHookFn,
  input: HookInput,
  result: ActionResult
): Promise<void> => {
  try {
    await hook(input, result)
  } catch (error) {
    // postAction 钩子错误不中断流程，不影响退出码，仅输出 stderr 警告
    // 设计意图：退出码应反映主操作（action）的结果，而非善后逻辑的成败
    // 如需强制退出，请在 postAction 中显式调用 process.exit(1)
    console.error(
      `[postAction hook error] ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * 执行 postAction 钩子（支持单个或数组）
 * 按顺序执行所有钩子
 */
const executePostActionHooks = async (
  hooks: PostActionHookFn | PostActionHookFn[],
  input: HookInput,
  result: ActionResult
): Promise<void> => {
  const hookArray = Array.isArray(hooks) ? hooks : [hooks]

  for (const hook of hookArray) {
    await executePostActionHook(hook, input, result)
  }
}

// ============ Group/CLI 级钩子执行函数（不含 args/options）============

type GroupPreActionHookFn = (input: {
  command: AnyCommand
  fullPath: string[]
}) => GroupHookResult | Promise<GroupHookResult>

/**
 * 执行 Group/CLI 级 preAction 钩子（支持单个或数组）
 * 按顺序执行，如果有任何一个返回 abort，则停止执行
 */
const executeGroupHooks = async (
  hooks: GroupPreActionHookFn | GroupPreActionHookFn[],
  input: { command: AnyCommand; fullPath: string[] }
): Promise<GroupHookResult> => {
  const hookArray = Array.isArray(hooks) ? hooks : [hooks]

  for (const hook of hookArray) {
    try {
      const result = await hook(input)
      if (result.type === 'abort') {
        return result
      }
    } catch (error) {
      return {
        type: 'abort',
        reason: error instanceof Error ? error.message : 'Hook failed',
      }
    }
  }

  return { type: 'continue' }
}

type GroupPostActionHookFn = (
  input: { command: AnyCommand; fullPath: string[] },
  result: ActionResult
) => void | Promise<void>

/**
 * 执行单个 Group/CLI 级 postAction 钩子
 */
const executeGroupPostActionHook = async (
  hook: GroupPostActionHookFn,
  input: { command: AnyCommand; fullPath: string[] },
  result: ActionResult
): Promise<void> => {
  try {
    await hook(input, result)
  } catch (error) {
    // 同 executePostActionHook：不影响退出码，仅 stderr 警告
    console.error(
      `[postAction hook error] ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * 执行 Group/CLI 级 postAction 钩子（支持单个或数组）
 * 按顺序执行所有钩子
 */
const executeGroupPostActionHooks = async (
  hooks: GroupPostActionHookFn | GroupPostActionHookFn[],
  input: { command: AnyCommand; fullPath: string[] },
  result: ActionResult
): Promise<void> => {
  const hookArray = Array.isArray(hooks) ? hooks : [hooks]

  for (const hook of hookArray) {
    await executeGroupPostActionHook(hook, input, result)
  }
}

/**
 * 打印帮助并退出
 */
const printHelpAndExit = (cli: Cli, argv: string[]): void => {
  // 尝试匹配具体命令的帮助
  /**
   * ['--help', 'server', 'start', '-p', '3000'] 过滤掉以 - 开头的元素
   * positionals 只保留位置参数，如 ['server', 'start']
   *  Args:   命令 "是什么"  →  deploy server-prod 8080
   *  Options: 命令 "怎么做" →  --env production --verbose
   */
  const positionals = argv.filter((a) => !a.startsWith('-'))
  const match = matchCommand(cli.commands, positionals)

  if (match.type === 'command') {
    const help = generateCommandHelp(cli, match.command, match.pathArgs)
    console.log(renderHelp(help))
  } else if (match.type === 'group') {
    const help = generateGroupHelp(cli, match.group, match.pathArgs)
    console.log(renderHelp(help))
  } else {
    const help = generateCliHelp(cli)
    console.log(renderHelp(help))
  }

  process.exit(0)
}

/**
 * 打印错误并退出
 */
const printErrorAndExit = (
  cli: Cli,
  message: string,
  command?: AnyCommand,
  fullPath?: string[]
): void => {
  console.error(message)
  console.error('')

  if (command && fullPath) {
    console.error(`Run '${cli.name} ${fullPath.join(' ')} --help' for usage.`)
  } else {
    console.error(`Run '${cli.name} --help' for usage.`)
  }

  process.exit(1)
}

export { parseArgv, matchCommand }
