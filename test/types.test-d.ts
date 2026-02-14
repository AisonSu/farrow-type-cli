import { describe, expectTypeOf, it } from 'vitest'
import {
  defineCli,
  defineCommand,
  defineCommandGroup,
  cfg,
  defineContext,
} from '../src/index'
import {
  String,
  Number,
  Boolean,
  List,
  Optional,
  Union,
  Literal,
  Struct,
} from 'farrow-schema'

describe('Type Tests', () => {
  describe('defineCommand types', () => {
    it('should infer args types', () => {
      const cmd = defineCommand({
        path: 'copy',
        args: {
          source: String,
          target: String,
        },
        options: {},
        action: (args) => {
          expectTypeOf(args).toEqualTypeOf<{
            source: string
            target: string
          }>()
        },
      })
    })

    it('should infer options types', () => {
      const cmd = defineCommand({
        path: 'server',
        args: {},
        options: {
          port: cfg(Number),
          verbose: cfg(Boolean),
        },
        action: (args, options) => {
          expectTypeOf(options).toEqualTypeOf<{
            port: number
            verbose: boolean
          }>()
        },
      })
    })

    it('should infer optional types', () => {
      const cmd = defineCommand({
        path: 'greet',
        args: { name: String },
        options: {
          greeting: cfg(Optional(String)),
        },
        action: (args, options) => {
          expectTypeOf(options.greeting).toEqualTypeOf<string | undefined>()
        },
      })
    })

    it('should infer List types', () => {
      const cmd = defineCommand({
        path: 'tags',
        args: {},
        options: {
          tags: cfg(List(String)),
        },
        action: (args, options) => {
          expectTypeOf(options.tags).toEqualTypeOf<string[]>()
        },
      })
    })

    it('should infer Union types', () => {
      const cmd = defineCommand({
        path: 'build',
        args: {},
        options: {
          format: cfg(Union(Literal('esm'), Literal('cjs'))),
        },
        action: (args, options) => {
          expectTypeOf(options.format).toEqualTypeOf<'esm' | 'cjs'>()
        },
      })
    })

    it('should infer rest parameter types', () => {
      const cmd = defineCommand({
        path: 'lint',
        args: {},
        options: {},
        rest: String,
        action: (args, options, rest) => {
          expectTypeOf(rest).toEqualTypeOf<string[]>()
        },
      })
    })

    it('should not have rest parameter when rest is not defined', () => {
      defineCommand({
        path: 'hello',
        args: {},
        options: {},
        action: (args, options) => {
          expectTypeOf(args).toEqualTypeOf<{}>()
          expectTypeOf(options).toEqualTypeOf<{}>()
        },
      })
    })

    it('should infer typed HookInput in command-level hooks', () => {
      defineCommand({
        path: 'deploy',
        args: { env: String },
        options: {
          port: cfg(Number),
          verbose: cfg(Optional(Boolean)),
        },
        hooks: {
          preAction: (input) => {
            expectTypeOf(input.args).toEqualTypeOf<{ env: string }>()
            expectTypeOf(input.options).toEqualTypeOf<{
              port: number
              verbose: boolean | undefined
            }>()
            return { type: 'continue' }
          },
          postAction: (input, result) => {
            expectTypeOf(input.args).toEqualTypeOf<{ env: string }>()
            expectTypeOf(input.options).toEqualTypeOf<{
              port: number
              verbose: boolean | undefined
            }>()
            expectTypeOf(result.success).toEqualTypeOf<boolean>()
          },
        },
        action: () => {},
      })
    })
  })

  describe('cfg types', () => {
    it('should return CliField type', () => {
      const field = cfg(Number, { description: 'Port', alias: 'p' })
      expectTypeOf(field).toHaveProperty('__type')
      expectTypeOf(field).toHaveProperty('description')
      expectTypeOf(field).toHaveProperty('alias')
    })

    it('should work without config', () => {
      const field = cfg(String)
      expectTypeOf(field).toHaveProperty('__type')
    })
  })

  describe('defineContext types', () => {
    it('should create typed context', () => {
      const ctx = defineContext<{ id: string; count: number }>()
      expectTypeOf(ctx.get).returns.toEqualTypeOf<{ id: string; count: number }>()
      expectTypeOf(ctx.set).parameter(0).toEqualTypeOf<{ id: string; count: number }>()
    })

    it('should work with default value', () => {
      const ctx = defineContext({ count: 0 })
      expectTypeOf(ctx.get).returns.toEqualTypeOf<{ count: number }>()
    })
  })

  describe('defineCli types', () => {
    it('should create CLI with global options', () => {
      const cli = defineCli({
        name: 'test',
        globalOptions: {
          verbose: cfg(Boolean),
          config: cfg(Optional(String)),
        },
      })

      expectTypeOf(cli.globalOptionsContext.get).returns.toEqualTypeOf<{
        verbose: boolean
        config: string | undefined
      }>()
    })

    it('should work without global options', () => {
      const cli = defineCli({ name: 'test' })
      expectTypeOf(cli.globalOptionsContext.get).returns.toBeUnknown()
    })
  })

  describe('Constraint types', () => {
    it('should type exclusive constraint', () => {
      defineCommand({
        path: 'test',
        args: {},
        options: {
          a: cfg(Optional(String)),
          b: cfg(Optional(String)),
        },
        constraints: [
          {
            type: 'exclusive',
            options: ['a', 'b'], // Should be typed as (keyof options)[]
          },
        ],
        action: () => {},
      })
    })

    it('should type dependsOn constraint', () => {
      defineCommand({
        path: 'test',
        args: {},
        options: {
          analyze: cfg(Optional(Boolean)),
          format: cfg(Optional(String)),
        },
        constraints: [
          {
            type: 'dependsOn',
            option: 'analyze', // Should be typed as keyof options
            requires: ['format'], // Should be typed as (keyof options)[]
          },
        ],
        action: () => {},
      })
    })

    it('should type requiredTogether constraint', () => {
      defineCommand({
        path: 'test',
        args: {},
        options: {
          key: cfg(Optional(String)),
          secret: cfg(Optional(String)),
        },
        constraints: [
          {
            type: 'requiredTogether',
            options: ['key', 'secret'], // Should be typed as (keyof options)[]
          },
        ],
        action: () => {},
      })
    })

    it('should type custom constraint', () => {
      defineCommand({
        path: 'test',
        args: {},
        options: {
          port: cfg(Optional(Number)),
        },
        constraints: [
          {
            type: 'custom',
            description: 'Port check',
            check: (opts) => {
              // opts should be typed
              return opts.port === undefined || opts.port > 1024
            },
          },
        ],
        action: () => {},
      })
    })
  })

  describe('Env binding types', () => {
    it('should type env bindings', () => {
      defineCommand({
        path: 'deploy',
        args: {},
        options: {
          apiKey: String,
          region: Optional(String),
        },
        env: {
          prefix: 'MYAPP_',
          bindings: {
            apiKey: 'API_KEY',
            region: {
              envName: 'REGION',
              transform: (v) => v.toLowerCase(), // v should be string
            },
          },
        },
        action: () => {},
      })
    })
  })
})
