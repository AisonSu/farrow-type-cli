import { AsyncLocalStorage } from 'node:async_hooks'

export interface ContextToken<T> {
  readonly id: symbol
  set(value: T): void
  get(): T
}

export interface AlsStore {
  contexts: Map<symbol, unknown>
}

export const als = new AsyncLocalStorage<AlsStore>()

/** 哨兵值，区分"未传默认值"和"显式传 undefined" */
const NO_DEFAULT = Symbol('no-default')

function getContextValue<T>(id: symbol, defaultValue: T | typeof NO_DEFAULT): T {
  const store = als.getStore()
  if (!store) {
    throw new Error('Cannot access context outside of CLI execution')
  }

  if (!store.contexts.has(id)) {
    if (defaultValue !== NO_DEFAULT) {
      return defaultValue as T
    }
    throw new Error('Context not set')
  }

  return store.contexts.get(id) as T
}

function setContextValue(id: symbol, value: unknown): void {
  const store = als.getStore()
  if (!store) {
    throw new Error('Cannot access context outside of CLI execution')
  }

  store.contexts.set(id, value)
}

export function defineContext<T>(defaultValue: T): ContextToken<T>
export function defineContext<T>(): ContextToken<T>
export function defineContext<T>(): ContextToken<T> {
  const id = Symbol('context')
  const hasDefault = arguments.length > 0
  const storedDefault: T | typeof NO_DEFAULT = hasDefault ? arguments[0] : NO_DEFAULT

  return {
    id,
    set(value: T) {
      setContextValue(id, value)
    },
    get() {
      return getContextValue(id, storedDefault)
    },
  }
}
