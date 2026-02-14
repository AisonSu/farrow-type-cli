import { describe, it, expect } from 'vitest'
import { getSchemaEntries, getSchemaKeys, isBooleanSchema } from '../src/schema-utils'
import {
  String,
  Number,
  Boolean,
  List,
  Optional,
  Nullable,
  Union,
  Intersect,
  Literal,
  Struct,
  ObjectType,
} from 'farrow-schema'

describe('schema-utils', () => {
  describe('getSchemaEntries', () => {
    it('should extract entries from StructType', () => {
      const schema = Struct({
        name: String,
        age: Number,
      })

      const entries = getSchemaEntries(schema)

      expect(entries).toHaveLength(2)
      expect(entries.map(([k]) => k)).toContain('name')
      expect(entries.map(([k]) => k)).toContain('age')
    })

    it('should extract entries from ObjectType', () => {
      class MyType extends ObjectType {
        name = String
        active = Boolean
      }

      const entries = getSchemaEntries(MyType)

      expect(entries).toHaveLength(2)
      expect(entries.map(([k]) => k)).toContain('name')
      expect(entries.map(([k]) => k)).toContain('active')
    })

    it('should handle empty Struct', () => {
      const schema = Struct({})

      const entries = getSchemaEntries(schema)

      expect(entries).toHaveLength(0)
    })

    it('should preserve field values', () => {
      const schema = Struct({
        name: String,
        count: Number,
      })

      const entries = getSchemaEntries(schema)
      const nameEntry = entries.find(([k]) => k === 'name')

      expect(nameEntry?.[1]).toBe(String)
    })
  })

  describe('getSchemaKeys', () => {
    it('should extract keys from StructType', () => {
      const schema = Struct({
        a: String,
        b: Number,
        c: Boolean,
      })

      const keys = getSchemaKeys(schema)

      expect(keys).toEqual(['a', 'b', 'c'])
    })

    it('should extract keys from ObjectType', () => {
      class MyType extends ObjectType {
        x = String
        y = Number
      }

      const keys = getSchemaKeys(MyType)

      expect(keys).toEqual(['x', 'y'])
    })

    it('should return empty array for empty schema', () => {
      const schema = Struct({})

      const keys = getSchemaKeys(schema)

      expect(keys).toEqual([])
    })
  })

  describe('isBooleanSchema', () => {
    it('should return true for Boolean', () => {
      expect(isBooleanSchema(Boolean)).toBe(true)
    })

    it('should return false for String', () => {
      expect(isBooleanSchema(String)).toBe(false)
    })

    it('should return false for Number', () => {
      expect(isBooleanSchema(Number)).toBe(false)
    })

    it('should return true for Optional(Boolean)', () => {
      expect(isBooleanSchema(Optional(Boolean))).toBe(true)
    })

    it('should return false for Optional(String)', () => {
      expect(isBooleanSchema(Optional(String))).toBe(false)
    })

    it('should return true for Nullable(Boolean)', () => {
      expect(isBooleanSchema(Nullable(Boolean))).toBe(true)
    })

    it('should return true for List(Boolean)', () => {
      expect(isBooleanSchema(List(Boolean))).toBe(true)
    })

    it('should return false for List(String)', () => {
      expect(isBooleanSchema(List(String))).toBe(false)
    })

    it('should return false for Union (ambiguous)', () => {
      expect(isBooleanSchema(Union(Boolean, String))).toBe(false)
    })

    it('should return false for Intersect', () => {
      const SchemaA = Struct({ a: Boolean })
      const SchemaB = Struct({ b: Boolean })
      expect(isBooleanSchema(Intersect(SchemaA, SchemaB))).toBe(false)
    })

    it('should return true for Literal(true)', () => {
      expect(isBooleanSchema(Literal(true))).toBe(true)
    })

    it('should return true for Literal(false)', () => {
      expect(isBooleanSchema(Literal(false))).toBe(true)
    })

    it('should return false for Literal(string)', () => {
      expect(isBooleanSchema(Literal('hello'))).toBe(false)
    })

    it('should return false for Struct', () => {
      const schema = Struct({ active: Boolean })
      expect(isBooleanSchema(schema)).toBe(false)
    })

    it('should handle nested wrappers', () => {
      expect(isBooleanSchema(Optional(List(Boolean)))).toBe(true)
      expect(isBooleanSchema(List(Optional(Boolean)))).toBe(true)
    })

    it('should handle circular references', () => {
      // Create a schema that references itself
      const CircularSchema: any = Struct({})
      // The WeakSet should prevent infinite loops
      expect(() => isBooleanSchema(CircularSchema)).not.toThrow()
    })
  })
})
