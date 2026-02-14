import { describe, it, expect } from 'vitest'
import {
  generateCliHelp,
  generateCommandHelp,
  generateGroupHelp,
  renderHelp,
} from '../src/help'
import { defineCli, defineCommand, defineCommandGroup, cfg } from '../src/index'
import { String, Number, Boolean, List, Optional, Struct, Union, Literal } from 'farrow-schema'

describe('help', () => {
  describe('generateCliHelp', () => {
    it('should generate basic CLI help', () => {
      const cli = defineCli({
        name: 'myapp',
        version: '1.0.0',
        description: 'My test application',
      })

      cli.add(
        defineCommand({
          path: 'deploy',
          description: 'Deploy the application',
          args: {},
          options: {},
          action: () => {},
        })
      )

      const help = generateCliHelp(cli)

      expect(help.name).toBe('myapp')
      expect(help.version).toBe('1.0.0')
      expect(help.description).toBe('My test application')
      expect(help.usage).toContain('myapp')
      expect(help.commands).toHaveLength(1)
      expect(help.commands?.[0].path).toEqual(['deploy'])
    })

    it('should include global options', () => {
      const cli = defineCli({
        name: 'myapp',
        globalOptions: {
          verbose: cfg(Boolean, { description: 'Verbose output', alias: 'v' }),
          config: cfg(Optional(String), { description: 'Config file' }),
        },
      })

      const help = generateCliHelp(cli)

      expect(help.globalOptions).toHaveLength(2)
      expect(help.globalOptions?.map((o) => o.name)).toContain('verbose')
      expect(help.globalOptions?.map((o) => o.name)).toContain('config')
    })

    it('should include command aliases', () => {
      const cli = defineCli({ name: 'myapp' })

      cli.add(
        defineCommand({
          path: 'deploy',
          aliases: ['d', 'ship'],
          args: {},
          options: {},
          action: () => {},
        })
      )

      const help = generateCliHelp(cli)

      expect(help.commands?.[0].aliases).toEqual(['d', 'ship'])
    })

    it('should flatten nested commands', () => {
      const cli = defineCli({ name: 'myapp' })

      cli.add(
        defineCommandGroup({
          path: 'server',
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              action: () => {},
            }),
            defineCommand({
              path: 'stop',
              args: {},
              options: {},
              action: () => {},
            }),
          ],
        })
      )

      const help = generateCliHelp(cli)

      expect(help.commands?.length).toBeGreaterThan(0)
    })

    it('should not duplicate entries when group has defaultCommand', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
          description: 'Server management',
          defaultCommand: defineCommand({
            path: 'status',
            description: 'Show status',
            args: {},
            options: {},
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

      const help = generateCliHelp(cli)
      const serverEntries = help.commands?.filter(
        (c) => c.path.length === 1 && c.path[0] === 'server'
      )
      expect(serverEntries).toHaveLength(1)
      // Should carry group aliases
      expect(serverEntries![0].aliases).toContain('sv')
    })

    it('should merge defaultCommand and group aliases in help', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
          defaultCommand: defineCommand({
            path: 'status',
            aliases: ['st', 's'],
            description: 'Show status',
            args: {},
            options: {},
            action: () => {},
          }),
          subCommands: [],
        })
      )

      const help = generateCliHelp(cli)
      const serverEntry = help.commands?.find((c) => c.path[0] === 'server')

      expect(serverEntry).toBeDefined()
      // aliases 应包含 defaultCommand 的别名和 group 的别名
      expect(serverEntry!.aliases).toContain('st')
      expect(serverEntry!.aliases).toContain('s')
      expect(serverEntry!.aliases).toContain('sv')
    })

    it('should exclude hidden groups from help', () => {
      const cli = defineCli({ name: 'myapp' })

      cli.add(
        defineCommandGroup({
          path: 'internal',
          hidden: true,
          subCommands: [
            defineCommand({
              path: 'debug',
              args: {},
              options: {},
              action: () => {},
            }),
          ],
        })
      )

      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {},
          action: () => {},
        })
      )

      const help = generateCliHelp(cli)
      const paths = help.commands?.map((c) => c.path.join(' ')) ?? []

      expect(paths).not.toContain('internal')
      expect(paths).not.toContain('internal debug')
      expect(paths).toContain('deploy')
    })
  })

  describe('generateCommandHelp', () => {
    it('should generate command help with args', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'copy',
        description: 'Copy files',
        args: {
          source: String,
          target: String,
        },
        options: {},
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['copy'])

      expect(help.currentCommand?.path).toEqual(['copy'])
      expect(help.currentCommand?.args).toHaveLength(2)
      expect(help.currentCommand?.args.map((a) => a.name)).toContain('source')
      expect(help.currentCommand?.args.map((a) => a.name)).toContain('target')
    })

    it('should generate command help with options', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'server',
        description: 'Start server',
        args: {},
        options: {
          port: cfg(Number, { description: 'Port number', alias: 'p' }),
          verbose: cfg(Boolean, { description: 'Verbose mode', alias: 'v' }),
        },
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['server'])

      expect(help.currentCommand?.options).toHaveLength(2)
      const portOpt = help.currentCommand?.options.find((o) => o.name === 'port')
      expect(portOpt?.shortName).toBe('p')
      expect(portOpt?.description).toBe('Port number')
    })

    it('should mark Optional fields as not required', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'deploy',
        args: {},
        options: {
          env: cfg(String, { description: 'Environment' }),
          region: cfg(Optional(String), { description: 'Region' }),
        },
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['deploy'])

      const envOpt = help.currentCommand?.options.find((o) => o.name === 'env')
      const regionOpt = help.currentCommand?.options.find((o) => o.name === 'region')
      expect(envOpt?.required).toBe(true)
      expect(regionOpt?.required).toBe(false)
    })

    it('should include constraints', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'build',
        args: {},
        options: {
          format: String,
          minify: Boolean,
        },
        constraints: [
          {
            type: 'exclusive',
            options: ['format', 'minify'],
            description: 'Cannot use both format and minify',
          },
        ],
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['build'])

      expect(help.currentCommand?.constraints).toHaveLength(1)
      expect(help.currentCommand?.constraints?.[0].type).toBe('exclusive')
    })

    it('should handle rest parameters', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'lint',
        args: {},
        options: {},
        rest: String,
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['lint'])

      expect(help.currentCommand?.args).toHaveLength(1)
      expect(help.currentCommand?.args[0]).toEqual({
        name: '...rest',
        type: 'string',
        required: false,
        rest: true,
      })
    })

    it('should handle rest parameters with fixed args', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'copy',
        args: { source: String, target: String },
        options: {},
        rest: String,
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['copy'])

      expect(help.currentCommand?.args).toHaveLength(3)
      expect(help.currentCommand?.args[0].name).toBe('source')
      expect(help.currentCommand?.args[1].name).toBe('target')
      expect(help.currentCommand?.args[2]).toEqual({
        name: '...rest',
        type: 'string',
        required: false,
        rest: true,
      })
    })

    it('should render rest parameters in help text', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'lint',
        args: {},
        options: {},
        rest: String,
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['lint'])
      const text = renderHelp(help)

      expect(text).toContain('...rest')
      expect(text).toContain('string')
    })
  })

  describe('generateGroupHelp', () => {
    it('should generate group help with subcommands', () => {
      const cli = defineCli({ name: 'myapp' })
      const group = defineCommandGroup({
        path: 'server',
        description: 'Server management',
        subCommands: [
          defineCommand({
            path: 'start',
            description: 'Start the server',
            args: {},
            options: {},
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

      const help = generateGroupHelp(cli, group, ['server'])

      expect(help.description).toBe('Server management')
      expect(help.commands).toHaveLength(2)
    })

    it('should include default command', () => {
      const cli = defineCli({ name: 'myapp' })
      const group = defineCommandGroup({
        path: 'server',
        description: 'Server management',
        subCommands: [],
        defaultCommand: defineCommand({
          path: 'status',
          description: 'Show server status',
          args: {},
          options: {},
          action: () => {},
        }),
      })

      const help = generateGroupHelp(cli, group, ['server'])

      expect(help.currentCommand?.path).toEqual(['server'])
      expect(help.commands?.[0].description).toContain('default')
    })

    it('should include nested sub-groups in group help', () => {
      const cli = defineCli({ name: 'myapp' })
      const group = defineCommandGroup({
        path: 'server',
        description: 'Server management',
        subCommands: [
          defineCommand({
            path: 'start',
            args: {},
            options: {},
            action: () => {},
          }),
          defineCommandGroup({
            path: 'config',
            description: 'Config management',
            subCommands: [
              defineCommand({
                path: 'set',
                args: {},
                options: {},
                action: () => {},
              }),
            ],
          }),
        ],
      })

      const help = generateGroupHelp(cli, group, ['server'])

      const commandPaths = help.commands?.map((c) => c.path.join(' '))
      expect(commandPaths).toContain('start')
      expect(commandPaths).toContain('config')
    })

    it('should not include hidden sub-groups in group help', () => {
      const cli = defineCli({ name: 'myapp' })
      const group = defineCommandGroup({
        path: 'server',
        subCommands: [
          defineCommand({
            path: 'start',
            args: {},
            options: {},
            action: () => {},
          }),
          defineCommandGroup({
            path: 'internal',
            hidden: true,
            description: 'Internal commands',
            subCommands: [],
          }),
        ],
      })

      const help = generateGroupHelp(cli, group, ['server'])

      const commandPaths = help.commands?.map((c) => c.path.join(' '))
      expect(commandPaths).toContain('start')
      expect(commandPaths).not.toContain('internal')
    })
  })

  describe('renderHelp', () => {
    it('should render CLI help', () => {
      const cli = defineCli({
        name: 'myapp',
        version: '1.0.0',
        description: 'Test app',
      })

      cli.add(
        defineCommand({
          path: 'deploy',
          description: 'Deploy app',
          args: {},
          options: {},
          action: () => {},
        })
      )

      const help = generateCliHelp(cli)
      const rendered = renderHelp(help)

      expect(rendered).toContain('myapp v1.0.0')
      expect(rendered).toContain('Test app')
      expect(rendered).toContain('Usage:')
      expect(rendered).toContain('Commands:')
      expect(rendered).toContain('deploy')
    })

    it('should include built-in options in rendered help', () => {
      const cli = defineCli({ name: 'myapp', version: '1.0.0' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {},
        })
      )

      const help = generateCliHelp(cli)
      const rendered = renderHelp(help)

      expect(rendered).toContain('Built-in Options:')
      expect(rendered).toContain('--help')
      expect(rendered).toContain('-h')
      expect(rendered).toContain('--version')
    })

    it('should render command help with args', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'copy',
        description: 'Copy files',
        args: {
          source: String,
          target: String,
        },
        options: {
          force: cfg(Boolean, { description: 'Force overwrite', alias: 'f' }),
        },
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['copy'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('Usage: myapp copy')
      expect(rendered).toContain('Arguments:')
      expect(rendered).toContain('source')
      expect(rendered).toContain('target')
      expect(rendered).toContain('Options:')
      expect(rendered).toContain('--force')
      expect(rendered).toContain('-f')
    })

    it('should render constraints', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'build',
        args: {},
        options: {
          format: String,
          minify: Boolean,
        },
        constraints: [
          {
            type: 'exclusive',
            options: ['format', 'minify'],
            description: 'Cannot use both',
          },
        ],
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['build'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('Constraints:')
      expect(rendered).toContain('Cannot use both')
    })

    it('should render global options', () => {
      const cli = defineCli({
        name: 'myapp',
        globalOptions: {
          verbose: cfg(Boolean, { description: 'Verbose output', alias: 'v' }),
        },
      })

      const cmd = defineCommand({
        path: 'deploy',
        args: {},
        options: {},
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['deploy'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('Global Options:')
      expect(rendered).toContain('--verbose')
      expect(rendered).toContain('Verbose output')
    })

    it('should align columns properly', () => {
      const cli = defineCli({ name: 'myapp' })

      cli.add(
        defineCommand({
          path: 'deploy',
          description: 'Deploy the application',
          args: {},
          options: {},
          action: () => {},
        })
      )

      cli.add(
        defineCommand({
          path: 'build',
          description: 'Build',
          args: {},
          options: {},
          action: () => {},
        })
      )

      const help = generateCliHelp(cli)
      const rendered = renderHelp(help)

      // Both commands should be present
      expect(rendered).toContain('deploy')
      expect(rendered).toContain('build')
    })

    it('should handle CLI without version', () => {
      const cli = defineCli({ name: 'myapp' })

      const help = generateCliHelp(cli)
      const rendered = renderHelp(help)

      expect(rendered).toContain('myapp')
      expect(rendered).not.toContain('vundefined')
    })

    it('should handle command without description', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'cmd',
        args: {},
        options: {},
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['cmd'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('cmd')
    })

    it('should render Literal values in Union type', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'build',
        args: {},
        options: {
          format: cfg(Union(Literal('esm'), Literal('cjs')), { description: 'Output format' }),
        },
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['build'])
      const rendered = renderHelp(help)

      expect(rendered).toContain("'esm' | 'cjs'")
      expect(rendered).not.toContain('literal')
    })
  })

  describe('complex schema types', () => {
    it('should render nested object types in args', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'deploy',
        args: {
          config: { host: String, port: Number },
        },
        options: {},
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['deploy'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('config')
      expect(rendered).toContain('host')
      expect(rendered).toContain('port')
    })

    it('should handle raw SchemaCtor without cfg wrapper', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'test',
        args: { name: String },
        options: {},
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['test'])
      expect(help.currentCommand?.args).toHaveLength(1)
      expect(help.currentCommand?.args[0].name).toBe('name')
      expect(help.currentCommand?.args[0].type).toBe('string')
    })
  })

  describe('constraint rendering', () => {
    it('should render exclusive constraint without description', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'build',
        args: {},
        options: {
          format: String,
          minify: Boolean,
        },
        constraints: [
          {
            type: 'exclusive',
            options: ['format', 'minify'],
          },
        ],
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['build'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('Constraints:')
      expect(rendered).toContain('format | minify')
      expect(rendered).toContain('mutually exclusive')
    })

    it('should render dependsOn constraint without description', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'deploy',
        args: {},
        options: {
          analyze: Boolean,
          format: String,
        },
        constraints: [
          {
            type: 'dependsOn',
            option: 'analyze',
            requires: ['format'],
          },
        ],
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['deploy'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('analyze requires format')
    })

    it('should render requiredTogether constraint without description', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'auth',
        args: {},
        options: {
          appKey: String,
          appSecret: String,
        },
        constraints: [
          {
            type: 'requiredTogether',
            options: ['appKey', 'appSecret'],
          },
        ],
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['auth'])
      const rendered = renderHelp(help)

      expect(rendered).toContain('appKey + appSecret')
      expect(rendered).toContain('required together')
    })

    it('should handle empty constraints array', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'test',
        args: {},
        options: {},
        constraints: [],
        action: () => {},
      })

      const help = generateCommandHelp(cli, cmd, ['test'])
      const rendered = renderHelp(help)

      expect(rendered).not.toContain('Constraints:')
    })
  })
})
