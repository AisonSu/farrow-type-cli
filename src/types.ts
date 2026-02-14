/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FieldDescriptors,
  ObjectType,
  SchemaCtor,
  ShallowPrettier,
  StructType,
  TypeOf,
  TypeOfFieldDescriptors,
} from 'farrow-schema'
import type { ContextToken } from './context'

/**
 * POSIX 短选项字符
 * 遵循 POSIX 标准，短选项必须是单个字母或数字字符
 * 这确保了 -abc 组合短选项的正确解析行为
 */
export type ShortOptionChar =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'

/**
 * CLI 字段描述符 - 扩展 farrow-schema 的 FieldInfo，添加 CLI 特有的元数据
 */
export type CliField<T extends SchemaCtor = SchemaCtor> = {
  __type: T
  /** 短选项别名，必须是单个字母或数字（POSIX 标准），如 'p' 表示 -p */
  alias?: ShortOptionChar
  /** 字段描述，用于帮助文档 */
  description?: string
}

export type OptionsSchemaFields = [string, FieldDescriptors | SchemaCtor | CliField][]

export type DefineSchemaInput = (new () => ObjectType | StructType) | FieldDescriptors
export type TypeOfDefineSchemaInput<T extends DefineSchemaInput> = T extends FieldDescriptors
  ? ShallowPrettier<TypeOfFieldDescriptors<T>>
  : T extends SchemaCtor
    ? TypeOf<T>
    : never

// ============ 命令定义类型 ============

export type CommandPath = string

/**
 * Hook 输入参数 - 包含运行时解析的命令参数和选项
 * 注意：这不是 ALS Context，如需使用 ALS Context 请通过 defineContext() 创建
 */
export type HookInput<TArgs = any, TOptions = any> = {
  args: TArgs
  options: TOptions
  command: AnyCommand
  fullPath: string[]
}

/**
 * Group/CLI 级 Hook 输入参数 - 不包含 args/options，数据通过 Context 传递
 */
export type GroupHookInput = {
  command: AnyCommand
  fullPath: string[]
}

export type HookResult = { type: 'continue' } | { type: 'abort'; reason?: string }

/** Group/CLI 级 Hook 返回值 */
export type GroupHookResult = { type: 'continue' } | { type: 'abort'; reason?: string }

export type PreActionHook<TArgs = any, TOptions = any> = (
  input: HookInput<TArgs, TOptions>
) => HookResult | Promise<HookResult>

/** Action 执行结果，传递给 postAction 钩子 */
export type ActionResult = { success: boolean; error?: Error; aborted?: boolean }

export type PostActionHook<TArgs = any, TOptions = any> = (
  input: HookInput<TArgs, TOptions>,
  result: ActionResult
) => void | Promise<void>

/** Group/CLI 级 preAction Hook（无 args/options，数据通过 Context 传递） */
export type GroupPreActionHook = (
  input: GroupHookInput
) => GroupHookResult | Promise<GroupHookResult>

/** Group/CLI 级 postAction Hook（无 args/options，数据通过 Context 传递） */
export type GroupPostActionHook = (
  input: GroupHookInput,
  result: ActionResult
) => void | Promise<void>

// 约束定义：声明式或函数式，带类型参数
export type ConstraintDef<TOptions = Record<string, unknown>> =
  | { type: 'exclusive'; options: (keyof TOptions)[]; description?: string }
  | {
      type: 'dependsOn'
      option: keyof TOptions
      requires: (keyof TOptions)[]
      description?: string
    }
  | { type: 'requiredTogether'; options: (keyof TOptions)[]; description?: string }
  | {
      type: 'custom'
      description: string
      check: (options: TOptions) => boolean
    }

// ============ 环境变量绑定类型 ============

export type EnvBinding<TOptionType = unknown> = {
  /** 环境变量名后缀（配置 prefix 时会自动添加前缀） */
  envName: string
  /** 转换函数（返回值类型必须与选项类型一致） */
  transform?: (value: string) => TOptionType
}

export type EnvOptions<TOptions = Record<string, unknown>> = {
  prefix?: string
  bindings?: {
    [K in keyof TOptions]?: string | EnvBinding<TOptions[K]>
  }
}

