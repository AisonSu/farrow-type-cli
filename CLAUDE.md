# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**farrow-type-cli** is a type-safe CLI framework with automatic validation powered by farrow-schema. It follows a **Schema-First** philosophy where a single Schema definition provides TypeScript types, runtime validation, and help documentation.

### Core Philosophy

1. **Schema = Types + Validation + Help** - Define once, get everything
2. **Onion Hook Architecture** - Layered pre/post hooks with interception capability
3. **ALS Context** - Type-safe context without parameter drilling via AsyncLocalStorage
4. **Zero-Config Type Safety** - No manual type definitions or validation logic needed

## Common Commands

```bash
# Development
pnpm dev              # Watch mode TypeScript compilation
pnpm build            # Compile TypeScript to dist/
pnpm build:clean      # Clean and rebuild

# Testing
pnpm test             # Run vitest in watch mode
pnpm test:ci          # Run tests once with coverage (for CI)
pnpm test:coverage    # Run tests with coverage report
# Run single test: pnpm test -- test/completion.test.ts

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Run ESLint with auto-fix
pnpm format           # Format with Prettier
pnpm format:check     # Check formatting without writing

# Running Examples
pnpm example          # Run examples/01-basic.ts with tsx

# Release
pnpm commit           # Interactive commit with Commitizen
pnpm release          # Bump version with standard-version
```

## Architecture

### Execution Pipeline

The CLI execution follows a strict 4-phase pipeline in `src/run.ts`:

```
┌─────────┐    ┌─────────┐    ┌─────────────┐    ┌──────────┐
│  Parse  │ →  │  Match  │ →  │  Validate   │ →  │ Execute  │
└─────────┘    └─────────┘    └─────────────┘    └──────────┘
   parse.ts     match.ts      validate.ts       run.ts
```

1. **Parse** (`src/parse.ts`): Raw argv → structured `ParsedArgv`
   - Handles `--key=value`, `-k value`, `-abc` (combined flags), `--` (stop parsing)
   - Auto-parses JSON strings (`--config='{"a":1}'` → object)

2. **Match** (`src/match.ts`): Match positionals against command tree
   - Longest match strategy (prefers `server start` over `server`)
   - Supports command aliases
   - Returns fuzzy suggestions for unknown commands (Levenshtein distance)

3. **Validate** (`src/validate.ts`): Validate against farrow-schema
   - Uses non-strict mode for automatic type coercion
   - Applies option constraints (exclusive, dependsOn, requiredTogether)
   - Constraint checks use `userProvidedKeys` to distinguish user-supplied options from framework-injected Boolean defaults

4. **Execute** (`src/run.ts`): Run hooks → action → post-hooks
   - ALS context initialization
   - Hook chain execution (CLI → Group → Command)

### Hook Execution Order (Onion Model)

```
CLI preAction
  └─> Group preAction (root → leaf, in order)
        └─> Command preAction
              └─> ACTION
        └─> Command postAction
  └─> Group postAction (leaf → root, reverse order)
CLI postAction
```

**Key behaviors:**
- `preAction` can abort execution via `{ type: 'abort', reason: '...' }`
- `preAction` cannot modify input; use ALS Context for data passing between hooks and action
- Abort skips remaining preAction hooks and action, but postAction still runs with `{ success: false, aborted: true }`
- `postAction` receives `{ success, error?, aborted? }` and runs even if action failed or aborted
- `postAction` errors do NOT affect the exit code — errors are logged to stderr as warnings, but the exit code reflects only the action result. If you need postAction failure to cause a non-zero exit, call `process.exit(1)` explicitly in your hook (note: this skips subsequent postAction hooks)

### Module Responsibilities

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports, `defineCli`, `defineCommand`, `defineCommandGroup`, `cfg()` helper |
| `src/types.ts` | All TypeScript type definitions |
| `src/run.ts` | Core execution engine, ALS context management, hook orchestration |
| `src/context.ts` | AsyncLocalStorage-based context with `defineContext()` API |
| `src/parse.ts` | argv parsing, alias resolution, JSON auto-parsing |
| `src/validate.ts` | farrow-schema validation, constraints, fuzzy matching |
| `src/match.ts` | Command tree matching, longest match algorithm, alias extraction |
| `src/help.ts` | Help text generation with schema introspection |
| `src/completion.ts` | Bash/Zsh/Fish shell completion script generation |
| `src/env.ts` | Environment variable binding with priority handling |
| `src/test-helpers.ts` | Mock CLI runner, test utilities |

