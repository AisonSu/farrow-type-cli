import type { Cli, Command, CommandOrGroup, DefineSchemaInput, CliField } from './types'
import { toSchemaCtor, ObjectType, StructType } from 'farrow-schema'
import { isBooleanSchema, getSchemaEntries } from './schema-utils'
import { groupToVirtualCommand } from './match'

export type ShellType = 'bash' | 'zsh' | 'fish'

type OptionInfo = {
  name: string
  shortName?: string
  description?: string
  isBoolean?: boolean
}

type FlattenedCommand = Command<DefineSchemaInput, DefineSchemaInput, DefineSchemaInput> & {
  fullPath: string[]
}

type CommandTreeNode = {
  names: string[]
  command?: FlattenedCommand
  children: Map<string, CommandTreeNode>
  isHidden?: boolean
}

// Shell 转义工具
const escapeShell = (str: string | undefined): string => str?.replace(/["$`\\]/g, '\\$&') ?? ''

const escapePattern = (str: string): string => str.replace(/[|()*?+[\]]/g, '\\$&')

const escapeFish = (str: string | undefined): string =>
  str?.replace(/\\/g, '\\\\').replace(/'/g, "\\'") ?? ''

const safeId = (str: string): string => str.replace(/\W/g, '_').replace(/^\d/, '_$&')

const formatOptString = (opt: OptionInfo): string =>
  '--' + opt.name + (opt.shortName ? ' -' + opt.shortName : '')

// 生成 Shell 补全脚本
export const generateCompletion = (cli: Cli, shell: ShellType): string => {
  switch (shell) {
    case 'bash':
      return generateBash(cli)
    case 'zsh':
      return generateZsh(cli)
    case 'fish':
      return generateFish(cli)
    default:
      throw new Error(`Unsupported shell: ${shell}. Supported: bash, zsh, fish`)
  }
}

// ===== Bash 补全生成 =====

const generateBash = (cli: Cli): string => {
  const cmds = flattenCommands(cli.commands)
  const gOpts = cli.globalOptions ? extractOptions(toSchemaCtor(cli.globalOptions)) : []
  const name = safeId(cli.name)

  const gOptsStr = gOpts.map(formatOptString).join(' ')

  // 收集所有值选项（全局 + 所有命令），用于 bash 深度跳过逻辑
  // bash 脚本在计算命令深度时不知道当前命令，保守地跳过所有值选项是正确行为
  const allValueOpts: OptionInfo[] = [...gOpts]
  const seenOptKeys = new Set(gOpts.flatMap((o) => [o.name, ...(o.shortName ? [o.shortName] : [])]))
  for (const cmd of cmds) {
    for (const opt of extractOptions(toSchemaCtor(cmd.options))) {
      if (!seenOptKeys.has(opt.name)) {
        allValueOpts.push(opt)
        seenOptKeys.add(opt.name)
      }
      if (opt.shortName && !seenOptKeys.has(opt.shortName)) {
        seenOptKeys.add(opt.shortName)
      }
    }
  }

  const valCases = formatBashValueCases(allValueOpts, 'is_value_opt')
  const prevValCases = formatBashValueCases(allValueOpts, 'is_prev_value')
  const topCmds = extractTopCommands(cmds)
  const caseBlocks = bashCases(cmds, gOptsStr)

  return `_${name}_completion() {
  local cur prev words cword split
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev=""
  [[ $COMP_CWORD -gt 0 ]] && prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local global_opts="${gOptsStr}"
  local cmd_words=()
  local i=1

  while [[ $i -lt $COMP_CWORD ]]; do
    local word="\${COMP_WORDS[$i]}"

    if [[ $word == -* ]]; then
      local is_value_opt=false
      case "$word" in
${valCases}
        *) ;;
      esac
      if [[ $is_value_opt == true ]]; then
        ((i+=2))
        continue
      fi
      ((i++))
      continue
    fi

    if [[ $i -gt 1 ]]; then
      local prev_word="\${COMP_WORDS[$i-1]}"
      local is_prev_value=false
      case "$prev_word" in
${prevValCases}
        *) ;;
      esac
      if [[ $is_prev_value == true ]]; then
        ((i++))
        continue
      fi
    fi

    cmd_words+=("$word")
    ((i++))
  done

  local cmd_depth=\${#cmd_words[@]}

  case "$cmd_depth" in
    0)
      COMPREPLY=( $(compgen -W "${topCmds}${gOptsStr ? ' ${global_opts}' : ''}" -- "\${cur}") )
      ;;
${caseBlocks}
  esac
  return 0
}

complete -F _${name}_completion ${cli.name}
`
}

const formatBashValueCases = (opts: OptionInfo[], varName: string): string =>
  opts
    .filter((opt) => !opt.isBoolean)
    .flatMap((opt) => {
      const patterns = ['--' + opt.name]
      if (opt.shortName) patterns.push('-' + opt.shortName)
      return patterns.map((p) => `        ${p}) ${varName}=true ;;`)
    })
    .join('\n')

const extractTopCommands = (cmds: FlattenedCommand[]): string =>
  cmds
    .filter((c) => c.fullPath.length === 1 && !c.hidden)
    .flatMap((c) => [c.fullPath[0], ...(c.aliases || [])])
    .map(escapeShell)
    .join(' ')

const formatChildNames = (cmds: FlattenedCommand[]): string =>
  cmds
    .filter((c) => !c.hidden)
    .flatMap((c) => [c.fullPath[c.fullPath.length - 1], ...(c.aliases || [])])
    .map(escapeShell)
    .join(' ')

const extractCmdOptions = (cmd: FlattenedCommand): string =>
  extractOptions(toSchemaCtor(cmd.options)).map(formatOptString).map(escapeShell).join(' ')

const bashCases = (cmds: FlattenedCommand[], gOptsStr: string): string => {
  if (!cmds.length) return ''

  const byDepth = groupBy(cmds, (cmd) => cmd.fullPath.length)
  const depths = Object.keys(byDepth)
    .map(Number)
    .filter((d) => d > 0)
    .sort((a, b) => a - b)

  return depths
    .map((depth) => {
      const atDepth = byDepth[depth]
      const byParent = groupBy(atDepth, (cmd) => cmd.fullPath.slice(0, -1).join(' '))
      const parents = Object.keys(byParent)
      const needsNestedCase = parents.length > 1

      let body: string
      if (needsNestedCase) {
        const parentCases = parents
          .map((parent) => {
            const cmds = byParent[parent]
            const names = formatChildNames(cmds)
            const cmdOpts = cmds.map(extractCmdOptions).filter(Boolean).join(' ')
            const allOpts = [gOptsStr, cmdOpts].filter(Boolean).join(' ')
            const cond = parent === '' ? '*' : '"' + escapeShell(parent) + '"'
            return `        ${cond})\n          COMPREPLY=( $(compgen -W "${names}${allOpts ? ' ' + allOpts : ''}" -- "\${cur}") )\n          ;;`
          })
          .join('\n')
        body =
          '      case "${cmd_words[*]:0:$((cmd_depth - 1))}" in\n' + parentCases + '\n      esac'
      } else {
        const childNames = formatChildNames(atDepth)
        const cmdOpts = atDepth.map(extractCmdOptions).filter(Boolean).join(' ')
        const allOpts = [gOptsStr, cmdOpts].filter(Boolean).join(' ')
        body =
          '      COMPREPLY=( $(compgen -W "' +
          childNames +
          (allOpts ? ' ' + allOpts : '') +
          '" -- "${cur}") )'
      }

      return '    ' + depth + ')\n' + body + '\n      ;;'
    })
    .join('\n')
}

// ===== Zsh 补全生成 =====

const generateZsh = (cli: Cli): string => {
  const cmds = flattenCommands(cli.commands)
  const gOpts = cli.globalOptions ? extractOptions(toSchemaCtor(cli.globalOptions)) : []
  const tree = buildTree(cmds)
  const name = safeId(cli.name)

  return `#compdef ${cli.name}

_${name}() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a global_opts
  global_opts=(
${formatZshOpts(gOpts, 4)}
  )

  _arguments -C \\
    : \\
    "\${global_opts[@]}" \\
    '1: :->command' \\
    '*:: :->args'

  case "$state" in
    command)
      local -a commands
      commands=(
${formatZshTopCommands(cmds)}
      )
      _describe -t commands 'commands' commands
      ;;
    args)
      _${name}_dispatch "\${line[@]}"
      ;;
  esac
}

_${name}_dispatch() {
  [[ $# -lt 1 ]] && return 1
  local -a cmd_path=("$@")
  local -a global_opts
  global_opts=(
${formatZshOpts(gOpts, 4)}
  )
  shift
  local cmd="\${cmd_path[1]}"

  case "$cmd" in
${zshDispatcher(tree, name)}
  esac
}
`
}

const formatZshOpt = (opt: OptionInfo, indent: number): string => {
  const sp = ' '.repeat(indent)
  const desc = escapeShell(opt.description)
  const long = "'--" + opt.name + (desc ? '[' + desc + ']' : '') + "'"
  const short = opt.shortName ? " '-" + opt.shortName + '[' + (desc || opt.name) + "]'" : ''
  return sp + long + short
}

const formatZshOpts = (opts: OptionInfo[], indent: number): string =>
  opts.map((opt) => formatZshOpt(opt, indent)).join('\n')

const formatZshTopCommands = (cmds: FlattenedCommand[]): string =>
  cmds
    .filter((c) => c.fullPath.length === 1 && !c.hidden)
    .map((c) => {
      const aliasStr = c.aliases?.map(escapeShell).join(' ') || ''
      const desc = escapeShell(c.description)
      return `        '${c.fullPath[0]}${aliasStr ? '(' + aliasStr + ')' : ''}${desc ? ':' + desc : ''}'`
    })
    .join('\n')

const zshDispatcher = (tree: Map<string, CommandTreeNode>, name: string): string => {
  const cases: string[] = []

  for (const [node, names] of nodeNames(tree)) {
    if (node.isHidden) continue

    const allNames = names.map(escapePattern).join('|')
    const lines: string[] = ['    ' + allNames + ')']

    if (node.children.size) {
      const opts = extractNodeOptions(node)
      const optsStr = formatZshOpts(opts, 8)
      if (optsStr) {
        lines.push(
          '      local -a parent_opts',
          '      parent_opts=(',
          optsStr,
          '      )',
          '      _arguments "${parent_opts[@]}"'
        )
      }
      lines.push(
        '      [[ $# -ge 1 ]] && { _' + name + '_dispatch "$1" "${@:2}"; return; }',
        generateNestedZshCases(node.children, name, 6)
      )
    } else if (node.command) {
      const opts = extractOptions(toSchemaCtor(node.command.options))
      lines.push(formatZshLeafArgs(opts, 6))
    }

    lines.push('      ;;')
    cases.push(lines.join('\n'))
  }

  return cases.join('\n')
}

const generateNestedZshCases = (
  children: Map<string, CommandTreeNode>,
  name: string,
  indent: number,
  depth: number = 2
): string => {
  if (!children.size) return ''

  const sp = ' '.repeat(indent)
  const lines: string[] = [sp + `case "\${cmd_path[${depth}]:-}" in`]

  for (const [node, names] of nodeNames(children)) {
    const allNames = names.map(escapePattern).join('|')
    const childLines: string[] = [sp + '  ' + allNames + ')']

    if (node.children.size) {
      const opts = extractNodeOptions(node)
      const optsStr = formatZshOpts(opts, indent + 4)
      if (optsStr) {
        childLines.push(
          '      local -a parent_opts',
          '      parent_opts=(',
          optsStr,
          '      )',
          '      _arguments "${parent_opts[@]}"'
        )
      }
      childLines.push(
        generateNestedZshCases(node.children, name, indent + 4, depth + 1),
        sp + '    _arguments "${global_opts[@]}"'
      )
    } else if (node.command) {
      const opts = extractOptions(toSchemaCtor(node.command.options))
      childLines.push(formatZshLeafArgs(opts, indent + 4))
    }

    childLines.push(sp + '    ;;')
    lines.push(childLines.join('\n'))
  }

  // 添加空字符串分支：当用户还未输入子命令时，显示可用子命令列表
  const subCmdEntries: string[] = []
  for (const [node, names] of nodeNames(children)) {
    if (node.isHidden) continue
    const primary = names[0]
    const desc = escapeShell(node.command?.description)
    subCmdEntries.push(sp + `      '${escapeShell(primary)}${desc ? ':' + desc : ''}'`)
  }
  if (subCmdEntries.length > 0) {
    lines.push(sp + "  '')")
    lines.push(sp + '    local -a sub_commands')
    lines.push(sp + '    sub_commands=(')
    lines.push(subCmdEntries.join('\n'))
    lines.push(sp + '    )')
    lines.push(sp + "    _describe -t commands 'subcommands' sub_commands")
    lines.push(sp + '    ;;')
  }

  lines.push(sp + 'esac')
  return lines.join('\n')
}

const formatZshLeafArgs = (opts: OptionInfo[], indent: number): string => {
  const sp = ' '.repeat(indent)
  if (!opts.length) {
    return sp + '_arguments "${global_opts[@]}"'
  }
  return [
    sp + 'local -a opts',
    sp + 'opts=(',
    formatZshOpts(opts, indent + 2),
    sp + ')',
    sp + '_arguments "${opts[@]}" "${global_opts[@]}"',
  ].join('\n')
}

// ===== Fish 补全生成 =====

const generateFish = (cli: Cli): string => {
  const cmds = flattenCommands(cli.commands)
  const gOpts = cli.globalOptions ? extractOptions(toSchemaCtor(cli.globalOptions)) : []
  const tree = buildTree(cmds)

  const gOptsLines = gOpts
    .map((opt) => {
      const short = opt.shortName ? ' -s ' + opt.shortName : ''
      const desc = opt.description ? " -d '" + escapeFish(opt.description) + "'" : ''
      return 'complete -c ' + cli.name + short + ' -l ' + opt.name + desc
    })
    .join('\n')

  return [
    '# ' + cli.name + ' completion for fish shell',
    '',
    gOptsLines,
    fishCompletions(cli.name, tree, []),
  ].join('\n')
}

const fishCompletions = (
  cli: string,
  tree: Map<string, CommandTreeNode>,
  path: string[]
): string => {
  const lines: string[] = []

  for (const [node, names] of nodeNames(tree)) {
    if (node.isHidden) continue

    const primaryName = names[0]
    const currPath = [...path, primaryName]

    // 命令补全：条件是"父路径已匹配，当前位置待输入"
    const cmdCond = fishParentCond(path)
    const desc = escapeFish(node.command?.description)
    lines.push(
      'complete -c ' +
        cli +
        " -f -n '" +
        cmdCond +
        "' -a '" +
        escapeFish(primaryName) +
        "'" +
        (desc ? " -d '" + desc + "'" : '')
    )

    // 选项补全：条件是"当前命令（含别名）已被输入"
    if (node.command) {
      const optCond = fishSeenCond(path, names)
      const opts = extractOptions(toSchemaCtor(node.command.options))
      for (const opt of opts) {
        const short = opt.shortName ? ' -s ' + opt.shortName : ''
        const optDesc = opt.description ? " -d '" + escapeFish(opt.description) + "'" : ''
        lines.push(
          'complete -c ' + cli + " -n '" + optCond + "'" + short + ' -l ' + opt.name + optDesc
        )
      }
    }

    if (node.children.size) {
      lines.push(fishCompletions(cli, node.children, currPath))
    }
  }

  return lines.join('\n')
}

/**
 * Fish 条件：父路径已匹配（用于显示命令补全候选）
 */
const fishParentCond = (parent: string[]): string => {
  if (!parent.length) {
    return '__fish_use_subcommand'
  }
  const tests = parent.map(
    (s, i) => 'test (commandline -opc)[' + (i + 2) + "] = '" + escapeFish(s) + "'"
  )
  return tests.join('; and ')
}

/**
 * Fish 条件：当前命令（含别名）已被输入（用于显示选项补全）
 */
const fishSeenCond = (parent: string[], names: string[]): string => {
  const depth = parent.length + 2
  const parentTests = parent.map(
    (s, i) => 'test (commandline -opc)[' + (i + 2) + "] = '" + escapeFish(s) + "'"
  )
  return names
    .map((n) => {
      const allTests = [
        ...parentTests,
        'test (commandline -opc)[' + depth + "] = '" + escapeFish(n) + "'",
      ]
      return '(' + allTests.join('; and ') + ')'
    })
    .join('; or ')
}

// ===== 共享辅助函数 =====

// 构建命令树
const buildTree = (cmds: FlattenedCommand[]): Map<string, CommandTreeNode> => {
  const root = new Map<string, CommandTreeNode>()

  for (const cmd of cmds) {
    let curr = root

    for (let i = 0; i < cmd.fullPath.length; i++) {
      const segment = cmd.fullPath[i]
      const isLast = i === cmd.fullPath.length - 1

      if (!curr.has(segment)) {
        curr.set(segment, { names: [], children: new Map() })
      }
      const node = curr.get(segment)!

      if (isLast) {
        node.command = cmd
        node.isHidden = cmd.hidden
        node.names.push(segment)
        for (const alias of cmd.aliases || []) {
          node.names.push(alias)
          if (!curr.has(alias)) curr.set(alias, node)
        }
      }

      curr = node.children
    }
  }

  return root
}

// 提取节点的选项（如果有 command）
const extractNodeOptions = (node: CommandTreeNode): OptionInfo[] => {
  if (!node.command) return []
  return extractOptions(toSchemaCtor(node.command.options))
}

const nodeNames = (tree: Map<string, CommandTreeNode>): Array<[CommandTreeNode, string[]]> => {
  const map = new Map<CommandTreeNode, string[]>()
  tree.forEach((node, name) => {
    if (!map.has(node)) map.set(node, [])
    map.get(node)!.push(name)
  })
  return Array.from(map.entries())
}

const groupBy = <T, K extends string | number>(arr: T[], keyFn: (item: T) => K): Record<K, T[]> => {
  const groups = {} as Record<K, T[]>
  for (const item of arr) {
    const key = keyFn(item)
    groups[key] ??= []
    groups[key].push(item)
  }
  return groups
}

// 扁平化命令列表
const flattenCommands = (
  cmds: CommandOrGroup[],
  prefix: string[] = [],
  seen = new Map<string, Set<string>>()
): FlattenedCommand[] => {
  const result: FlattenedCommand[] = []
  const key = prefix.join(' ') || '__root__'

  seen.set(key, seen.get(key) ?? new Set())
  const localSeen = seen.get(key)!

  // 检测命名冲突
  for (const cmd of cmds) {
    const pathKey = [...prefix, cmd.path].join(' ')
    if (localSeen.has(pathKey)) {
      console.warn(`[completion.ts] Duplicate command: "${pathKey}"`)
    } else {
      localSeen.add(pathKey)
    }

    for (const alias of cmd.aliases || []) {
      const aliasKey = [...prefix, alias].join(' ')
      if (localSeen.has(aliasKey)) {
        console.warn(`[completion.ts] Alias conflicts: "${alias}" at "${aliasKey}"`)
      } else {
        localSeen.add(aliasKey)
      }
    }
  }

  for (const cmd of cmds) {
    const fullPath = [...prefix, cmd.path]

    if (cmd.type === 'command') {
      result.push({ ...cmd, fullPath } as FlattenedCommand)
    } else if (cmd.type === 'group') {
      if (cmd.defaultCommand) {
        // 添加 group 虚拟命令（用于顶层补全）
        result.push(groupToVirtualCommand(cmd, fullPath) as FlattenedCommand)
        // 添加 defaultCommand（完整路径，用于子命令补全）
        result.push({
          ...cmd.defaultCommand,
          fullPath: [...fullPath, cmd.defaultCommand.path],
          // 合并 defaultCommand 和 group 的别名
          aliases: [...(cmd.defaultCommand.aliases || []), ...(cmd.aliases || [])],
        } as FlattenedCommand)
      } else {
        // 无 defaultCommand：用虚拟命令占位
        result.push(groupToVirtualCommand(cmd, fullPath) as FlattenedCommand)
      }
      result.push(...flattenCommands(cmd.subCommands, fullPath, seen))
    }
  }

  return result
}

// 从 Schema 提取选项信息
const extractOptions = (optionsSchemaCtor: new () => ObjectType | StructType): OptionInfo[] => {
  try {
    const entries = getSchemaEntries(optionsSchemaCtor)
    return entries.map(([fieldName, fieldValue]) => {
      const field = fieldValue as CliField
      if (field && typeof field === 'object' && '__type' in field) {
        return {
          name: fieldName,
          shortName: field.alias,
          description: field.description,
          isBoolean: isBooleanSchema(field.__type),
        }
      }
      if (typeof fieldValue === 'function') {
        return { name: fieldName, isBoolean: isBooleanSchema(fieldValue) }
      }
      return { name: fieldName, isBoolean: false }
    })
  } catch {
    return []
  }
}

// Public API
export const escapeString = (str: string): string => str.replace(/["$`\\]/g, '\\$&')

export const generateCompletionScript = (
  cli: Cli,
  shell: ShellType,
  commandName?: string
): string => {
  if (!commandName) return generateCompletion(cli, shell)
  const cliCopy = { ...cli, name: commandName }
  return generateCompletion(cliCopy, shell)
}

export const showCompletionHelp = (cliName: string): string =>
  `Shell Completion Setup for ${cliName}
================================

Bash:
  Add to ~/.bashrc:
    source <(${cliName} completion bash)

Zsh:
  Add to ~/.zshrc:
    source <(${cliName} completion zsh)

Fish:
  Add to ~/.config/fish/completions/${cliName}.fish:
    ${cliName} completion fish | source

Available: bash, zsh, fish`.trim()
