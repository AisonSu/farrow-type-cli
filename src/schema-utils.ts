import {
  getInstance,
  StructType,
  ObjectType,
  ListType,
  OptionalType,
  NullableType,
  StrictType,
  NonStrictType,
  ReadOnlyType,
  ReadOnlyDeepType,
  UnionType,
  IntersectType,
  LiteralType,
  Boolean as BooleanSchema,
} from 'farrow-schema'
import type { SchemaCtor } from 'farrow-schema'
import type { OptionsSchemaFields } from './types'

/**
 * Extract schema entries from StructType or ObjectType
 * Handles the difference between Struct (descriptors) and ObjectType (direct fields)
 *
 * @param schemaCtor - The schema constructor to extract entries from
 * @returns Array of [key, value] tuples representing schema fields
 *
 * @example
 * // For Struct({ name: String, age: Number })
 * // Returns: [['name', String], ['age', Number]]
 *
 * @example
 * // For ObjectType({ name: String, age: Number })
 * // Returns: [['name', String], ['age', Number]]
 */
export const getSchemaEntries = (
  schemaCtor: new () => ObjectType | StructType
): OptionsSchemaFields => {
  const instance = getInstance(schemaCtor)
  const entries = (
    instance instanceof StructType ? Object.entries(instance.descriptors) : Object.entries(instance)
  ) as OptionsSchemaFields
  return entries
}

/**
 * Extract schema field keys from StructType or ObjectType
 * Returns only the field names (keys), not the values
 *
 * @param schema - The schema constructor to extract keys from
 * @returns Array of field names
 *
 * @example
 * // For Struct({ name: String, age: Number })
 * // Returns: ['name', 'age']
 */
export const getSchemaKeys = (schemaCtor: new () => ObjectType | StructType): string[] => {
  const instance = getInstance(schemaCtor)
  return instance instanceof StructType ? Object.keys(instance.descriptors) : Object.keys(instance)
}

/** 判断 schema 实例是否为包装类型（Optional/Nullable/Strict 等），返回内部 Item */
const unwrapItem = (schema: unknown): SchemaCtor | undefined => {
  if (
    schema instanceof OptionalType ||
    schema instanceof NullableType ||
    schema instanceof StrictType ||
    schema instanceof NonStrictType ||
    schema instanceof ReadOnlyType ||
    schema instanceof ReadOnlyDeepType
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (schema as any).Item as SchemaCtor | undefined
  }
  return undefined
}

/**
 * Determine whether a schema is a List type.
 *
 * Used by:
 * - prepareOptionsInput (to decide whether to keep array values)
 */
export const isListSchema = (
  schemaCtor: SchemaCtor,
  seen: WeakSet<object> = new WeakSet()
): boolean => {
  if (seen.has(schemaCtor)) return false
  seen.add(schemaCtor)
  const schema = getInstance(schemaCtor)
  if (schema instanceof ListType) return true
  const inner = unwrapItem(schema)
  return !!inner && isListSchema(inner, seen)
}

/**
 * Determine whether a schema is optional (value may be absent).
 *
 * Used by:
 * - help.ts (to decide whether a field is required)
 */
export const isOptionalSchema = (
  schemaCtor: SchemaCtor,
  seen: WeakSet<object> = new WeakSet()
): boolean => {
  if (seen.has(schemaCtor)) return false
  seen.add(schemaCtor)
  const schema = getInstance(schemaCtor)
  if (schema instanceof OptionalType) return true
  const inner = unwrapItem(schema)
  return !!inner && isOptionalSchema(inner, seen)
}

/**
 * Determine whether a schema behaves like a boolean flag.
 *
 * Used by:
 * - argv parsing (to decide whether a short option consumes a value)
 * - shell completion (to decide whether an option expects a value)
 */
export const isBooleanSchema = (
  schemaCtor: SchemaCtor,
  seen: WeakSet<object> = new WeakSet()
): boolean => {
  if (seen.has(schemaCtor)) return false
  seen.add(schemaCtor)
  const schema = getInstance(schemaCtor)

  if (schema instanceof BooleanSchema) return true

  // 包装类型：递归解包
  const inner = unwrapItem(schema)
  if (inner) return isBooleanSchema(inner, seen)

  // List(Boolean) is still a flag (can be repeated to collect/count)
  if (schema instanceof ListType) {
    return !!schema.Item && isBooleanSchema(schema.Item, seen)
  }

  // Union/Intersect 类型在 CLI 中具有语义模糊性
  // 例如 Union(Boolean, String) 无法确定 -v 是 flag 还是需要值
  // 统一视为非布尔类型，需要显式传值
  if (schema instanceof UnionType || schema instanceof IntersectType) return false

  // Literal(true) / Literal(false) 视为布尔
  if (schema instanceof LiteralType) return typeof schema.value === 'boolean'

  return false
}