## Key Features & Implementation

### Schema System (farrow-schema)

Commands use farrow-schema for type-safe validation:

```typescript
import { Struct, Number, String, List, Optional } from 'farrow-schema'

// Args and options support two forms:
defineCommand({
  path: 'deploy',
  args: { target: String },                    // Inline FieldDescriptors
  options: Struct({ env: String }),            // Or Struct() wrapper
  rest: String,                                // Variadic arguments
  action: (args, options, rest) => { /* fully typed */ }
})
```

**Important:** `toSchemaCtor()` converts FieldDescriptors/Struct/ObjectType to schema constructors for validation.

### Schema Introspection Pattern

The framework frequently introspects schemas to extract field information:

```typescript
// Struct types store fields in `descriptors`
// ObjectType stores fields directly on instance
const fields = (instance as any).descriptors
  ? Object.entries((instance as any).descriptors)  // StructType
  : Object.entries(instance)                       // ObjectType
```

This pattern appears in:
- `src/help.ts:extractSchemaInfo()` - Help text generation
- `src/validate.ts:prepareArgsInput()` - Args validation
- `src/match.ts:extractAliasMap()` - Alias resolution

### ALS Context System

Global options and custom contexts use Node.js AsyncLocalStorage:

```typescript
// Define custom context
const TraceCtx = defineContext<{ id: string }>()

// In preAction hook
preAction: () => {
  TraceCtx.set({ id: 'abc-123' })
  return { type: 'continue' }
}

// In action (anywhere in async chain)
action: () => {
  const { id } = TraceCtx.get()  // Type-safe, no parameter passing
}
```

**Global options isolation:**
- Command options and global options are completely isolated
- Global options accessed via `cli.globalOptionsContext.get()`
- This prevents naming conflicts and provides type safety

### Option Constraints

Four constraint types supported (defined as objects):

```typescript
constraints: [
  // Exclusive: only one can be present at a time
  { type: 'exclusive', options: ['format', 'minify'], description: 'Cannot specify both' },

  // Depends on: when option is present, requires must also be present
  { type: 'dependsOn', option: 'analyze', requires: ['format'], description: 'Analyze requires format' },

  // Required together: must appear together or not at all
  { type: 'requiredTogether', options: ['appKey', 'appSecret'], description: 'Keys must be paired' },

  // Custom: arbitrary logic
  { type: 'custom', description: 'Port must be > 1024', check: (opts) => opts.port > 1024 }
]
```

**Note**: Constraint objects have full type inference — the `options` array and `check` function properties are all type-hinted.

**Constraints and Boolean defaults**: Declarative constraints (exclusive/dependsOn/requiredTogether) use `userProvidedKeys` (the set of option keys actually supplied by the user via CLI or env vars) to determine whether an option is "present", rather than checking if the value is `undefined`. This ensures that the Boolean default `false` injected by `prepareOptionsInput` is not mistaken for "user explicitly provided". The `custom` constraint's `check` function receives the full validated options object (including defaults) and must handle this distinction itself.

### Array Handling for Multi-Value Options

When an option receives multiple values (`--tag a --tag b`):

```typescript
// List type: collected as array
options: { tags: cfg(List(String)) }
// $ myapp --tag a --tag b  →  { tags: ['a', 'b'] }

// Non-List type: takes last value
options: { port: cfg(Number) }
// $ myapp --port 80 --port 8080  →  { port: 8080 }
```

### Union Type Parsing

`Union(Boolean, String)` uses **position-sensitive heuristic parsing**:

```typescript
options: {
  verbose: cfg(Union(Boolean, String), { alias: 'v' })
}

// $ myapp -v              → { verbose: true }      (no arg = flag)
// $ myapp -v info         → { verbose: 'info' }    (non-option arg = string)
// $ myapp -v -f           → { verbose: true }      (followed by option = flag)
// $ myapp -v=-debug       → { verbose: '-debug' }  (equals syntax = explicit value)
```

