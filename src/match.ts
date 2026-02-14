import { AnyCommand, CommandGroup, CommandOrGroup, MatchResult, CliField } from './types'
import { Struct, StructType, ObjectType } from 'farrow-schema'
import { getSchemaEntries } from './schema-utils'

/**
 * 扁平化所有命令路径
 * 用于帮助信息展示和路径匹配
 */
export const flattenCommands = (
  commands: CommandOrGroup[],
  prefix: string[] = []
): (AnyCommand & { fullPath: string[] })[] => {
  const result: (AnyCommand & { fullPath: string[] })[] = []

  for (const cmd of commands) {
    const fullPath = [...prefix, cmd.path]

    if (cmd.type === 'command') {
      result.push({ ...cmd, fullPath })
    } else if (cmd.type === 'group') {
      // 如果 group 有 defaultCommand，也包含它（fullPath 包含 defaultCommand 的 path）
      if (cmd.defaultCommand) {
        result.push({
          ...cmd.defaultCommand,
          fullPath: [...fullPath, cmd.defaultCommand.path],
        })
      }
      result.push(...flattenCommands(cmd.subCommands, fullPath))
    }
  }

  return result
}

/**
 * 查找命令组
 */
export const findGroup = (commands: CommandOrGroup[], path: string[]): CommandGroup | undefined => {
  let current: CommandOrGroup | undefined

  for (const segment of path) {
    if (!current) {
      current = commands.find((c) => c.path === segment || c.aliases?.includes(segment))
    } else if (current.type === 'group') {
      current = current.subCommands.find((c) => c.path === segment || c.aliases?.includes(segment))
    } else {
      return undefined
    }
  }

  return current?.type === 'group' ? current : undefined
}

/**
 * 匹配命令
 * 从 argv 中识别命令路径，返回匹配结果和剩余参数
 */
export const matchCommand = (commands: CommandOrGroup[], args: string[]): MatchResult => {
  if (args.length === 0) {
    return { type: 'notFound', path: [] }
  }

  // 尝试最长匹配
  for (let depth = Math.min(args.length, 10); depth > 0; depth--) {
    const path = args.slice(0, depth)
    const remainingArgs = args.slice(depth)
    // 根据路径查找精准命令定义
    const result = findCommandAtPath(commands, path)
    if (result.type === 'command') {
      return {
        type: 'command',
        command: result.command,
        pathArgs: path,
        remainingArgs,
      }
    }

    if (result.type === 'group') {
      return {
        type: 'group',
        group: result.group,
        pathArgs: path,
        remainingArgs,
      }
    }
  }

  return { type: 'notFound', path: args }
}

/**
 * 在指定路径查找命令或组
 */
type FindResult =
  | { type: 'command'; command: AnyCommand }
  | { type: 'group'; group: CommandGroup }
  | { type: 'notFound' }

// 逐级路径查找函数，在嵌套的命令结构中定位具体命令或命令组。
const findCommandAtPath = (commands: CommandOrGroup[], path: string[]): FindResult => {
  if (path.length === 0) {
    return { type: 'notFound' }
  }

  let currentCommands = commands
  let current: CommandOrGroup | undefined
  let parentGroup: CommandGroup | undefined

  for (let i = 0; i < path.length; i++) {
    const segment = path[i]
    const isLast = i === path.length - 1

    // 在当前层级的 subCommands 中查找
    current = currentCommands.find((c) => {
      if (c.path === segment) return true
      if (c.aliases?.includes(segment)) return true
      return false
    })

    // subCommands 中未找到，回退检查父组的 defaultCommand
    if (!current && parentGroup?.defaultCommand) {
      const dc = parentGroup.defaultCommand
      if (dc.path === segment || dc.aliases?.includes(segment)) {
        if (isLast) {
          return { type: 'command', command: dc }
        }
        // defaultCommand 是叶子节点，后面不能再有路径
        return { type: 'notFound' }
      }
    }

    if (!current) {
      return { type: 'notFound' }
    }

    if (current.type === 'command') {
      if (isLast) {
        return { type: 'command', command: current }
      }
      return { type: 'notFound' }
    }

    if (current.type === 'group') {
      if (isLast) {
        return { type: 'group', group: current }
      }
      parentGroup = current
      currentCommands = current.subCommands
    }
  }

  return { type: 'notFound' }
}

/**
 * 获取命令路径上的所有命令组（从根到叶子）
 * 用于执行组级钩子
 */
export const getCommandGroupsInPath = (
  commands: CommandOrGroup[],
  path: string[]
): CommandGroup[] => {
  const groups: CommandGroup[] = []
  let currentCommands = commands

  for (const segment of path) {
    const found = currentCommands.find((c) => c.path === segment || c.aliases?.includes(segment))
    if (!found) break

    if (found.type === 'group') {
      groups.push(found)
      currentCommands = found.subCommands
    } else {
      // 找到命令，结束
      break
    }
  }

  return groups
}

/**
 * 从 Schema 提取别名映射
 */
export const extractAliasMap = (
  optionsSchemaCtor: new () => ObjectType | StructType
): Record<string, string> => {
  const aliasMap: Record<string, string> = {}
  const entries = getSchemaEntries(optionsSchemaCtor)

  for (const [key, value] of entries) {
    // 只处理CliField
    if (value && typeof value === 'object' && '__type' in value) {
      const fieldInfo = value as CliField
      if (fieldInfo.alias) {
        if (fieldInfo.alias in aliasMap) {
          console.warn(
            `[farrow-type-cli] Alias conflict: '-${fieldInfo.alias}' is used by both '${aliasMap[fieldInfo.alias]}' and '${key}'. '${key}' wins.`
          )
        }
        aliasMap[fieldInfo.alias] = key
      }
    }
    //跳过FieldDescriptors和其他
  }

  return aliasMap
}

/**
 * 将 CommandGroup 转为虚拟 Command（用于帮助展示和补全）
 */
export const groupToVirtualCommand = (
  group: CommandGroup,
  fullPath: string[]
): AnyCommand & { fullPath: string[] } => ({
  type: 'command',
  path: group.path,
  aliases: group.aliases,
  description: group.description,
  hidden: group.hidden ?? false,
  args: Struct({}),
  options: Struct({}),
  action: () => {},
  fullPath,
})
