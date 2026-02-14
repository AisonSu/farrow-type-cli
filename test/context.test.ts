import { describe, it, expect } from 'vitest'
import { defineContext, als } from '../src/context'

describe('context', () => {
  describe('defineContext', () => {
    it('should create a context token with unique id', () => {
      const ctx1 = defineContext<string>()
      const ctx2 = defineContext<string>()

      expect(ctx1.id).toBeDefined()
      expect(ctx2.id).toBeDefined()
      expect(ctx1.id).not.toBe(ctx2.id)
    })

    it('should support default value', () => {
      const ctx = defineContext({ count: 0 })

      als.run({ contexts: new Map() }, () => {
        // Before setting, should throw or use default
        expect(ctx.get()).toEqual({ count: 0 })
      })
    })

    it('should work without default value', () => {
      const ctx = defineContext<string>()

      als.run({ contexts: new Map() }, () => {
        expect(() => ctx.get()).toThrow('Context not set')
      })
    })
  })

  describe('set/get', () => {
    it('should set and get value in ALS context', () => {
      const ctx = defineContext<string>()

      als.run({ contexts: new Map() }, () => {
        ctx.set('hello')
        expect(ctx.get()).toBe('hello')
      })
    })

    it('should update value', () => {
      const ctx = defineContext<number>()

      als.run({ contexts: new Map() }, () => {
        ctx.set(1)
        expect(ctx.get()).toBe(1)

        ctx.set(2)
        expect(ctx.get()).toBe(2)
      })
    })

    it('should throw when accessing outside ALS context', () => {
      const ctx = defineContext<string>()

      expect(() => ctx.get()).toThrow('Cannot access context outside of CLI execution')
      expect(() => ctx.set('value')).toThrow('Cannot access context outside of CLI execution')
    })
  })

  describe('context isolation', () => {
    it('should isolate contexts between different ALS runs', async () => {
      const ctx = defineContext<number>()

      const run1 = als.run({ contexts: new Map() }, async () => {
        ctx.set(100)
        await new Promise((resolve) => setTimeout(resolve, 10))
        return ctx.get()
      })

      const run2 = als.run({ contexts: new Map() }, async () => {
        ctx.set(200)
        await new Promise((resolve) => setTimeout(resolve, 5))
        return ctx.get()
      })

      const [result1, result2] = await Promise.all([run1, run2])
      expect(result1).toBe(100)
      expect(result2).toBe(200)
    })

    it('should handle nested ALS contexts', () => {
      const ctx = defineContext<number>()

      als.run({ contexts: new Map() }, () => {
        ctx.set(1)
        expect(ctx.get()).toBe(1)

        als.run({ contexts: new Map() }, () => {
          ctx.set(2)
          expect(ctx.get()).toBe(2)
        })

        expect(ctx.get()).toBe(1)
      })
    })
  })

  describe('complex types', () => {
    it('should handle object values', () => {
      interface User {
        id: string
        name: string
      }
      const ctx = defineContext<User>()

      als.run({ contexts: new Map() }, () => {
        const user = { id: '1', name: 'Alice' }
        ctx.set(user)
        expect(ctx.get()).toEqual(user)
        expect(ctx.get().name).toBe('Alice')
      })
    })

    it('should handle array values', () => {
      const ctx = defineContext<string[]>()

      als.run({ contexts: new Map() }, () => {
        ctx.set(['a', 'b', 'c'])
        expect(ctx.get()).toHaveLength(3)
        expect(ctx.get()[1]).toBe('b')
      })
    })

    it('should handle nested context tokens', () => {
      const ctxA = defineContext<string>()
      const ctxB = defineContext<number>()

      als.run({ contexts: new Map() }, () => {
        ctxA.set('hello')
        ctxB.set(42)

        expect(ctxA.get()).toBe('hello')
        expect(ctxB.get()).toBe(42)
      })
    })
  })
})