**Key insight**: The parser cannot statically determine if `-v` should be a flag or take a value. It uses the next token to decide:
- If followed by another option (`-f`) or end of args → `true`
- If followed by a non-option value (`info`) → that value as string
- Equals syntax (`-v=value`) always passes the value explicitly

### Short Option Equals Syntax

Use `-v=value` to pass values starting with `-`:

```bash
# Without equals: -debug parsed as another option
$ myapp --level -debug     # ❌ Wrong: level=true, debug=true

# With equals: explicit value passing
$ myapp --level=-debug     # ✅ Correct: level='-debug'
$ myapp -l=-10             # ✅ Correct: level='-10'
```

### Environment Variable Binding

```typescript
env: {
  prefix: 'MYAPP_',           // Environment variable prefix
  bindings: {
    // Short form: envName as suffix, prefix auto-prepended → reads MYAPP_API_KEY
    apiKey: 'API_KEY',

    // Full form: envName also as suffix, prefix auto-prepended → reads MYAPP_DEPLOY_REGION
    region: { envName: 'DEPLOY_REGION', transform: (v) => v.toLowerCase() }
    //             env name suffix                  transform function
  }
}
```

**Unified prefix rule**:
- When `prefix` is configured, all `envName` values (both short and full forms) are treated as **suffixes** with the prefix auto-prepended
- To read env vars without a prefix, simply omit the `prefix` config

**Priority:** CLI args > Environment variables > Code defaults

### Rest Parameters

Capture remaining arguments after fixed args:

```typescript
defineCommand({
  args: { source: String, target: String },  // Fixed args
  rest: String,                              // Remaining args
  action: (args, options, rest) => {
    // args.source, args.target = first two positionals
    // rest = remaining positionals as string[]
  }
})
```

### Shell Completion Generation

Generates native completion scripts for Bash/Zsh/Fish:

```typescript
import { generateCompletion, defineCommand, cfg } from 'farrow-type-cli'
import { Union, Literal } from 'farrow-schema'

// Add a completion command to your CLI
cli.add(
  defineCommand({
    path: 'completion',
    args: {
      shell: cfg(Union(Literal('bash'), Literal('zsh'), Literal('fish'))),
    },
    action: (args) => {
      const script = generateCompletion(cli, args.shell)
      console.log(script)
    },
  })
)

// Usage: myapp completion bash > /etc/bash_completion.d/myapp
```

Features:
- Command and subcommand completion
- Alias support
- Long/short option completion
- Nested command tree handling

## Testing Patterns

### Mock CLI Runner

Use `createMockCli` for unit testing without process spawning:

```typescript
import { createMockCli, createTestCli } from 'farrow-type-cli'

const cli = createTestCli({
  name: 'test',
  commands: [/* ... */]
})

const mock = createMockCli(cli)
const result = await mock.run(['deploy', '--env', 'prod'])

expect(result.exitCode).toBe(0)
expect(result.stdout).toContain('Deployed')
mock.assertOutputContains('success')
```

### Environment Variable Testing

```typescript
import { withEnv } from 'farrow-type-cli'

await withEnv({ API_KEY: 'secret' }, async () => {
  // process.env.API_KEY is temporarily 'secret'
  return await mock.run(['deploy'])
})
```

## Important Implementation Details

### Alias Resolution Flow

Short options are resolved to long options before validation:

```typescript
// Input: -p 3000
// After resolveAliases: { port: 3000 }
// cfg(Number, { alias: 'p' }) creates alias mapping 'p' → 'port'
```

The alias map is extracted from schema fields:
```typescript
// From src/match.ts:extractAliasMap
for (const [key, value] of entries) {
  if (value && typeof value === 'object' && '__type' in value) {
    const fieldInfo = value as CliField
    if (fieldInfo.alias) {
      aliasMap[fieldInfo.alias] = key
    }
  }
}
```

### Command Matching Algorithm

1. Try longest possible path first (depth-first, up to 10 levels)
2. Check command aliases during traversal
3. Return `notFound` with suggestions if no match
4. Support for default commands in groups

