// ============ 类型导入 ============
import type {
  Cli,
  Command,
  CommandGroup,
  CommandOrGroup,
  CommandPath,
  ConstraintDef,
  PreActionHook,
  PostActionHook,
  GroupPreActionHook,
  GroupPostActionHook,
  ActionResult,
  EnvOptions,
  DefineSchemaInput,
  TypeOfDefineSchemaInput,
  ParsedArgv,
  ParseOptions,
  MatchResult,
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
  HelpContent,
  ArgInfo,
  OptionInfo,
  CommandInfo,
  HookInput,
  HookResult,
  GroupHookResult,
  EnvBinding,
  CliField,
  ShortOptionChar,
} from './types'
import type { SchemaCtor } from 'farrow-schema'
import type { ContextToken } from './context'
import type { MockResult } from './test-helpers'

// ============ 值导入 ============
import { defineContext } from './context'
import { run as runInternal } from './run'

// ============ 核心类型导出 ============
export type {
  Cli,
  Command,
  CommandGroup,
  CommandOrGroup,
  CommandPath,
  ParsedArgv,
  ParseOptions,
  MatchResult,
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
  HelpContent,
  ArgInfo,
  OptionInfo,
  CommandInfo,
  HookInput,
  HookResult,
  GroupHookResult,
  PreActionHook,
  PostActionHook,
  GroupPreActionHook,
  GroupPostActionHook,
  ActionResult,
  ConstraintDef,
  EnvBinding,
  EnvOptions,
  CliField,
  ShortOptionChar,
}

// ============ 命令定义函数 ============

/** 命令配置的公共字段 */
type CommandConfigBase<TArgs extends DefineSchemaInput, TOptions extends DefineSchemaInput> = {
  path: CommandPath
  aliases?: string[]
  hidden?: boolean
  description?: string
  args: TArgs
  options: TOptions
  constraints?: ConstraintDef<TypeOfDefineSchemaInput<TOptions>>[]
  hooks?: {
    preAction?:
      | PreActionHook<TypeOfDefineSchemaInput<TArgs>, TypeOfDefineSchemaInput<TOptions>>
      | PreActionHook<TypeOfDefineSchemaInput<TArgs>, TypeOfDefineSchemaInput<TOptions>>[]
    postAction?:
      | PostActionHook<TypeOfDefineSchemaInput<TArgs>, TypeOfDefineSchemaInput<TOptions>>
      | PostActionHook<TypeOfDefineSchemaInput<TArgs>, TypeOfDefineSchemaInput<TOptions>>[]
  }
  env?: EnvOptions<TypeOfDefineSchemaInput<TOptions>>
}

/**
 * 定义命令（叶子节点）
 * args 和 options 支持直接内联 FieldDescriptors 或使用 Struct()/ObjectType
 */
// 重载 1：带 rest 参数
export function defineCommand<
  TArgs extends DefineSchemaInput,
  TOptions extends DefineSchemaInput,
  TRest extends DefineSchemaInput,
>(
  config: CommandConfigBase<TArgs, TOptions> & {
    rest: TRest
    action: (
      args: TypeOfDefineSchemaInput<TArgs>,
      options: TypeOfDefineSchemaInput<TOptions>,
      rest: TypeOfDefineSchemaInput<TRest>[]
    ) => void | Promise<void>
  }
): Command<TArgs, TOptions, TRest>

// 重载 2：无 rest 参数
export function defineCommand<TArgs extends DefineSchemaInput, TOptions extends DefineSchemaInput>(
  config: CommandConfigBase<TArgs, TOptions> & {
    rest?: undefined
    action: (
      args: TypeOfDefineSchemaInput<TArgs>,
      options: TypeOfDefineSchemaInput<TOptions>
    ) => void | Promise<void>
  }
): Command<TArgs, TOptions, undefined>

// 实现：使用 unknown 过渡，实际类型由重载保证
export function defineCommand<
  TArgs extends DefineSchemaInput,
  TOptions extends DefineSchemaInput,
  TRest extends DefineSchemaInput | undefined,
>(config: unknown): Command<TArgs, TOptions, TRest> {
  const c = config as CommandConfigBase<TArgs, TOptions> & {
    path: CommandPath
    rest?: TRest
    action: (...args: unknown[]) => void | Promise<void>
  }
  return {
    type: 'command',
    path: c.path,
    aliases: c.aliases,
    hidden: c.hidden,
    description: c.description,
    args: c.args,
    options: c.options,
    rest: c.rest,
    constraints: c.constraints,
    hooks: c.hooks,
    env: c.env,
    action: c.action as Command<TArgs, TOptions, TRest>['action'],
  }
}

/**
 * 定义命令组（可嵌套）
 * 当 group 定义了 defaultCommand 时，访问该 group 路径会执行 defaultCommand
 */
export const defineCommandGroup = <
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TArgs extends DefineSchemaInput = {},
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TOptions extends DefineSchemaInput = {},
  TRest extends DefineSchemaInput | undefined = undefined,
