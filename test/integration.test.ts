import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  defineCli,
  defineCommand,
  defineCommandGroup,
  cfg,
  defineContext,
  createMockCli,
  withEnv,
} from '../src/index'
import { String, Number, Boolean, List, Optional, Union, Literal } from 'farrow-schema'

describe('integration', () => {
  describe('simple CLI', () => {
    it('should execute hello world command', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'hello' })
      cli.add(
        defineCommand({
          path: 'world',
          args: {},
          options: {},
          action,
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['world'])

      expect(result.exitCode).toBe(0)
      expect(action).toHaveBeenCalled()
    })

    it('should echo arguments', async () => {
      const cli = defineCli({ name: 'echo' })
      cli.add(
        defineCommand({
          path: 'print',
          args: { message: String },
          options: {},
          action: (args) => {
            console.log(args.message)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['print', 'Hello, World!'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Hello, World!')
    })

    it('should handle options', async () => {
      const cli = defineCli({ name: 'calc' })
      cli.add(
        defineCommand({
          path: 'add',
          args: {
            a: Number,
            b: Number,
          },
          options: {},
          action: (args) => {
            const sum = args.a + args.b
            console.log(sum)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['add', '5', '3'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('8')
    })
  })

  describe('nested commands', () => {
    it('should execute server start command', async () => {
      const startAction = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          subCommands: [
            defineCommand({
              path: 'start',
              args: {},
              options: { port: cfg(Number, { alias: 'p' }) },
              action: startAction,
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

      const mock = createMockCli(cli)
      const result = await mock.run(['server', 'start', '--port', '3000'])

      expect(result.exitCode).toBe(0)
      expect(startAction).toHaveBeenCalledWith({}, { port: 3000 })
    })

    it('should execute deeply nested commands', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'app',
          subCommands: [
            defineCommandGroup({
              path: 'service',
              subCommands: [
                defineCommand({
                  path: 'restart',
                  args: {},
                  options: {},
                  action,
                }),
              ],
            }),
          ],
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['app', 'service', 'restart'])

      expect(result.exitCode).toBe(0)
      expect(action).toHaveBeenCalled()
    })

    it('should use default command', async () => {
      const statusAction = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          defaultCommand: defineCommand({
            path: 'status',
            args: {},
            options: {},
            action: statusAction,
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

      const mock = createMockCli(cli)
      const result = await mock.run(['server'])

      expect(result.exitCode).toBe(0)
      expect(statusAction).toHaveBeenCalled()
    })
  })

  describe('aliases', () => {
    it('should work with command aliases', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'deploy',
          aliases: ['d', 'ship'],
          args: {},
          options: {},
          action,
        })
      )

      const mock = createMockCli(cli)

      await mock.run(['deploy'])
      expect(action).toHaveBeenCalledTimes(1)

      await mock.run(['d'])
      expect(action).toHaveBeenCalledTimes(2)

      await mock.run(['ship'])
      expect(action).toHaveBeenCalledTimes(3)
    })

    it('should work with group aliases', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
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

      const mock = createMockCli(cli)
      const result = await mock.run(['sv', 'start'])

      expect(result.exitCode).toBe(0)
      expect(action).toHaveBeenCalled()
    })

    it('should work with alias combinations', async () => {
      const action = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
          subCommands: [
            defineCommand({
              path: 'start',
              aliases: ['up'],
              args: {},
              options: {},
              action,
            }),
          ],
        })
      )

      const mock = createMockCli(cli)

      await mock.run(['server', 'start'])
      expect(action).toHaveBeenCalledTimes(1)

      await mock.run(['sv', 'up'])
      expect(action).toHaveBeenCalledTimes(2)
    })
  })

  describe('global options', () => {
    it('should access global options in action', async () => {
      const cli = defineCli({
        name: 'myapp',
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
            const { verbose } = cli.globalOptionsContext.get()
            console.log(`verbose: ${verbose}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['cmd', '--verbose'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('verbose: true')
    })

    it('should separate global and command options', async () => {
      const action = vi.fn()
      const cli = defineCli({
        name: 'myapp',
        globalOptions: {
          verbose: cfg(Boolean, { alias: 'v' }),
        },
      })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: { env: cfg(String, { alias: 'e' }) },
          action: (args, options) => {
            action(options)
            const globalOpts = cli.globalOptionsContext.get()
            console.log(`env: ${options.env}, verbose: ${globalOpts.verbose}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['deploy', '--env', 'prod', '--verbose'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('env: prod')
      expect(result.stdout).toContain('verbose: true')
    })
  })

  describe('hooks', () => {
    it('should execute preAction hook', async () => {
      const preAction = vi.fn().mockReturnValue({ type: 'continue' })
      const action = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: { preAction },
          action,
        })
      )

      const mock = createMockCli(cli)
      await mock.run(['cmd'])

      expect(preAction).toHaveBeenCalledBefore(action)
      expect(action).toHaveBeenCalled()
    })

    it('should abort execution', async () => {
      const action = vi.fn()
      const postAction = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'admin',
          args: {},
          options: {},
          hooks: {
            preAction: () => ({
              type: 'abort',
              reason: 'Admin access required',
            }),
            postAction,
          },
          action,
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['admin'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Admin access required')
      expect(action).not.toHaveBeenCalled()
      expect(postAction).toHaveBeenCalled()
      const [, postResult] = postAction.mock.calls[0]
      expect(postResult.aborted).toBe(true)
      expect(postResult.success).toBe(false)
    })

    it('should execute postAction on success', async () => {
      const postAction = vi.fn()
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: { postAction },
          action: () => console.log('Action executed'),
        })
      )

      const mock = createMockCli(cli)
      await mock.run(['cmd'])

      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(true)
    })

    it('should execute postAction on error', async () => {
      const postAction = vi.fn()
      const cli = defineCli({ name: 'myapp' })
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

      const mock = createMockCli(cli)
      await mock.run(['cmd'])

      expect(postAction).toHaveBeenCalled()
      const [, result] = postAction.mock.calls[0]
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should execute group hooks', async () => {
      const groupPreAction = vi.fn().mockReturnValue({ type: 'continue' })
      const groupPostAction = vi.fn()
      const action = vi.fn()

      const cli = defineCli({ name: 'myapp' })
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

      const mock = createMockCli(cli)
      await mock.run(['server', 'start'])

      expect(groupPreAction).toHaveBeenCalled()
      expect(action).toHaveBeenCalled()
      expect(groupPostAction).toHaveBeenCalled()
    })

    it('should execute CLI-level array hooks in order', async () => {
      const order: string[] = []
      const cli = defineCli({
        name: 'myapp',
        hooks: {
          preAction: [
            () => {
              order.push('pre1')
              return { type: 'continue' as const }
            },
            () => {
              order.push('pre2')
              return { type: 'continue' as const }
            },
          ],
          postAction: [
            () => {
              order.push('post1')
            },
            () => {
              order.push('post2')
            },
          ],
        },
      })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          action: () => {
            order.push('action')
          },
        })
      )

      const mock = createMockCli(cli)
      await mock.run(['cmd'])

      expect(order).toEqual(['pre1', 'pre2', 'action', 'post1', 'post2'])
    })
  })

  describe('context', () => {
    it('should use ALS context', async () => {
      const RequestCtx = defineContext<{ id: string }>()

      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'cmd',
          args: {},
          options: {},
          hooks: {
            preAction: () => {
              RequestCtx.set({ id: 'req-123' })
              return { type: 'continue' }
            },
          },
          action: () => {
            const { id } = RequestCtx.get()
            console.log(`Request ID: ${id}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['cmd'])

      expect(result.stdout).toContain('Request ID: req-123')
    })

    it('should isolate contexts between commands', async () => {
      const CounterCtx = defineContext<{ count: number }>()

      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'cmd1',
          args: {},
          options: {},
          hooks: {
            preAction: () => {
              CounterCtx.set({ count: 1 })
              return { type: 'continue' }
            },
          },
          action: () => {
            console.log(`cmd1: ${CounterCtx.get().count}`)
          },
        })
      )
      cli.add(
        defineCommand({
          path: 'cmd2',
          args: {},
          options: {},
          hooks: {
            preAction: () => {
              CounterCtx.set({ count: 2 })
              return { type: 'continue' }
            },
          },
          action: () => {
            console.log(`cmd2: ${CounterCtx.get().count}`)
          },
        })
      )

      const mock = createMockCli(cli)

      const result1 = await mock.run(['cmd1'])
      expect(result1.stdout).toContain('cmd1: 1')

      const result2 = await mock.run(['cmd2'])
      expect(result2.stdout).toContain('cmd2: 2')
    })
  })

  describe('constraints', () => {
    it('should enforce exclusive constraint', async () => {
      const cli = defineCli({ name: 'myapp' })
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
              description: 'Cannot use both format and minify',
            },
          ],
          action: () => {},
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['build', '--format', 'esm', '--minify'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Cannot use both')
    })

    it('should enforce dependsOn constraint', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'analyze',
          args: {},
          options: {
            analyze: Optional(Boolean),
            format: Optional(String),
          },
          constraints: [
            {
              type: 'dependsOn',
              option: 'analyze',
              requires: ['format'],
              description: 'Analyze requires format',
            },
          ],
          action: () => {},
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['analyze', '--analyze'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Analyze requires format')
    })

    it('should enforce requiredTogether constraint', async () => {
      const cli = defineCli({ name: 'myapp' })
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
              description: 'Keys must be provided together',
            },
          ],
          action: () => {},
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['auth', '--appKey', 'key123'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('together')
    })

    it('should enforce custom constraint', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'server',
          args: {},
          options: {
            port: Optional(Number),
          },
          constraints: [
            {
              type: 'custom',
              description: 'Port must be > 1024',
              check: (opts: any) => !opts.port || opts.port > 1024,
            },
          ],
          action: () => {},
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['server', '--port', '80'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Port must be > 1024')
    })
  })

  describe('environment variables', () => {
    it('should use env var when option not provided', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            apiKey: String,
          },
          env: {
            prefix: 'MYAPP_',
            bindings: {
              apiKey: 'API_KEY',
            },
          },
          action: (args, options) => {
            console.log(`API Key: ${options.apiKey}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await withEnv({ MYAPP_API_KEY: 'secret123' }, async () => {
        return await mock.run(['deploy'])
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('API Key: secret123')
    })

    it('should prefer CLI option over env var', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            apiKey: String,
          },
          env: {
            prefix: 'MYAPP_',
            bindings: {
              apiKey: 'API_KEY',
            },
          },
          action: (args, options) => {
            console.log(`API Key: ${options.apiKey}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await withEnv(
        { MYAPP_API_KEY: 'from-env' },
        async () => {
          return await mock.run(['deploy', '--apiKey', 'from-cli'])
        }
      )

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('API Key: from-cli')
    })

    it('should apply transform function', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            region: String,
          },
          env: {
            prefix: 'MYAPP_',
            bindings: {
              region: {
                envName: 'DEPLOY_REGION',
                transform: (v: string) => v.toLowerCase(),
              },
            },
          },
          action: (args, options) => {
            console.log(`Region: ${options.region}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await withEnv(
        { MYAPP_DEPLOY_REGION: 'US-WEST' },
        async () => {
          return await mock.run(['deploy'])
        }
      )

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Region: us-west')
    })
  })

  describe('rest parameters', () => {
    it('should collect rest parameters', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'lint',
          args: {},
          options: {},
          rest: String,
          action: (args, options, rest) => {
            console.log(`Files: ${rest?.join(', ')}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['lint', 'src/', 'tests/', 'lib/'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Files: src/, tests/, lib/')
    })

    it('should handle args and rest together', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'copy',
          args: { source: String },
          options: { force: Optional(Boolean) },
          rest: String,
          action: (args, options, rest) => {
            console.log(`Source: ${args.source}`)
            console.log(`Force: ${options.force || false}`)
            console.log(`Targets: ${rest?.join(', ')}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run([
        'copy',
        'file.txt',
        'backup1/',
        'backup2/',
      ])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Source: file.txt')
      expect(result.stdout).toContain('Force: false')
      expect(result.stdout).toContain('Targets: backup1/, backup2/')
    })

    it('should fail when rest parameter validation fails', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'sum',
          args: {},
          options: {},
          rest: Number,
          action: (args, options, rest) => {
            const total = (rest as number[]).reduce((a, b) => a + b, 0)
            console.log(`Sum: ${total}`)
          },
        })
      )

      const mock = createMockCli(cli)
      // 'abc' is not a valid Number
      const result = await mock.run(['sum', '1', 'abc', '3'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Invalid rest arguments')
      expect(result.stderr).toContain('abc')
    })
  })

  describe('complex types', () => {
    it('should handle List type', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'tag',
          args: {},
          options: {
            tags: cfg(List(String), { alias: 't' }),
          },
          action: (args, options) => {
            console.log(`Tags: ${options.tags.join(', ')}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run([
        'tag',
        '--tag',
        'a',
        '--tag',
        'b',
        '--tag',
        'c',
      ])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Tags: a, b, c')
    })

    it('should handle Union type', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'build',
          args: {},
          options: {
            format: cfg(Union(Literal('esm'), Literal('cjs'))),
          },
          action: (args, options) => {
            console.log(`Format: ${options.format}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['build', '--format', 'esm'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Format: esm')
    })

    it('should handle Optional type', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'greet',
          args: { name: String },
          options: {
            greeting: cfg(Optional(String)),
          },
          action: (args, options) => {
            const greeting = options.greeting || 'Hello'
            console.log(`${greeting}, ${args.name}!`)
          },
        })
      )

      const mock = createMockCli(cli)

      const result1 = await mock.run(['greet', 'World'])
      expect(result1.stdout).toContain('Hello, World!')

      const result2 = await mock.run(['greet', 'World', '--greeting', 'Hi'])
      expect(result2.stdout).toContain('Hi, World!')
    })
  })

  describe('full example', () => {
    it('should work like README example', async () => {
      const TraceCtx = defineContext<{ id: string }>()

      const cli = defineCli({
        name: 'deploy',
        globalOptions: {
          verbose: cfg(Optional(Boolean), { description: 'Verbose output', alias: 'v' }),
        },
      })

      cli.add(
        defineCommandGroup({
          path: 'server',
          aliases: ['sv'],
          subCommands: [
            defineCommand({
              path: 'start',
              aliases: ['up'],
              args: { env: String },
              options: {
                port: cfg(Number, { description: 'Port', alias: 'p' }),
              },
              hooks: {
                preAction: () => {
                  TraceCtx.set({ id: 'trace-123' })
                  return { type: 'continue' }
                },
                postAction: () => {
                  console.log(`[${TraceCtx.get().id}] Done`)
                },
              },
              action: (args, options) => {
                console.log(`Starting ${args.env} on port ${options.port}`)
              },
            }),
          ],
        })
      )

      const mock = createMockCli(cli)

      // Test normal execution
      const result1 = await mock.run([
        'server',
        'start',
        'prod',
        '--port',
        '3000',
      ])
      // The command should execute and produce output
      expect(result1.stdout).toContain('Starting')

      // Test alias
      const result3 = await mock.run(['sv', 'up', 'staging', '-p', '4000'])
      expect(result3.stdout).toContain('Starting')
    })
  })

  describe('unknown options', () => {
    it('should reject unknown options with suggestion', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            environment: cfg(String, { alias: 'e' }),
            verbose: cfg(Optional(Boolean), { alias: 'v' }),
          },
          action: () => {},
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['deploy', '--environmnt', 'prod'])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Unknown option')
      expect(result.stderr).toContain('--environmnt')
      expect(result.stderr).toContain('environment')
    })

    it('should accept known options without error', async () => {
      const cli = defineCli({ name: 'myapp' })
      cli.add(
        defineCommand({
          path: 'deploy',
          args: {},
          options: {
            environment: cfg(String, { alias: 'e' }),
          },
          action: (args, options) => {
            console.log(`env: ${options.environment}`)
          },
        })
      )

      const mock = createMockCli(cli)
      const result = await mock.run(['deploy', '--environment', 'prod'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('env: prod')
    })
  })
})