```typescript
// From src/match.ts:matchCommand
for (let depth = Math.min(args.length, 10); depth > 0; depth--) {
  const path = args.slice(0, depth)
  const result = findCommandAtPath(commands, path)
  if (result.type === 'command' || result.type === 'group') {
    return result  // Longest match wins
  }
}
```

### Fuzzy Command Matching

When command not found, uses Levenshtein distance to suggest similar commands:

```typescript
// From src/validate.ts:findSimilarCommands
const scored = allNames.map((name) => ({
  name,
  distance: levenshteinDistance(input.toLowerCase(), name.toLowerCase()),
}))
return scored
  .filter((s) => s.distance <= maxDistance && s.distance > 0)
  .sort((a, b) => a.distance - b.distance)
  .slice(0, limit)
  .map((s) => s.name)
```

### Exit Codes

| Scenario | Exit Code |
|----------|-----------|
| Success | 0 |
| Validation failure | 1 |
| Constraint violation | 1 |
| Unknown command | 1 |
| preAction abort | 1 |
| Action error | 1 |
| --help / -h | 0 |
| --version / -v | 0 |

### Code Style & Quality Tools

| Config File | Purpose |
|-------------|---------|
| `.prettierrc` | No semicolons, single quotes, 2-space indent, 100 char width |
| `eslint.config.js` | TypeScript ESLint with strict rules, no explicit any |
| `.lintstagedrc` | Auto-fix TS with ESLint, format with Prettier on commit |
| `commitlint.config.js` | Conventional commits (feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert) |
| `.versionrc.json` | standard-version changelog configuration |
| `.czrc` | Commitizen interactive commit configuration |
| `vitest.config.ts` | Vitest with v8 coverage, includes src/**/*.ts |

## Design Philosophy vs Other Frameworks

### vs Commander.js
- **Commander**: `.option('-p, --port <number>')` → `options.port` is `any`
- **farrow-type-cli**: `options: { port: cfg(Number) }` → `options.port` is `number` with runtime validation

### vs Oclif
- **Oclif**: Plugin ecosystem, heavy dependencies (~500KB), rich lifecycle hooks
- **farrow-type-cli**: No plugins, lighter deps, ALS-based context, type-safe by default

### vs Yargs
- **Yargs**: Middleware pattern, cross-platform, configuration-driven
- **farrow-type-cli**: Hook-based, TypeScript-first, schema-driven

## Common Patterns

### Nested Commands with Default

```typescript
defineCommandGroup({
  path: 'server',
  subCommands: [
    defineCommand({ path: 'start', ... }),
    defineCommand({ path: 'stop', ... })
  ],
  defaultCommand: defineCommand({
    path: 'status',
    action: () => console.log('Server running')
  })
})
// $ myapp server        → runs status
// $ myapp server start  → runs start
```

### cfg() Helper API

```typescript
// Object API
cfg(Number, { description: 'Port number', alias: 'p' })

// With Optional
cfg(Optional(String), { description: 'Optional config' })

// With List (array) - collects multiple values
cfg(List(String), { description: 'Multiple tags' })
```

## Edge Cases

