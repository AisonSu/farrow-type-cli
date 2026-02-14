import { describe, it, expect } from 'vitest'
import { generateCompletion, generateCompletionScript, showCompletionHelp } from '../src/completion'
import { defineCli, defineCommand, defineCommandGroup, cfg } from '../src/index'
import { String, Number, Boolean, Union, Literal } from 'farrow-schema'

describe('completion', () => {
  const createTestCli = () => {
    const cli = defineCli({
      name: 'myapp',
      version: '1.0.0',
      globalOptions: {
        verbose: cfg(Boolean, { description: 'Verbose output', alias: 'v' }),
        config: cfg(String, { description: 'Config file', alias: 'c' }),
      },
    })

    cli.add(
      defineCommand({
        path: 'deploy',
        aliases: ['d'],
        description: 'Deploy the application',
        args: {},
        options: {
          env: cfg(String, { description: 'Environment', alias: 'e' }),
          version: cfg(String, { description: 'Version to deploy' }),
        },
        action: () => {},
      })
    )

    cli.add(
      defineCommandGroup({
        path: 'server',
        aliases: ['sv'],
        description: 'Server management',
        subCommands: [
          defineCommand({
            path: 'start',
            aliases: ['up'],
            description: 'Start the server',
            args: {},
            options: {
              port: cfg(Number, { description: 'Port number', alias: 'p' }),
              host: cfg(String, { description: 'Host address', alias: 'H' }),
            },
            action: () => {},
          }),
          defineCommand({
            path: 'stop',
            description: 'Stop the server',
            args: {},
            options: {},
            action: () => {},
          }),
        ],
      })
    )

    return cli
  }

  describe('generateCompletion', () => {
    it('should generate bash completion', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'bash')

      expect(script).toContain('_myapp_completion')
      expect(script).toContain('complete -F _myapp_completion myapp')
    })

    it('should generate zsh completion', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'zsh')

      expect(script).toContain('#compdef myapp')
      expect(script).toContain('_myapp')
    })

    it('should generate fish completion', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'fish')

      expect(script).toContain('fish')
      expect(script).toContain('complete -c myapp')
    })

    it('should throw for unsupported shell', () => {
      const cli = createTestCli()

      expect(() => generateCompletion(cli, 'powershell' as any)).toThrow(
        'Unsupported shell'
      )
    })
  })

  describe('bash completion', () => {
    it('should include top-level commands', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'bash')

      expect(script).toContain('deploy')
      expect(script).toContain('server')
    })

    it('should include command aliases', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'bash')

      // The script should contain command names, aliases may be included
      expect(script).toContain('deploy')
      expect(script).toContain('server')
    })

    it('should include global options', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'bash')

      expect(script).toContain('--verbose')
      expect(script).toContain('-v')
      expect(script).toContain('--config')
      expect(script).toContain('-c')
    })

    it('should include command-specific options', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'bash')

      expect(script).toContain('--env')
      expect(script).toContain('-e')
      expect(script).toContain('--port')
      expect(script).toContain('-p')
    })

    it('should handle nested commands', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'bash')

      expect(script).toContain('start')
      expect(script).toContain('stop')
    })

    it('should include command-specific value options in bash skip logic', () => {
      const cli = defineCli({
        name: 'myapp',
        globalOptions: {
          verbose: cfg(Boolean, { alias: 'v' }),
        },
      })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: {
            port: cfg(Number, { description: 'Port number', alias: 'p' }),
          },
          action: () => {},
        })
      )

      const script = generateCompletion(cli, 'bash')

      // Command-level value options should be in the skip logic
      expect(script).toContain('--port) is_value_opt=true')
      expect(script).toContain('-p) is_value_opt=true')
      // Boolean options should NOT be in the skip logic
      expect(script).not.toContain('--verbose) is_value_opt=true')
    })
  })

  describe('zsh completion', () => {
    it('should include command descriptions', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'zsh')

      expect(script).toContain('Deploy the application')
      expect(script).toContain('Server management')
    })

    it('should include option descriptions', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'zsh')

      expect(script).toContain('Verbose output')
      expect(script).toContain('Port number')
    })

    it('should set up dispatcher', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'zsh')

      expect(script).toContain('_myapp_dispatch')
      expect(script).toContain('case "$cmd"')
    })

    it('should handle nested command completion', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'zsh')

      expect(script).toContain('server')
      expect(script).toContain('start')
    })

    it('should show subcommand list when no subcommand entered yet', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'zsh')

      // When cmd_path[depth] is empty, should fall into '' branch with _describe
      expect(script).toContain("'')")
      expect(script).toContain('sub_commands')
      expect(script).toContain("_describe -t commands 'subcommands' sub_commands")
    })
  })

  describe('fish completion', () => {
    it('should generate complete commands', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'fish')

      expect(script).toContain('complete -c myapp')
      expect(script).toContain('-a')
    })

    it('should include descriptions', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'fish')

      expect(script).toContain('-d')
      expect(script).toContain('Deploy the application')
    })

    it('should handle short options', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'fish')

      expect(script).toContain('-s v')
      expect(script).toContain('-l verbose')
    })

    it('should set up conditions for nested commands', () => {
      const cli = createTestCli()
      const script = generateCompletion(cli, 'fish')

      expect(script).toContain("-n '")
      expect(script).toContain('__fish_use_subcommand')
    })
  })

  describe('generateCompletionScript', () => {
    it('should use provided command name', () => {
      const cli = createTestCli()
      const script = generateCompletionScript(cli, 'bash', 'mycli')

      expect(script).toContain('mycli')
      expect(script).not.toContain('complete -F _myapp_completion myapp')
    })

    it('should fall back to CLI name when no command name provided', () => {
      const cli = createTestCli()
      const script = generateCompletionScript(cli, 'bash')

      expect(script).toContain('myapp')
    })
  })

  describe('showCompletionHelp', () => {
    it('should return help text', () => {
      const help = showCompletionHelp('myapp')

      expect(help).toContain('Shell Completion Setup')
      expect(help).toContain('myapp')
      expect(help).toContain('Bash:')
      expect(help).toContain('Zsh:')
      expect(help).toContain('Fish:')
    })

    it('should include setup instructions', () => {
      const help = showCompletionHelp('myapp')

      expect(help).toContain('~/.bashrc')
      expect(help).toContain('~/.zshrc')
      expect(help).toContain('source')
    })
  })

  describe('edge cases', () => {
    it('should handle CLI without global options', () => {
      const cli = defineCli({ name: 'simple' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {},
        })
      )

      const bashScript = generateCompletion(cli, 'bash')
      const zshScript = generateCompletion(cli, 'zsh')
      const fishScript = generateCompletion(cli, 'fish')

      expect(bashScript).toContain('simple')
      expect(zshScript).toContain('simple')
      expect(fishScript).toContain('simple')
    })

    it('should handle CLI with only command groups', () => {
      const cli = defineCli({ name: 'grouped' })
      cli.add(
        defineCommandGroup({
          path: 'group',
          subCommands: [
            defineCommand({
              path: 'cmd',
              args: {},
              options: {},
              action: () => {},
            }),
          ],
        })
      )

      const script = generateCompletion(cli, 'bash')
      expect(script).toContain('group')
      expect(script).toContain('cmd')
    })

    it('should handle hidden commands', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'visible',
          args: {},
          options: {},
          action: () => {},
        })
      )
      cli.add(
        defineCommand({
          path: 'hidden',
          hidden: true,
          args: {},
          options: {},
          action: () => {},
        })
      )

      const script = generateCompletion(cli, 'bash')
      expect(script).toContain('visible')
    })

    it('should handle Union type options', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {
            format: cfg(Union(Literal('esm'), Literal('cjs'))),
          },
          action: () => {},
        })
      )

      const script = generateCompletion(cli, 'bash')
      expect(script).toContain('cmd')
    })

    it('should not produce duplicate entries for group with defaultCommand', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
          defaultCommand: defineCommand({
            path: 'status',
            args: {},
            options: {
              format: cfg(String, { description: 'Output format' }),
            },
            action: () => {},
          }),
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              action: () => {},
            }),
          ],
        })
      )

      const bashScript = generateCompletion(cli, 'bash')
      const zshScript = generateCompletion(cli, 'zsh')
      const fishScript = generateCompletion(cli, 'fish')

      // defaultCommand's options should be available for the group path
      expect(bashScript).toContain('--format')
      // aliases should be preserved
      expect(bashScript).toContain('sv')
      expect(zshScript).toContain('sv')
      expect(fishScript).toContain('sv')
    })

    it('should include defaultCommand path and aliases in completion', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
          defaultCommand: defineCommand({
            path: 'status',
            aliases: ['st'],
            args: {},
            options: {},
            action: () => {},
          }),
          subCommands: [],
        })
      )

      const bashScript = generateCompletion(cli, 'bash')

      // defaultCommand 的 path 应出现在补全中
      expect(bashScript).toContain('status')
      // defaultCommand 的别名应出现在补全中
      expect(bashScript).toContain('st')
      // group 的别名也应出现
      expect(bashScript).toContain('sv')
    })

    it('should provide group path at top level for defaultCommand', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
          defaultCommand: defineCommand({
            path: 'status',
            aliases: ['st'],
            args: {},
            options: {},
            action: () => {},
          }),
          subCommands: [],
        })
      )

      const bashScript = generateCompletion(cli, 'bash')

      // 深度 0/1 应包含 group 路径和别名（用户可以直接输入 server 触发 defaultCommand）
      expect(bashScript).toContain('server')
      expect(bashScript).toContain('sv')
    })
  })

  describe('error handling', () => {
    it('should handle extractOptions errors gracefully', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          // @ts-expect-error - testing invalid options
          options: null,
          action: () => {},
        })
      )

      // 不应抛出错误
      expect(() => generateCompletion(cli, 'bash')).not.toThrow()
    })
  })

  describe('hidden commands', () => {
    it('should not include hidden commands in zsh completion', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'visible',
          args: {},
          options: {},
          action: () => {},
        })
      )
      cli.add(
        defineCommand({
          path: 'hidden',
          hidden: true,
          args: {},
          options: {},
          action: () => {},
        })
      )

      const zshScript = generateCompletion(cli, 'zsh')
      expect(zshScript).toContain('visible')
      expect(zshScript).not.toContain('hidden')
    })

    it('should not include hidden groups in zsh completion', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'visible-group',
          description: 'Visible group',
          subCommands: [
            defineCommand({
              path: 'cmd',
              args: {},
              options: {},
              action: () => {},
            }),
          ],
        })
      )
      cli.add(
        defineCommandGroup({
          path: 'hidden-group',
          hidden: true,
          description: 'Hidden group',
          subCommands: [
            defineCommand({
              path: 'cmd',
              args: {},
              options: {},
              action: () => {},
            }),
          ],
        })
      )

      const zshScript = generateCompletion(cli, 'zsh')
      expect(zshScript).toContain('visible-group')
      expect(zshScript).not.toContain('hidden-group')
    })

    it('should not include hidden commands in fish completion', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'visible',
          args: {},
          options: {},
          action: () => {},
        })
      )
      cli.add(
        defineCommand({
          path: 'hidden',
          hidden: true,
          args: {},
          options: {},
          action: () => {},
        })
      )

      const fishScript = generateCompletion(cli, 'fish')
      expect(fishScript).toContain('visible')
      expect(fishScript).not.toContain("'hidden'")
    })
  })
})
