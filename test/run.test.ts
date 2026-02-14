import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { run } from '../src/run'
import { defineCli, defineCommand, defineCommandGroup, cfg, runCli } from '../src/index'
import { String, Number, Boolean, Optional } from 'farrow-schema'

describe('run', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('basic execution', () => {
    it('should execute simple command', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'hello',
          args: {},
          options: {},
          action,
        })
      )

      try {
        await run(cli, ['hello'])
      } catch {}

      expect(action).toHaveBeenCalled()
    })

    it('should pass args to action', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'copy',
          args: {
            source: String,
            target: String,
          },
          options: {},
          action,
        })
      )

      try {
        await run(cli, ['copy', 'src.txt', 'dest.txt'])
      } catch {}

      expect(action).toHaveBeenCalledWith(
        { source: 'src.txt', target: 'dest.txt' },
        {}
      )
    })

    it('should pass options to action', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: {
            port: cfg(Number, { alias: 'p' }),
          },
          action,
        })
      )

      try {
        await run(cli, ['server', '--port', '3000'])
      } catch {}

      expect(action).toHaveBeenCalledWith(
        {},
        { port: 3000 }
      )
    })

    it('should not let boolean long option consume positional arg', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: { env: String },
          options: {
            verbose: cfg(Boolean, { alias: 'v' }),
          },
          action,
        })
      )

      try {
        await run(cli, ['deploy', '--verbose', 'production'])
      } catch {}

      expect(action).toHaveBeenCalledWith(
        { env: 'production' },
        { verbose: true }
      )
    })

    it('should default Boolean option to false when not provided', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            verbose: cfg(Boolean, { alias: 'v' }),
            port: cfg(Number, { alias: 'p' }),
          },
          action,
        })
      )

      try {
        await run(cli, ['deploy', '--port', '3000'])
      } catch {}

      expect(action).toHaveBeenCalledWith(
        {},
        { verbose: false, port: 3000 }
      )
    })

    it('should default Boolean global option to false when not provided', async () => {
      const action = vi.fn()
      const cli = defineCli({
        name: 'test',
        globalOptions: { verbose: cfg(Boolean, { alias: 'v' }) },
      })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {},
          action: () => {
            action(cli.globalOptionsContext.get())
          },
        })
      )

      try {
        await run(cli, ['deploy'])
      } catch {}

      expect(action).toHaveBeenCalledWith({ verbose: false })
    })

    it('should handle async action', async () => {
      const action = vi.fn().mockResolvedValue(undefined)
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {},
          action,
        })
      )

      try {
        await run(cli, ['deploy'])
      } catch {}

      expect(action).toHaveBeenCalled()
    })
  })

  describe('help and version', () => {
    it('should show help with --help', async () => {
      const cli = defineCli({
        name: 'test',
        version: '1.0.0',
        description: 'Test CLI',
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['--help'])
      } catch {}

      expect(consoleLogSpy).toHaveBeenCalled()
      const output = consoleLogSpy.mock.calls[0][0]
      expect(output).toContain('test')
      expect(output).toContain('Test CLI')
    })

    it('should show version with --version', async () => {
      const cli = defineCli({
        name: 'test',
        version: '1.2.3',
      })

      try {
        await run(cli, ['--version'])
      } catch {}

      expect(consoleLogSpy).toHaveBeenCalledWith('1.2.3')
    })

    it('should show command help with command --help', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'deploy',
          description: 'Deploy app',
          args: { env: String },
          options: { verbose: cfg(Boolean, { alias: 'v' }) },
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['deploy', '--help'])
      } catch {}

      expect(consoleLogSpy).toHaveBeenCalled()
      const output = consoleLogSpy.mock.calls[0][0]
      expect(output).toContain('deploy')
      expect(output).toContain('env')
    })
  })

  describe('validation errors', () => {
    it('should exit on invalid option type', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: { port: cfg(Number, { alias: 'p' }) },
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['server', '--port', 'not-a-number'])
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should exit on missing required arg', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'copy',
          args: { source: String, target: String },
          options: {},
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['copy', 'src.txt'])
      } catch {}

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should suggest similar command on not found', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {},
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['deply'])
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalled()
      const errorOutput = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join(' ')
      expect(errorOutput).toContain('deploy')
    })

    it('should handle ambiguous long option abbreviation gracefully', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {
            verbose: cfg(Boolean),
            version: cfg(Optional(String)),
          },
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['cmd', '--ver'])
      } catch {}

      expect(exitSpy).toHaveBeenCalledWith(1)
      const errorOutput = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join(' ')
      expect(errorOutput).toContain('ambiguous')
    })
  })

  describe('constraints', () => {
    it('should enforce exclusive constraint', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'build',
          args: {},
          options: {
            format: Optional(String),
            minify: Optional(Boolean),
          },
          constraints: [
            {
              type: 'exclusive',
              options: ['format', 'minify'],
              description: 'Cannot use both',
            },
          ],
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['build', '--format', 'esm', '--minify'])
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should enforce dependsOn constraint', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            env: Optional(String),
            analyze: Optional(Boolean),
          },
          constraints: [
            {
              type: 'dependsOn',
              option: 'analyze',
              requires: ['env'],
              description: 'Analyze requires env',
            },
          ],
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['deploy', '--analyze'])
      } catch {}

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should enforce requiredTogether constraint', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'auth',
          args: {},
          options: {
            appKey: Optional(String),
            appSecret: Optional(String),
          },
          constraints: [
            {
              type: 'requiredTogether',
              options: ['appKey', 'appSecret'],
              description: 'Keys must be together',
            },
          ],
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['auth', '--appKey', 'key123'])
      } catch {}

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('hooks', () => {
    it('should execute preAction hook', async () => {
      const preAction = vi.fn().mockReturnValue({ type: 'continue' })
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: { preAction },
          action,
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(preAction).toHaveBeenCalled()
      expect(action).toHaveBeenCalled()
    })

    it('should abort on preAction abort', async () => {
      const preAction = vi.fn().mockReturnValue({
        type: 'abort',
        reason: 'Not authorized',
      })
      const action = vi.fn()
      const postAction = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: { preAction, postAction },
          action,
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(preAction).toHaveBeenCalled()
      expect(action).not.toHaveBeenCalled()
      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(false)
      expect(result.aborted).toBe(true)
      expect(result.error).toBeDefined()
      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should execute postAction on success', async () => {
      const postAction = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: { postAction },
          action: () => {},
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(true)
    })

    it('should execute postAction on error', async () => {
      const postAction = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: { postAction },
          action: () => {
            throw new Error('Action failed')
          },
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should execute group hooks', async () => {
      const groupPreAction = vi.fn().mockReturnValue({ type: 'continue' })
      const groupPostAction = vi.fn()
      const action = vi.fn()

      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          hooks: {
            preAction: groupPreAction,
            postAction: groupPostAction,
          },
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              action,
            }),
          ],
        })
      )

      try {
        await run(cli, ['server', 'start'])
      } catch {}

      expect(groupPreAction).toHaveBeenCalled()
      expect(action).toHaveBeenCalled()
      expect(groupPostAction).toHaveBeenCalled()
    })

    it('should execute postAction after CLI-level preAction abort', async () => {
      const cliPostAction = vi.fn()
      const action = vi.fn()

      const cli = defineCli({
        name: 'test',
        hooks: {
          preAction: () => ({ type: 'abort' as const, reason: 'CLI abort' }),
          postAction: cliPostAction,
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action,
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(action).not.toHaveBeenCalled()
      expect(cliPostAction).toHaveBeenCalled()
      const [, result] = cliPostAction.mock.calls[0]
      expect(result.success).toBe(false)
      expect(result.aborted).toBe(true)
    })

    it('should execute postAction after group-level preAction abort', async () => {
      const groupPostAction = vi.fn()
      const commandPostAction = vi.fn()
      const action = vi.fn()

      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          hooks: {
            preAction: () => ({ type: 'abort' as const, reason: 'Group abort' }),
            postAction: groupPostAction,
          },
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              hooks: { postAction: commandPostAction },
              action,
            }),
          ],
        })
      )

      try {
        await run(cli, ['server', 'start'])
      } catch {}

      expect(action).not.toHaveBeenCalled()
      expect(commandPostAction).toHaveBeenCalled()
      expect(groupPostAction).toHaveBeenCalled()
      const [, cmdResult] = commandPostAction.mock.calls[0]
      expect(cmdResult.aborted).toBe(true)
      const [, grpResult] = groupPostAction.mock.calls[0]
      expect(grpResult.aborted).toBe(true)
    })

    it('should not set aborted flag on normal action error', async () => {
      const postAction = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: { postAction },
          action: () => {
            throw new Error('Action failed')
          },
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(false)
      expect(result.aborted).toBeUndefined()
    })
  })

  describe('global options', () => {
    it('should set global options in context', async () => {
      let globalOptsValue: any
      const cli = defineCli({
        name: 'test',
        globalOptions: {
          verbose: cfg(Boolean, { alias: 'v' }),
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {
            // Access context inside action where ALS is available
            globalOptsValue = cli.globalOptionsContext.get()
          },
        })
      )

      try {
        await run(cli, ['cmd', '--verbose'])
      } catch {}

      expect(globalOptsValue.verbose).toBe(true)
    })

    it('should separate global and command options', async () => {
      let globalOptsValue: any
      const action = vi.fn((args, options) => {
        // Store for verification
      })
      const cli = defineCli({
        name: 'test',
        globalOptions: {
          verbose: cfg(Boolean, { alias: 'v' }),
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: { port: cfg(Number, { alias: 'p' }) },
          action: (args, options) => {
            action(args, options)
            globalOptsValue = cli.globalOptionsContext.get()
          },
        })
      )

      try {
        await run(cli, ['cmd', '--verbose', '--port', '3000'])
      } catch {}

      expect(action).toHaveBeenCalledWith({}, { port: 3000 })
      expect(globalOptsValue.verbose).toBe(true)
    })
  })

  describe('global options env binding', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      // Restore env
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key]
        }
      }
      for (const [key, value] of Object.entries(originalEnv)) {
        process.env[key] = value
      }
    })

    it('should apply env binding to global options', async () => {
      let capturedKey = ''
      const cli = defineCli({
        name: 'test',
        globalOptions: {
          apiKey: cfg(String, { description: 'API key' }),
        },
        env: {
          prefix: 'MYAPP_',
          bindings: {
            apiKey: 'API_KEY',
          },
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {
            capturedKey = cli.globalOptionsContext.get().apiKey
          },
        })
      )

      process.env.MYAPP_API_KEY = 'secret-from-env'

      try {
        await run(cli, ['cmd'])
      } catch {
        // process.exit mock
      }

      expect(capturedKey).toBe('secret-from-env')
    })

    it('should prefer CLI arg over env var for global options', async () => {
      let capturedKey = ''
      const cli = defineCli({
        name: 'test',
        globalOptions: {
          apiKey: cfg(String, { description: 'API key' }),
        },
        env: {
          prefix: 'MYAPP_',
          bindings: {
            apiKey: 'API_KEY',
          },
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {
            capturedKey = cli.globalOptionsContext.get().apiKey
          },
        })
      )

      process.env.MYAPP_API_KEY = 'from-env'

      try {
        await run(cli, ['cmd', '--apiKey', 'from-cli'])
      } catch {
        // process.exit mock
      }

      expect(capturedKey).toBe('from-cli')
    })
  })

  describe('nested commands', () => {
    it('should execute nested command', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              action,
            }),
          ],
        })
      )

      try {
        await run(cli, ['server', 'start'])
      } catch {}

      expect(action).toHaveBeenCalled()
    })

    it('should show group help when no subcommand', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              action: vi.fn(),
            }),
          ],
        })
      )

      try {
        await run(cli, ['server'])
      } catch {}

      expect(consoleLogSpy).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('should execute default command', async () => {
      const defaultAction = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          defaultCommand: defineCommand({
            path: 'status',
            args: {},
            options: {},
            action: defaultAction,
          }),
          subCommands: [],
        })
      )

      try {
        await run(cli, ['server'])
      } catch {}

      expect(defaultAction).toHaveBeenCalled()
    })
  })

  describe('unknown options', () => {
    it('should reject unknown options', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: { port: cfg(Number, { alias: 'p' }) },
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['server', '--prot', '3000'])
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalled()
      const errorOutput = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join(' ')
      expect(errorOutput).toContain('Unknown option')
      expect(errorOutput).toContain('--prot')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should suggest similar option names', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: { port: cfg(Number, { alias: 'p' }) },
          action: vi.fn(),
        })
      )

      try {
        await run(cli, ['server', '--prot', '3000'])
      } catch {}

      const errorOutput = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join(' ')
      expect(errorOutput).toContain('port')
    })

    it('should not reject known options', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: { port: cfg(Number, { alias: 'p' }) },
          action,
        })
      )

      try {
        await run(cli, ['server', '--port', '3000'])
      } catch {}

      expect(action).toHaveBeenCalledWith({}, { port: 3000 })
    })

    it('should not reject aliased options', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: { port: cfg(Number, { alias: 'p' }) },
          action,
        })
      )

      try {
        await run(cli, ['server', '-p', '3000'])
      } catch {}

      expect(action).toHaveBeenCalledWith({}, { port: 3000 })
    })

    it('should not flag global options as unknown', async () => {
      const action = vi.fn()
      const cli = defineCli({
        name: 'test',
        globalOptions: { verbose: cfg(Boolean, { alias: 'v' }) },
      })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: { port: cfg(Number, { alias: 'p' }) },
          action,
        })
      )

      try {
        await run(cli, ['server', '--port', '3000', '--verbose'])
      } catch {}

      expect(action).toHaveBeenCalled()
    })
  })

  describe('rest parameters', () => {
    it('should pass rest parameters to action', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'lint',
          args: {},
          options: {},
          rest: String,
          action,
        })
      )

      try {
        await run(cli, ['lint', 'src/', 'tests/'])
      } catch {}

      expect(action).toHaveBeenCalledWith({}, {}, ['src/', 'tests/'])
    })

    it('should handle args and rest together', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'copy',
          args: { source: String },
          options: {},
          rest: String,
          action,
        })
      )

      try {
        await run(cli, ['copy', 'src.txt', 'dest1.txt', 'dest2.txt'])
      } catch {}

      expect(action).toHaveBeenCalledWith(
        { source: 'src.txt' },
        {},
        ['dest1.txt', 'dest2.txt']
      )
    })

    it('should reject extra positional args when no rest defined', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'copy',
          args: { source: String, target: String },
          options: {},
          action,
        })
      )

      try {
        await run(cli, ['copy', 'a.txt', 'b.txt', 'c.txt', 'd.txt'])
      } catch {}

      expect(action).not.toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Too many arguments')
      )
    })
  })

  describe('env binding errors', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key]
        }
      }
      for (const [key, value] of Object.entries(originalEnv)) {
        process.env[key] = value
      }
    })

    it('should handle env transform errors for command options', async () => {
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            region: cfg(String),
          },
          env: {
            prefix: 'MYAPP_',
            bindings: {
              region: {
                envName: 'REGION',
                transform: () => {
                  throw new Error('Transform failed')
                },
              },
            },
          },
          action: vi.fn(),
        })
      )

      process.env.MYAPP_REGION = 'us-west'

      try {
        await run(cli, ['deploy'])
      } catch {}

      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to transform env variable')
      )
    })

    it('should handle env transform errors for global options', async () => {
      const cli = defineCli({
        name: 'test',
        globalOptions: {
          apiKey: cfg(String),
        },
        env: {
          prefix: 'MYAPP_',
          bindings: {
            apiKey: {
              envName: 'API_KEY',
              transform: () => {
                throw new Error('Transform failed')
              },
            },
          },
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: vi.fn(),
        })
      )

      process.env.MYAPP_API_KEY = 'secret'

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to transform env variable')
      )
    })
  })

  describe('CLI level hooks', () => {
    it('should abort when CLI preAction returns abort', async () => {
      const action = vi.fn()
      const cli = defineCli({
        name: 'test',
        hooks: {
          preAction: () => ({
            type: 'abort' as const,
            reason: 'CLI level abort',
          }),
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action,
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(action).not.toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CLI level abort')
      )
    })

    it('should execute CLI postAction on success', async () => {
      const postAction = vi.fn()
      const cli = defineCli({
        name: 'test',
        hooks: {
          postAction,
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {},
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(true)
    })

    it('should execute CLI postAction on error', async () => {
      const postAction = vi.fn()
      const cli = defineCli({
        name: 'test',
        hooks: {
          postAction,
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {
            throw new Error('Action failed')
          },
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('group hooks array', () => {
    it('should execute array of group preAction hooks', async () => {
      const hook1 = vi.fn().mockReturnValue({ type: 'continue' })
      const hook2 = vi.fn().mockReturnValue({ type: 'continue' })
      const action = vi.fn()

      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          hooks: {
            preAction: [hook1, hook2],
          },
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              action,
            }),
          ],
        })
      )

      try {
        await run(cli, ['server', 'start'])
      } catch {}

      expect(hook1).toHaveBeenCalled()
      expect(hook2).toHaveBeenCalled()
      expect(action).toHaveBeenCalled()
    })

    it('should stop at first abort in group preAction hook array', async () => {
      const hook1 = vi.fn().mockReturnValue({ type: 'continue' })
      const hook2 = vi.fn().mockReturnValue({
        type: 'abort' as const,
        reason: 'Second hook aborted',
      })
      const hook3 = vi.fn().mockReturnValue({ type: 'continue' })
      const action = vi.fn()

      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          hooks: {
            preAction: [hook1, hook2, hook3],
          },
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: {},
              action,
            }),
          ],
        })
      )

      try {
        await run(cli, ['server', 'start'])
      } catch {}

      expect(hook1).toHaveBeenCalled()
      expect(hook2).toHaveBeenCalled()
      expect(hook3).not.toHaveBeenCalled()
      expect(action).not.toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should execute array of group postAction hooks', async () => {
      const hook1 = vi.fn()
      const hook2 = vi.fn()

      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          hooks: {
            postAction: [hook1, hook2],
          },
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

      try {
        await run(cli, ['server', 'start'])
      } catch {}

      expect(hook1).toHaveBeenCalled()
      expect(hook2).toHaveBeenCalled()
    })
  })

  describe('command postAction hook', () => {
    it('should handle postAction hook error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const cli = defineCli({ name: 'test' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: {
            postAction: () => {
              throw new Error('PostAction failed')
            },
          },
          action: () => {},
        })
      )

      try {
        await run(cli, ['cmd'])
      } catch {}

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[postAction hook error]')
      )
      consoleSpy.mockRestore()
    })
  })
})