1. **Args + Rest priority**: Fixed args consume positionals first, rest gets remainder
2. **Args field ordering**: Required fields are assigned before optional fields, regardless of definition order. E.g. `{ name: Optional(String), target: String }` assigns the first positional to `target` (required), not `name` (optional). Positionals are consumed sequentially and cannot be skipped — to fill a later optional arg, all preceding optional args must also be filled.
3. **Global vs Command option conflict**: Command options shadow global options; use `cli.globalOptionsContext.get()` for globals
4. **Subcommand same name as parent**: Longest match wins (`server server` matches group→command)
5. **preAction abort**: Stops action and remaining preAction hooks, but postAction still runs with `aborted: true`
6. **Multiple preAction hooks**: Execute in order, any abort stops chain
7. **Struct vs ObjectType**: Struct stores fields in `descriptors`, ObjectType stores directly on instance
8. **List vs non-List**: List types collect all values, non-List types use last value
9. **Union type parsing**: Uses position-sensitive heuristic (see "Union Type Parsing" section above)
10. **Short option equals syntax**: Use `-v=value` to pass values starting with `-`
11. **Reserved option names**: `--help`, `-h`, `--version` are intercepted in `run.ts` before command execution. Users must not define options named `help`, `h`, or `version` in their schemas. Note: `-v` is intentionally NOT reserved for version.
12. **Empty string env vars**: Environment variables with empty string values (`""`) are treated as valid and will be injected into options. Use `transform: (v) => v || undefined` to treat empty strings as unset.
13. **Boolean option defaults**: Non-Optional Boolean options (`cfg(Boolean)`) default to `false` when not provided. `Optional(Boolean)` fields receive no default. This is injected by `prepareOptionsInput` before schema validation.
14. **Boolean explicit values**: Boolean options accept explicit values only via equals syntax (`--verbose=true`, `--verbose=false`). Space syntax (`--verbose true`) treats `true` as a positional argument. farrow-schema coerces `'true'`/`'false'` strings but rejects `'TRUE'`/`'1'`/`'yes'`.
15. **Passing `-` as option value**: `--file -` does not consume `-` as the value (it starts with `-`). Use equals syntax `--file=-` to pass `-` (e.g., for stdin).

### Short Alias Conflicts

When global and command options share the same short alias (e.g., both use `-v`), the **command option always wins**:

```typescript
const cli = defineCli({
  globalOptions: { verbose: cfg(Boolean, { alias: 'v' }) }
})

cli.add(defineCommand({
  path: 'deploy',
  options: { version: cfg(String, { alias: 'v' }) },
  action: (args, options) => {
    // deploy -v 1.0.0 → options.version = '1.0.0'
    // Global verbose NOT set! Use --verbose for global
  }
}))
```

**Priority**: Command short alias > Global short alias > Command long option > Global long option

### Union Type Handling in isBooleanSchema

Union types are treated as non-boolean (requiring values) to avoid parsing ambiguity:

```typescript
// From src/schema-utils.ts:isBooleanSchema
case 'Union':
case 'Intersect':
  // Union/Intersect types have ambiguous semantics in CLI context
  // For example, Union(Boolean, String) cannot be statically determined
  // to be a flag (no value) or value-taking option
  // We conservatively treat them as non-boolean (requires value)
  return false
```

This design decision ensures predictable parsing behavior:
- `-v` with Union(Boolean, String) → `true` (flag, because no value available)
- `-v info` with Union(Boolean, String) → `"info"` (string value)
- `-v=-debug` with Union(Boolean, String) → `"-debug"` (explicit value via equals syntax)

The equals syntax (`-v=value`) is the recommended way to pass values starting with `-`.

## Critical Implementation Details for Maintenance

### TypeScript Type System Boundaries

The framework operates at the intersection of TypeScript's type system and farrow-schema's runtime types:

```typescript
// Compile-time type (TypeScript)
TypeOfDefineSchemaInput<T>  // From farrow-schema

// Runtime type (farrow-schema Validator)
Validator.validate(schema, input, { strict: false })
```

**Key insight**: TypeScript types are erased at runtime. The framework relies on farrow-schema's constructors to provide runtime type information. This is why `cfg()` wraps schema constructors with metadata rather than using raw types.

### Error Handling Strategy

The framework uses three error handling patterns:

1. **Validation errors** (validate.ts): Return `{ success: false, errors: string[] }`
2. **Hook aborts** (run.ts): Return `{ type: 'abort', reason: string }` - graceful exit
3. **Unexpected errors** (run.ts): Catch in executeWithHooks, passed to postAction with `success: false`

**Critical**: postAction hooks run even when action throws, enabling cleanup logic. However, postAction errors are caught and logged to stderr — they never change the exit code. The exit code strictly reflects the action/preAction result (0 for success, 1 for failure/abort).

### Schema Constructor Caching

farrow-schema uses `getInstance()` to cache schema instances:

```typescript
// schema-utils.ts
const instance = getInstance(schemaCtor)
```

This means schema constructors should be pure (no side effects in constructor). The framework assumes calling `new SchemaCtor()` multiple times is safe and cheap due to caching.

### Memory Leak Prevention in ALS

