import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { applyEnvBindings } from '../src/env'

describe('env', () => {
  describe('applyEnvBindings', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should apply simple binding', () => {
      process.env.MYAPP_API_KEY = 'secret123'

      const result = applyEnvBindings(
        { apiKey: 'API_KEY' },
        {},
        'MYAPP_'
      )

      expect(result.apiKey).toBe('secret123')
    })

    it('should apply binding with transform', () => {
      process.env.MYAPP_REGION = 'US-WEST'

      const result = applyEnvBindings(
        {
          region: {
            envName: 'REGION',
            transform: (v: string) => v.toLowerCase(),
          },
        },
        {},
        'MYAPP_'
      )

      expect(result.region).toBe('us-west')
    })

    it('should not override CLI-provided value', () => {
      process.env.MYAPP_API_KEY = 'from-env'

      const result = applyEnvBindings(
        { apiKey: 'API_KEY' },
        { apiKey: 'from-cli' },
        'MYAPP_'
      )

      expect(result.apiKey).toBe('from-cli')
    })

    it('should handle missing env variable', () => {
      delete process.env.MYAPP_API_KEY

      const result = applyEnvBindings(
        { apiKey: 'API_KEY' },
        {},
        'MYAPP_'
      )

      expect(result.apiKey).toBeUndefined()
    })

    it('should handle multiple bindings', () => {
      process.env.MYAPP_API_KEY = 'key123'
      process.env.MYAPP_SECRET = 'secret456'

      const result = applyEnvBindings(
        {
          apiKey: 'API_KEY',
          secret: 'SECRET',
        },
        {},
        'MYAPP_'
      )

      expect(result.apiKey).toBe('key123')
      expect(result.secret).toBe('secret456')
    })

    it('should handle mixed simple and complex bindings', () => {
      process.env.API_KEY = 'key123'
      process.env.DEPLOY_REGION = 'US-EAST'

      const result = applyEnvBindings(
        {
          apiKey: 'API_KEY',
          region: {
            envName: 'DEPLOY_REGION',
            transform: (v: string) => v.toLowerCase(),
          },
        },
        {}
      )

      expect(result.apiKey).toBe('key123')
      expect(result.region).toBe('us-east')
    })

    it('should preserve non-bound options', () => {
      process.env.MYAPP_API_KEY = 'key123'

      const result = applyEnvBindings(
        { apiKey: 'API_KEY' },
        { otherOption: 'value' },
        'MYAPP_'
      )

      expect(result.apiKey).toBe('key123')
      expect(result.otherOption).toBe('value')
    })

    it('should handle empty prefix', () => {
      process.env.API_KEY = 'key123'

      const result = applyEnvBindings(
        { apiKey: 'API_KEY' },
        {},
        ''
      )

      expect(result.apiKey).toBe('key123')
    })

    it('should always add prefix regardless of envName content', () => {
      // 新规则：无论 envName 是什么，始终添加前缀
      process.env.MYAPP_MYAPP_API_KEY = 'key123'

      const result = applyEnvBindings(
        { apiKey: 'MYAPP_API_KEY' },
        {},
        'MYAPP_'
      )

      // envName 'MYAPP_API_KEY' + prefix 'MYAPP_' = 'MYAPP_MYAPP_API_KEY'
      expect(result.apiKey).toBe('key123')
    })

    it('should work with object form and prefix', () => {
      // 对象形式也统一添加前缀
      process.env.MYAPP_DEPLOY_REGION = 'us-west'

      const result = applyEnvBindings(
        {
          region: {
            envName: 'DEPLOY_REGION',
            transform: (v: string) => v.toUpperCase(),
          },
        },
        {},
        'MYAPP_'
      )

      expect(result.region).toBe('US-WEST')
    })

    it('should handle transform returning different type', () => {
      process.env.MYAPP_PORT = '8080'

      const result = applyEnvBindings(
        {
          port: {
            envName: 'PORT',
            transform: (v: string) => parseInt(v, 10),
          },
        },
        {},
        'MYAPP_'
      )

      expect(result.port).toBe(8080)
      expect(typeof result.port).toBe('number')
    })

    it('should handle empty bindings', () => {
      const result = applyEnvBindings({}, { existing: 'value' }, 'MYAPP_')

      expect(result).toEqual({ existing: 'value' })
    })

    it('should handle undefined env variable with transform', () => {
      delete process.env.MYAPP_OPTIONAL

      const result = applyEnvBindings(
        {
          optional: {
            envName: 'OPTIONAL',
            transform: (v: string) => v.toUpperCase(),
          },
        },
        {},
        'MYAPP_'
      )

      expect(result.optional).toBeUndefined()
    })

    it('should throw meaningful error when transform fails', () => {
      process.env.MYAPP_PORT = 'not-a-number'

      expect(() =>
        applyEnvBindings(
          {
            port: {
              envName: 'PORT',
              transform: (v: string) => {
                const n = parseInt(v, 10)
                if (isNaN(n)) throw new Error('expected a number')
                return n
              },
            },
          },
          {},
          'MYAPP_'
        )
      ).toThrow(/Failed to transform env variable MYAPP_PORT for option 'port'/)
    })

    it('should not override CLI value even if CLI value is falsy', () => {
      process.env.MYAPP_COUNT = '99'

      // CLI explicitly passed 0 — env should NOT override
      const result = applyEnvBindings(
        { count: 'COUNT' },
        { count: 0 },
        'MYAPP_'
      )

      expect(result.count).toBe(0)
    })

    it('should skip undefined bindings without throwing', () => {
      const bindings = { apiKey: 'API_KEY', region: undefined } as Record<string, string | undefined>

      const result = applyEnvBindings(bindings as any, {}, 'MYAPP_')

      expect(result).toEqual({})
    })
  })
})