>(config: {
  path: CommandPath
  aliases?: string[]
  hidden?: boolean
  description?: string
  subCommands: CommandOrGroup[]
  defaultCommand?: Command<TArgs, TOptions, TRest>
  hooks?: {
    preAction?: GroupPreActionHook | GroupPreActionHook[]
    postAction?: GroupPostActionHook | GroupPostActionHook[]
  }
}): CommandGroup => {
  return {
    type: 'group',
    path: config.path,
    aliases: config.aliases,
    hidden: config.hidden,
    description: config.description,
    subCommands: config.subCommands,
    defaultCommand: config.defaultCommand,
    hooks: config.hooks,
  }
}

/**
 * 可添加命令的 CLI 类型
 */
export type CliWithAdd<TGlobalOptions extends DefineSchemaInput | undefined = undefined> =
  Cli<TGlobalOptions> & {
    add: (...commands: (CommandOrGroup | CommandOrGroup[])[]) => CliWithAdd<TGlobalOptions>
  }

/**
 * 定义 CLI
 * 使用 add 方法动态添加命令和命令组
 */
export const defineCli = <
  TGlobalOptions extends DefineSchemaInput | undefined = undefined,
>(config: {
  name: string
  version?: string
  description?: string
  globalOptions?: TGlobalOptions
  hooks?: {
    preAction?: GroupPreActionHook | GroupPreActionHook[]
    postAction?: GroupPostActionHook | GroupPostActionHook[]
  }
  env?: TGlobalOptions extends DefineSchemaInput
    ? EnvOptions<TypeOfDefineSchemaInput<TGlobalOptions>>
    : never
}): CliWithAdd<TGlobalOptions> => {
  const commands: CommandOrGroup[] = []
  const globalOptionsContext =
    defineContext<
      TGlobalOptions extends DefineSchemaInput ? TypeOfDefineSchemaInput<TGlobalOptions> : unknown
    >()

  const cli: Cli<TGlobalOptions> = {
    ...config,
    commands,
    globalOptionsContext,
  } as Cli<TGlobalOptions>

  const cliWithAdd: CliWithAdd<TGlobalOptions> = {
    ...cli,
    add: (...cmds: (CommandOrGroup | CommandOrGroup[])[]) => {
      for (const cmd of cmds) {
        if (Array.isArray(cmd)) {
          commands.push(...cmd)
        } else {
          commands.push(cmd)
        }
      }
      return cliWithAdd
    },
  }

  return cliWithAdd
}

// ============ 运行函数 ============

/**
 * 运行 CLI
 */
export const runCli = async (cli: Cli, argv: string[] = process.argv.slice(2)): Promise<void> => {
  await runInternal(cli, argv)
}

/**
 * 运行（别名）
 */
export const run = runCli

// ============ 工具函数 ============

/**
 * 配置项类型
 * @internal
 */
export type CfgItem<T extends SchemaCtor> = CliField<T>

/**
 * 创建配置项
 *
 * @example
 * cfg(Number, { description: '服务端口号', alias: 'p' })
 */
export function cfg<T extends SchemaCtor>(
  schema: T,
  config?: Pick<CliField, 'description' | 'alias'>
): CfgItem<T> {
  const item: CfgItem<T> = {
    __type: schema,
  }

  if (config) {
    if (config.description !== undefined) item.description = config.description
    if (config.alias) {
      if (config.alias.length !== 1) {
        throw new Error(`Option alias must be a single character, got '${config.alias}'`)
      }
      // 运行时防御：验证 POSIX 合规性（类型系统已覆盖 TS 用户，此为 JS 用户兜底）
      if (!/^[a-zA-Z0-9]$/.test(config.alias)) {
        throw new Error(
          `Option alias must be a letter or digit (a-z, A-Z, 0-9), got '${config.alias}'`
        )
      }
      if ((config.alias as string) === 'h') {
        throw new Error(`Option alias 'h' is reserved for --help`)
      }
      item.alias = config.alias
    }
  }

  return item
}

// ============ 子模块导出 ============

export { applyEnvBindings } from './env'
export { generateCliHelp, generateCommandHelp, generateGroupHelp, renderHelp } from './help'
export {
  parseArgv,
  resolveAliases,
  normalizeOptions,
  autoParseJson,
  expandLongOption,
} from './parse'
export {
  matchCommand,
  flattenCommands,
  extractAliasMap,
  getCommandGroupsInPath,
  groupToVirtualCommand,
} from './match'
export {
  validateInput,
  prepareArgsInput,
  prepareOptionsInput,
  checkConstraints,
  findSimilarCommands,
  findSimilarOptions,
} from './validate'
export {
  generateCompletion,
  escapeString,
  generateCompletionScript,
  showCompletionHelp,
} from './completion'
export type { ShellType } from './completion'
export { defineContext } from './context'
export type { ContextToken }
export type { MockResult }
export {
  createMockCli,
  createTestCli,
  wait,
  captureError,
  withEnv,
  ExitError,
} from './test-helpers'