The ALS store uses a Map for contexts (run.ts:395):

```typescript
const contexts = new Map<symbol, unknown>()
await als.run({ contexts }, async () => { ... })
```

Contexts are scoped to the `als.run()` call. After execution completes, the store is garbage collected. No manual cleanup needed.

### Why process.exit is Called Explicitly

After successful action execution (run.ts:512):

```typescript
process.exit(0)
```

This ensures the CLI exits immediately, preventing hanging from:
- Uncleaned timers
- Open database connections
- Pending promises

If you need cleanup, use `postAction` hooks which run before the exit.

### Testing Isolation Pattern

test-helpers.ts uses a critical pattern for test isolation:

```typescript
// Save originals
const originalLog = console.log
// Mock
try {
  console.log = mockLog
  await runCli(cli, argv)
} finally {
  // Always restore
  console.log = originalLog
}
```

This prevents test pollution even when runCli throws or calls process.exit (via ExitError).

## Deep Implementation Insights

### ParseHints Collection Strategy

Before parsing argv, the framework collects ParseHints from all command schemas (run.ts:95-136):

```typescript
const extractParseHints = (schemaCtor): ParseHints => {
  // knownOptions: for GNU abbreviation expansion (--ver → --version)
  // shortOptions: whether each alias takes a value (for POSIX merging)
  // longBooleans: whether each long option is a boolean flag
}
```

**Merge logic for conflicting options** (global vs command):
- `takesValue`: OR merge (if any schema needs a value, it takesValue)
- `isBoolean`: AND merge (only boolean if all schemas agree)

This conservative approach prevents data loss when global and command options share the same name.

### Option Separation Priority

When separating parsed options into command vs global (run.ts:212-232):

```
Priority: Command short alias > Global short alias > Command long option > Global long option
```

This ensures short aliases (most commonly used) resolve to the most specific context (command over global).

### Validation Order Dependencies

The validation pipeline has strict ordering (run.ts:238-375):

1. **Environment variable binding** (before validation)
   - Allows env vars to fill missing values
   - Won't override CLI args

2. **Unknown option detection** (after alias resolution, before schema validation)
   - Catches typos with fuzzy suggestions
   - Avoids confusing "invalid type" errors for unknown options

3. **Schema validation** (farrow-schema with strict: false)
   - Automatic type coercion ("123" → 123)
   - Required field checking

4. **Constraint checking** (after all values are validated)
   - Cross-option validation (exclusive, dependsOn, etc.)
   - Uses `userProvidedKeys` (captured before `prepareOptionsInput`) to distinguish user-supplied options from framework-injected Boolean defaults

### Hook Input Design Asymmetry

There's an intentional asymmetry between hook levels:

```typescript
// Command level: full input with args/options
CommandPreAction: (input: HookInput<TArgs, TOptions>) => HookResult

// Group/CLI level: limited input, no args/options
GroupPreAction: (input: GroupHookInput) => GroupHookResult
```

This design forces cross-command shared logic to use ALS Context rather than manipulating args/options directly, promoting cleaner architecture.

### Schema Introspection Utilities

The `schema-utils.ts` module provides type-aware inspection:

```typescript
// Handles StructType (descriptors field) vs ObjectType (direct fields)
getSchemaEntries(schemaCtor) => [[key, value], ...]

// Recursively checks for List type (unwraps Optional/Nullable)
isListSchema(schemaCtor) => boolean

// Conservative check for boolean flags
isBooleanSchema(schemaCtor) => boolean
// Returns false for Union(Boolean, String) to avoid parsing ambiguity
```

### Why Union(Boolean, String) is Not a Boolean

In `isBooleanSchema` (schema-utils.ts:142):

```typescript
case 'Union':
case 'Intersect':
  // Union types have ambiguous semantics in CLI context
  // For example, Union(Boolean, String) cannot be statically determined
  // to be a flag (no value) or value-taking option
  // We conservatively treat them as non-boolean (requires value)
  return false
```

This means `-v` with `Union(Boolean, String)` will be parsed as `true`, but the parser won't treat it as a "flag that doesn't take a value" for the purposes of option merging. This is why `-v info` works (becomes string `"info"`).
