import { describe, it, expect, vi } from 'vitest'
import {
  defineCli,
  defineCommand,
  defineCommandGroup,
  cfg,
  runCli,
  parseArgv,
  matchCommand,
  validateInput,
  generateCompletion,
  defineContext,
  createMockCli,
  createTestCli,
  withEnv,
  captureError,
} from '../src/index'
import { String, Number, Boolean, Optional, List } from 'farrow-schema'

describe('index - Public API', () => {
  describe('defineCommand', () => {
    it('should create command with basic config', () => {
      const cmd = defineCommand({
        path: 'hello',
        args: {},
        options: {},
        action: () => {},
      })

      expect(cmd.type).toBe('command')
      expect(cmd.path).toBe('hello')
      expect(cmd.args).toBeDefined()
      expect(cmd.options).toBeDefined()
      expect(cmd.action).toBeDefined()
    })

    it('should create command with args', () => {
      const cmd = defineCommand({
        path: 'copy',
        args: {
          source: String,
          target: String,
        },
        options: {},
        action: () => {},
      })

      expect(cmd.args).toBeDefined()
    })

    it('should create command with options', () => {
      const cmd = defineCommand({
        path: 'server',
        args: {},
        options: {
          port: cfg(Number, { description: 'Port', alias: 'p' }),
        },
        action: () => {},
      })

      expect(cmd.options).toBeDefined()
    })

    it('should create command with aliases', () => {
      const cmd = defineCommand({
        path: 'deploy',
        aliases: ['d', 'ship'],
        args: {},
        options: {},
        action: () => {},
      })

      expect(cmd.aliases).toEqual(['d', 'ship'])
    })

    it('should create command with description', () => {
      const cmd = defineCommand({
        path: 'deploy',
        description: 'Deploy the application',
        args: {},
        options: {},
        action: () => {},
      })

      expect(cmd.description).toBe('Deploy the application')
    })

    it('should create command with rest parameters', () => {
      const cmd = defineCommand({
        path: 'lint',
        args: {},
        options: {},
        rest: String,
        action: () => {},
      })

      expect(cmd.rest).toBe(String)
    })

    it('should create command with constraints', () => {
      const cmd = defineCommand({
        path: 'build',
        args: {},
        options: {
          format: Optional(String),
          minify: Optional(Boolean),
        },
        constraints: [
          { type: 'exclusive', options: ['format', 'minify'] },
        ],
        action: () => {},
      })

      expect(cmd.constraints).toHaveLength(1)
    })

    it('should create command with hooks', () => {
      const preAction = vi.fn()
      const postAction = vi.fn()

      const cmd = defineCommand({
        path: 'deploy',
        args: {},
        options: {},
        hooks: {
          preAction,
          postAction,
        },
        action: () => {},
      })

      expect(cmd.hooks?.preAction).toBe(preAction)
      expect(cmd.hooks?.postAction).toBe(postAction)
    })

    it('should create command with env bindings', () => {
      const cmd = defineCommand({
        path: 'deploy',
        args: {},
        options: { apiKey: String },
        env: {
          prefix: 'MYAPP_',
          bindings: {
            apiKey: 'API_KEY',
          },
        },
        action: () => {},
      })

      expect(cmd.env?.prefix).toBe('MYAPP_')
    })

    it('should create hidden command', () => {
      const cmd = defineCommand({
        path: 'secret',
        hidden: true,
        args: {},
        options: {},
        action: () => {},
      })

      expect(cmd.hidden).toBe(true)
    })
  })

  describe('defineCommandGroup', () => {
    it('should create command group', () => {
      const group = defineCommandGroup({
        path: 'server',
        subCommands: [],
      })

      expect(group.type).toBe('group')
      expect(group.path).toBe('server')
      expect(group.subCommands).toEqual([])
    })

    it('should create group with subcommands', () => {
      const startCmd = defineCommand({
        path: 'start',
        args: {},
        options: {},
        action: () => {},
      })

      const group = defineCommandGroup({
        path: 'server',
        subCommands: [startCmd],
      })

      expect(group.subCommands).toHaveLength(1)
    })

    it('should create group with aliases', () => {
      const group = defineCommandGroup({
        path: 'server',
        aliases: ['sv'],
        subCommands: [],
      })

      expect(group.aliases).toEqual(['sv'])
    })

    it('should create group with description', () => {
      const group = defineCommandGroup({
        path: 'server',
        description: 'Server management',
        subCommands: [],
      })

      expect(group.description).toBe('Server management')
    })

    it('should create group with default command', () => {
      const defaultCmd = defineCommand({
        path: 'status',
        args: {},
        options: {},
        action: () => {},
      })

      const group = defineCommandGroup({
        path: 'server',
        subCommands: [],
        defaultCommand: defaultCmd,
      })

      expect(group.defaultCommand).toBe(defaultCmd)
    })

    it('should create group with hooks', () => {
      const preAction = vi.fn()

      const group = defineCommandGroup({
        path: 'server',
        subCommands: [],
        hooks: {
          preAction,
        },
      })

      expect(group.hooks?.preAction).toBe(preAction)
    })
  })

  describe('defineCli', () => {
    it('should create CLI with name', () => {
      const cli = defineCli({ name: 'myapp' })

      expect(cli.name).toBe('myapp')
      expect(cli.commands).toEqual([])
      expect(cli.globalOptionsContext).toBeDefined()
    })

    it('should create CLI with version', () => {
      const cli = defineCli({
        name: 'myapp',
        version: '1.0.0',
      })

      expect(cli.version).toBe('1.0.0')
    })

    it('should create CLI with description', () => {
      const cli = defineCli({
        name: 'myapp',
        description: 'My application',
      })

      expect(cli.description).toBe('My application')
    })

    it('should create CLI with global options', () => {
      const cli = defineCli({
        name: 'myapp',
        globalOptions: {
          verbose: cfg(Boolean, { alias: 'v' }),
        },
      })

      expect(cli.globalOptions).toBeDefined()
    })

    it('should create CLI with hooks', () => {
      const preAction = vi.fn()

      const cli = defineCli({
        name: 'myapp',
        hooks: {
          preAction,
        },
      })

      expect(cli.hooks?.preAction).toBe(preAction)
    })

    it('should create CLI with array hooks', () => {
      const preAction1 = vi.fn().mockReturnValue({ type: 'continue' })
      const preAction2 = vi.fn().mockReturnValue({ type: 'continue' })
      const postAction1 = vi.fn()
      const postAction2 = vi.fn()

      const cli = defineCli({
        name: 'myapp',
        hooks: {
          preAction: [preAction1, preAction2],
          postAction: [postAction1, postAction2],
        },
      })

      expect(Array.isArray(cli.hooks?.preAction)).toBe(true)
      expect(Array.isArray(cli.hooks?.postAction)).toBe(true)
    })

    it('should support add method', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd = defineCommand({
        path: 'hello',
        args: {},
        options: {},
        action: () => {},
      })

      cli.add(cmd)

      expect(cli.commands).toHaveLength(1)
    })

    it('should support add method', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd1 = defineCommand({
        path: 'cmd1',
        args: {},
        options: {},
        action: () => {},
      })
      const cmd2 = defineCommand({
        path: 'cmd2',
        args: {},
        options: {},
        action: () => {},
      })

      cli.add(cmd1)
      cli.add(cmd2)

      expect(cli.commands).toHaveLength(2)
    })

    it('should support adding array of commands', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmds = [
        defineCommand({ path: 'cmd1', args: {}, options: {}, action: () => {} }),
        defineCommand({ path: 'cmd2', args: {}, options: {}, action: () => {} }),
      ]

      cli.add(cmds)

      expect(cli.commands).toHaveLength(2)
    })

    it('should support mixed add calls', () => {
      const cli = defineCli({ name: 'myapp' })
      const cmd1 = defineCommand({ path: 'cmd1', args: {}, options: {}, action: () => {} })
      const cmd2 = defineCommand({ path: 'cmd2', args: {}, options: {}, action: () => {} })
      const cmd3 = defineCommand({ path: 'cmd3', args: {}, options: {}, action: () => {} })

      cli.add(cmd1, [cmd2, cmd3])

      expect(cli.commands).toHaveLength(3)
    })
  })

  describe('cfg', () => {
    it('should create cfg item with schema', () => {
      const item = cfg(Number)

      expect(item.__type).toBe(Number)
    })

    it('should create cfg item with description', () => {
      const item = cfg(Number, { description: 'Port number' })

      expect(item.description).toBe('Port number')
    })

    it('should create cfg item with alias', () => {
      const item = cfg(Number, { alias: 'p' })

      expect(item.alias).toBe('p')
    })

    it('should create cfg item with both description and alias', () => {
      const item = cfg(Number, {
        description: 'Port number',
        alias: 'p',
      })

      expect(item.description).toBe('Port number')
      expect(item.alias).toBe('p')
    })

    it('should work with List types', () => {
      const item = cfg(List(String), { description: 'Tags' })

      expect(item.__type).toBeDefined()
      expect(item.description).toBe('Tags')
    })

    it('should work with Optional types', () => {
      const item = cfg(Optional(Number), { description: 'Optional port' })

      expect(item.__type).toBeDefined()
      expect(item.description).toBe('Optional port')
    })
  })

  describe('parseArgv', () => {
    it('should be exported', () => {
      expect(parseArgv).toBeDefined()
      expect(typeof parseArgv).toBe('function')
    })

    it('should parse arguments', () => {
      const result = parseArgv(['--port', '3000'])

      expect(result.options.port).toBe('3000')
    })
  })

  describe('matchCommand', () => {
    it('should be exported', () => {
      expect(matchCommand).toBeDefined()
      expect(typeof matchCommand).toBe('function')
    })

    it('should match commands', () => {
      const cmd = defineCommand({
        path: 'deploy',
        args: {},
        options: {},
        action: () => {},
      })

      const result = matchCommand([cmd], ['deploy'])

      expect(result.type).toBe('command')
    })
  })

  describe('validateInput', () => {
    it('should be exported', () => {
      expect(validateInput).toBeDefined()
      expect(typeof validateInput).toBe('function')
    })

    it('should validate schema', () => {
      const result = validateInput(String, 'hello')

      expect(result.success).toBe(true)
    })
  })

  describe('generateCompletion', () => {
    it('should be exported', () => {
      expect(generateCompletion).toBeDefined()
      expect(typeof generateCompletion).toBe('function')
    })

    it('should generate bash completion', () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {},
        })
      )
      const script = generateCompletion(cli, 'bash')

      expect(script).toContain('_myapp_completion')
    })
  })

  describe('defineContext', () => {
    it('should be exported', () => {
      expect(defineContext).toBeDefined()
      expect(typeof defineContext).toBe('function')
    })

    it('should create context', () => {
      const ctx = defineContext<string>()

      expect(ctx.id).toBeDefined()
      expect(ctx.set).toBeDefined()
      expect(ctx.get).toBeDefined()
    })
  })

  describe('createMockCli', () => {
    it('should be exported', () => {
      expect(createMockCli).toBeDefined()
      expect(typeof createMockCli).toBe('function')
    })

    it('should create mock runner', () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'hello',
          args: {},
          options: {},
          action: () => console.log('Hello!'),
        })
      )

      const mock = createMockCli(cli)

      expect(mock.run).toBeDefined()
      expect(mock.getOutputs).toBeDefined()
      expect(mock.assertOutputContains).toBeDefined()
    })

    it('should capture output', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'hello',
          args: {},
          options: {},
          action: () => console.log('Hello!'),
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['hello'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Hello!')
    })
  })

  describe('createTestCli', () => {
    it('should be exported', () => {
      expect(createTestCli).toBeDefined()
      expect(typeof createTestCli).toBe('function')
    })

    it('should create test CLI', () => {
      const cli = createTestCli({
        name: 'test',
        commands: [
          defineCommand({
            path: 'cmd',
            args: {},
            options: {},
            action: () => {},
          }),
        ],
      })

      expect(cli.name).toBe('test')
      expect(cli.commands).toHaveLength(1)
      expect(cli.version).toBe('1.0.0')
    })

    it('should use provided version', () => {
      const cli = createTestCli({
        name: 'test',
        version: '2.0.0',
        commands: [],
      })

      expect(cli.version).toBe('2.0.0')
    })

    it('should use provided description', () => {
      const cli = createTestCli({
        name: 'test',
        description: 'Test CLI',
        commands: [],
      })

      expect(cli.description).toBe('Test CLI')
    })
  })

  describe('withEnv', () => {
    it('should be exported', () => {
      expect(withEnv).toBeDefined()
      expect(typeof withEnv).toBe('function')
    })

    it('should temporarily set env vars', async () => {
      const originalValue = process.env.TEST_VAR

      const result = await withEnv({ TEST_VAR: 'test_value' }, async () => {
        return process.env.TEST_VAR
      })

      expect(result).toBe('test_value')
      expect(process.env.TEST_VAR).toBe(originalValue)
    })

    it('should restore original values', async () => {
      process.env.EXISTING_VAR = 'original'

      await withEnv({ EXISTING_VAR: 'modified' }, async () => {
        expect(process.env.EXISTING_VAR).toBe('modified')
      })

      expect(process.env.EXISTING_VAR).toBe('original')
    })

    it('should handle undefined values', async () => {
      process.env.TO_DELETE = 'value'

      await withEnv({ TO_DELETE: undefined }, async () => {
        expect(process.env.TO_DELETE).toBeUndefined()
      })

      expect(process.env.TO_DELETE).toBe('value')
    })
  })

  describe('captureError', () => {
    it('should be exported', () => {
      expect(captureError).toBeDefined()
      expect(typeof captureError).toBe('function')
    })

    it('should capture thrown error', async () => {
      const error = new Error('Test error')

      const captured = await captureError(async () => {
        throw error
      })

      expect(captured).toBe(error)
    })

    it('should return undefined on success', async () => {
      const captured = await captureError(async () => {
        return 'success'
      })

      expect(captured).toBeUndefined()
    })
  })

  describe('runCli', () => {
    it('should be exported', () => {
      expect(runCli).toBeDefined()
      expect(typeof runCli).toBe('function')
    })
  })
})