export type Command<
  TArgs extends DefineSchemaInput,
  TOptions extends DefineSchemaInput,
  TRest extends DefineSchemaInput | undefined = undefined,
> = {
  type: 'command'
  path: CommandPath
  aliases?: string[]
  hidden?: boolean
  description?: string
  args: TArgs
  options: TOptions
  rest?: TRest
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
  action: [TRest] extends [DefineSchemaInput]
    ? (
        args: TypeOfDefineSchemaInput<TArgs>,
        options: TypeOfDefineSchemaInput<TOptions>,
        rest: TypeOfDefineSchemaInput<Extract<TRest, DefineSchemaInput>>[]
      ) => void | Promise<void>
    : (
        args: TypeOfDefineSchemaInput<TArgs>,
        options: TypeOfDefineSchemaInput<TOptions>
      ) => void | Promise<void>
}

export type CommandGroup = {
  type: 'group'
  path: CommandPath
  aliases?: string[]
  hidden?: boolean
  description?: string
  subCommands: (AnyCommand | CommandGroup)[]
  defaultCommand?: AnyCommand
  hooks?: {
    preAction?: GroupPreActionHook | GroupPreActionHook[]
    postAction?: GroupPostActionHook | GroupPostActionHook[]
  }
}

export type AnyCommand = Command<any, any, any>

export type CommandOrGroup = AnyCommand | CommandGroup

// ============ CLI 定义类型 ============

export type Cli<
  TGlobalOptions extends DefineSchemaInput | undefined = DefineSchemaInput | undefined,
> = {
  name: string
  version?: string
  description?: string
  globalOptions?: TGlobalOptions
  globalOptionsContext: ContextToken<
    TGlobalOptions extends DefineSchemaInput ? TypeOfDefineSchemaInput<TGlobalOptions> : unknown
  >
  commands: CommandOrGroup[]
  hooks?: {
    preAction?: GroupPreActionHook | GroupPreActionHook[]
    postAction?: GroupPostActionHook | GroupPostActionHook[]
  }
  env?: TGlobalOptions extends DefineSchemaInput
    ? EnvOptions<TypeOfDefineSchemaInput<TGlobalOptions>>
    : never
}

// ============ 解析配置类型 ============

export type ParseOptions = {
  /** 已知长选项列表，用于 GNU 缩写扩展 */
  knownOptions?: string[]
  /** 短选项定义，用于 POSIX 选项合并带值 */
  shortOptions?: Record<string, { takesValue?: boolean }>
  /** 已知布尔长选项集合，这些选项不会消费下一个参数作为值 */
  booleanOptions?: Set<string>
}

// ============ 解析结果类型 ============

export type ParsedArgv = {
  positionals: string[]
  options: Record<string, string | boolean | (string | boolean)[]>
  raw: string[]
}

export type MatchResult =
  | {
      type: 'command'
      command: AnyCommand
      pathArgs: string[]
      remainingArgs: string[]
    }
  | { type: 'group'; group: CommandGroup; pathArgs: string[]; remainingArgs: string[] }
  | { type: 'notFound'; path: string[]; suggestions?: string[] }

export type ValidationSuccess<T> = { success: true; value: T }
export type ValidationFailure = { success: false; errors: string[] }
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

// ============ 帮助信息类型 ============

export type ArgInfo = {
  name: string
  type: string
  required: boolean
  description?: string
  rest?: boolean
}

export type OptionInfo = {
  name: string
  shortName?: string
  type: string
  required: boolean
  description?: string
  global?: boolean
  /** 是否为布尔 flag（不需要显式传值） */
  isFlag?: boolean
}

export type CommandInfo = {
  path: string[]
  aliases?: string[]
  description?: string
  args: ArgInfo[]
  options: OptionInfo[]
  constraints?: ConstraintDef<any>[]
}

export type HelpContent = {
  name: string
  version?: string
  description?: string
  usage: string
  commands?: CommandInfo[]
  currentCommand?: CommandInfo
  globalOptions?: OptionInfo[]
}
