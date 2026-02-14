# farrow-type-cli

> Type-safe CLI framework where Schema is the source of truth

<p align="center">
  <img src="https://img.shields.io/npm/v/farrow-type-cli" alt="npm version">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue" alt="TypeScript">
  <img src="https://codecov.io/gh/AisonSu/farrow-type-cli/branch/main/graph/badge.svg" alt="Coverage">
  <img src="https://github.com/AisonSu/farrow-type-cli/workflows/CI/badge.svg" alt="CI Status">
</p>

<p align="center">
  <b>English</b> | <a href="./README.zh-CN.md">中文</a>
</p>

## Table of Contents

- [Features](#features)
- [Positioning & Philosophy](#positioning--philosophy)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Basic Usage](#basic-usage)
  - [Positional Arguments (Args)](#positional-arguments-args)
  - [Rest Arguments](#rest-arguments)
  - [Optional Arguments](#optional-arguments)
  - [Option Aliases](#option-aliases)
- [Argument Parsing Rules](#argument-parsing-rules)
  - [Duplicate Options](#duplicate-options)
  - [Using List(Boolean) for Counters](#using-listboolean-for-counters)
  - [Passing Values Starting with `-`](#passing-values-starting-with-)
  - [Union Type Parsing](#union-type-parsing)
- [Advanced Usage](#advanced-usage)
  - [Nested Command Groups](#nested-command-groups)
  - [Command Aliases](#command-aliases)
- [Enterprise Features](#enterprise-features)
  - [Hook System](#hook-system)
  - [Option Constraints](#option-constraints)
  - [Environment Variable Binding](#environment-variable-binding)
  - [ALS Context](#als-context)
  - [Global Options](#global-options)
- [Edge Cases](#edge-cases)
- [Testing Tools](#testing-tools)
- [Shell Completion](#shell-completion)
- [API Reference](#api-reference)
- [Comparison](#comparison)
- [License](#license)

## Features

- 🎯 **Schema-First** - Define commands with Schema, get type safety + runtime validation automatically
- 🧅 **Onion Hooks** - Layered pre/post hooks with input interception and transformation
- 🌲 **Nested Commands** - Unlimited nested subcommands, default commands supported, aliases for both commands and groups
- 🔒 **Option Constraints** - Exclusive, dependency, and paired constraints out of the box
- 🌍 **Environment Variables** - Seamless env var binding with automatic priority handling
- 📦 **ALS Context** - Context without parameter drilling via AsyncLocalStorage
- 🧪 **Testing Friendly** - Built-in mock runner and testing utilities

---

## Positioning & Philosophy

### CLI Framework Decision Guide

| Situation                            | Prescription        | Side Effects                                                        |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------- |
| "Just a script, keep it simple"      | Commander.js        | Type errors make you want to smash keyboard, `.option()` hurts eyes |
| "Building a platform, need plugins"  | Oclif               | Users' fans spin up during install, 3s cold start for coffee time   |
| "Type safety! No manual validation!" | **farrow-type-cli** | Colleagues think you're slacking when they see your code            |

---

### Our Stance

**To Commander.js users**:

> When you write `.option('-p, --port <number>')`, do you really believe `options.port` is a number? No, you know it's `any`, you just choose to close your eyes.

**To Oclif users**:

> Your plugin system is powerful, but users just want to run `hello world`, why wait 3 seconds for cold start?

**To ourselves**:

> We want to prove: TypeScript CLI can have **strong type guarantees**, **sub-second startup**, and **nested commands** without going crazy.

---

### Core in Three Sentences

**1. One Schema = Types + Validation + Help**

```typescript
// Commander users maintain three files:
// types.ts + validate.ts + help.txt ❌

// We do it in one line ✅
options: {
  port: cfg(Number, { description: 'Port number', alias: 'p' })
}
```

**2. Matryoshka Architecture**

```
CLI preAction
  └─> Group preAction
        └─> Command preAction
              └─> action
        └─> Command postAction
  └─> Group postAction
CLI postAction
```

Each layer can intercept, abort, and pass data through ALS Context. No more callback hell.

**3. ALS Context: Goodbye ctx Passing**

> Design inspiration from [farrow-pipeline](https://github.com/farrow-js/farrow/tree/master/packages/farrow-pipeline) Context mechanism.

```typescript
// Koa style: pass ctx layer by layer, ctx.state is any, typos explode at runtime ❌
// Ours: no parameter passing, compile-time type checking, IDE autocomplete ✅

const UserCtx = defineContext<{ id: string }>()
preAction: () => {
  UserCtx.set({ id: '007' })
  return { type: 'continue' }
}
action: () => {
  UserCtx.get().id
} // Exact string type, typos fail at compile time
```

---

### Two "TS Ecosystem Exclusive" Breakthroughs

#### 🏗️ Building a Reservoir in the Desert

TypeScript erases types after compilation. No `get_type_hints()`, no runtime reflection.

We built a complete type system through **farrow-schema**, achieving **compile-time + runtime** unity:

```typescript
options: {
  port: cfg(Number)
}
// Compile time: options.port is number
// Runtime: "abc" automatically errors
// Dev time: help docs auto-generated
```

Difficulty coefficient: Doing type reflection in a type-erased language = **Building a reservoir in the desert, then piping tap water**.

#### 🪝 ALS Type-Safe Context

Koa/Express/Oclif didn't achieve this:

```typescript
// Them: pass ctx layer by layer, ctx.state is any
defineCommand({
  hooks: {
    preAction: () => {
      UserCtx.set(user)
      return { type: 'continue' }
    },
  },
  action: () => {
    UserCtx.get() // Exact type, zero parameters, IDE refactoring friendly
  },
})
```

**Exclusive**: AsyncLocalStorage + Generics = React Hooks style CLI development.

#### 🌍 Perfectly Type-Safe Global Options

The eternal problem of CLI frameworks: **global options**.

```typescript
// Other frameworks: global and command options mixed, any everywhere ❌
// Ours: completely isolated, access via globalOptionsContext with type safety ✅

const cli = defineCli({
  name: 'deploy',
  globalOptions: {
    verbose: cfg(Boolean, { description: 'Verbose logs', alias: 'v' }),
    apiKey: cfg(String, { description: 'API key' }),
  },
})

cli.add(
  defineCommand({
    path: 'prod',
    args: {},
    options: { region: String },
    action: (args, options) => {
      // options only has { region: string }
      // Global options via cli.globalOptionsContext.get()
      const { verbose, apiKey } = cli.globalOptionsContext.get()
      // verbose: boolean, apiKey: string
      // Exact types, never confused
    },
  })
)
```

**Key**: Command options and global options are **completely isolated**, won't pollute action's options parameter, yet can be retrieved type-safely via ALS Context anytime.

---

## Quick Start

### Installation

```bash
npm install farrow-type-cli
```

### Real-World: The "Pretend to Be Busy" CLI for Developers

When the boss walks by, you need a CLI that looks professional, outputs abundantly, but is actually harmless. Let's build one in 5 minutes:

```typescript
import {
  defineCli,
  defineCommand,
  defineCommandGroup,
  cfg,
  run,
  defineContext,
} from 'farrow-type-cli'
import { String, Number, Boolean, Optional, List } from 'farrow-schema'

const cli = defineCli({
  name: 'deploy',
  globalOptions: {
    verbose: cfg(Boolean, { description: 'Verbose logs', alias: 'v' }),
  },
})

// ALS Context: ctx exists like air (unnoticed but essential)
const TraceCtx = defineContext<{ id: string }>()

// Nested commands: server → start (wrapped like Matryoshka dolls)
cli.add(
  defineCommandGroup({
    path: 'server',
    aliases: ['sv'], // Group-level abbreviations, lazy-friendly
    subCommands: [
      defineCommand({
        path: 'start',
        aliases: ['up'], // Lazy-friendly: fewer keystrokes
        args: { env: String },
        options: {
          port: cfg(Number, { description: 'Port', alias: 'p' }),
          workers: cfg(Optional(Number), { description: 'Worker processes' }),
        },
        // Rigorousness that makes the boss nod
        constraints: [
          {
            type: 'exclusive',
            options: ['port', 'workers'],
            description: 'Port and workers are mutually exclusive, no greed',
          },
        ],
        hooks: {
          preAction: () => {
            // Generate trace ID, looks very professional
            TraceCtx.set({ id: Math.random().toString(36).slice(2, 8) })
            const { verbose } = cli.globalOptionsContext.get()
            if (verbose) console.log(`[${TraceCtx.get().id}] Starting...`)
            return { type: 'continue' }
          },
          postAction: () => {
            console.log(
              `[${TraceCtx.get().id}] Done (actually did nothing, but looks professional)`
            )
          },
        },
        action: (args, options) => {
          // options.port is number, not string | any | Schrödinger's cat
          console.log(`Starting ${args.env} on port ${options.port}`)
        },
      }),
    ],
  })
)

run(cli)
```

### Demo

```bash
# 1. Validation interception: want to pass string? No way
$ deploy server start prod -p not-a-number
Invalid options:
  x "not-a-number" is not a valid number

Run 'deploy server start --help' for usage.

# 2. Constraint interception: greed triggers boss alert
$ deploy server start prod -p 8080 --workers 4
Constraint violations:
  x Port and workers are mutually exclusive, no greed

Run 'deploy server start --help' for usage.

# 3. Normal execution: Hooks + ALS Context smooth combo
$ deploy -v server start prod -p 3000
[7a3f9b2] Starting...
Starting prod on port 3000
[7a3f9b2] Done (actually did nothing, but looks professional)

# 4. Aliases: lazy-friendly
$ deploy server up dev -p 8080
Starting dev on port 8080

# 5. Group aliases: fewer keystrokes
$ deploy sv up prod -p 3000
Starting prod on port 3000
```

**Your code**: 40 lines, only Schema and business logic.
**You get**: Validation + Constraints + Types + Help + Hooks + Context.
**Reality**: Boss nods, colleagues cry, only you know - **didn't write a single line of validation code, Schema did it all**.

---

## Core Concepts

### Schema is Truth

Traditional CLI frameworks require defining: **Types** + **Validation** + **Help text** separately. In farrow-type-cli, just define the **Schema**, all three are auto-generated.

```typescript
import { cfg } from 'farrow-type-cli'

// Definition is everything
options: {
  port: cfg(Number, { description: 'Service port', alias: 'p' })
}

// Automatically get:
// ✅ TypeScript type inference (number)
// ✅ Runtime type validation ("abc" → error)
// ✅ Help doc generation (--port <number> Service port)
```

### Supported Schema Types

All types need to be imported from `farrow-schema`:

```typescript
import { String, Number, Boolean, List, Optional, ObjectType } from 'farrow-schema'
```

| Type               | Example             | Description                         |
| ------------------ | ------------------- | ----------------------------------- |
| `String`           | `'hello'`           | String                              |
| `Number`           | `3000`              | Number                              |
| `Boolean`          | `true`              | Boolean                             |
| `List(String)`     | `['a', 'b']`        | Array, supports multi-value options |
| `Optional(Number)` | `3000 \| undefined` | Optional, undefined if not provided |
| `ObjectType`       | `{ host: String }`  | Nested object                       |

### Advanced Schema Types

```typescript
import {
  String,
  Number,
  Boolean,
  Union,
  Literal, // Union type
  Tuple, // Tuple type
  List, // Array type
  Record, // Dictionary type
  Nullable, // Nullable type
  Intersect, // Intersection type
} from 'farrow-schema'
import { defineCommand, cfg } from 'farrow-type-cli'

defineCommand({
  path: 'advanced',
  args: {},
  options: {
    // Union type: restrict to specific values
    format: cfg(Union(Literal('esm'), Literal('cjs'))),

    // Tuple type: fixed-length array
    point: cfg(Tuple(Number, Number), { description: 'Coordinate point [x, y]' }),

    // List type: variable-length array
    tags: cfg(List(String), { description: 'Tag list' }),

    // Record type: key-value pairs
    metadata: cfg(Record(String), { description: 'Metadata' }),

    // Nullable type: string | null
    description: cfg(Nullable(String)),

    // Intersect type: combine multiple types
    // config: cfg(Intersect(BaseConfig, ExtraConfig))
  },
  action: (args, options) => {
    // options.format: 'esm' | 'cjs'
    // options.point: [number, number]
    // options.tags: string[]
    // options.metadata: Record<string, string>
    // options.description: string | null
  },
})
```

---

## Basic Usage

### Positional Arguments (Args)

```typescript
import { defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

defineCommand({
  path: 'copy',
  args: {
    source: String, // 1st argument
    target: String, // 2nd argument
  },
  options: {},
  action: (args) => {
    // args.source, args.target have type inference
    console.log(`Copy ${args.source} to ${args.target}`)
  },
})
```

```bash
$ myapp copy file.txt backup/
```

### Rest Arguments

```typescript
import { defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

defineCommand({
  path: 'lint',
  args: {},
  options: {},
  rest: String, // Capture all remaining arguments
  action: (args, options, rest) => {
    // rest: string[]
    console.log('Files:', rest)
  },
})
```

```bash
$ myapp lint src/ tests/ lib/
# rest = ['src/', 'tests/', 'lib/']
```

### Optional Arguments

```typescript
import { defineCommand } from 'farrow-type-cli'
import { Optional, Number, String } from 'farrow-schema'
import { cfg } from 'farrow-type-cli'

defineCommand({
  path: 'server',
  args: {},
  options: {
    // Required option
    port: cfg(Number, { description: 'Server port', alias: 'p' }),

    // Optional option (wrapped with Optional)
    host: cfg(Optional(String), { description: 'Bind address, default 0.0.0.0' }),
  },
  action: (args, options) => {
    // options.port: number
    // options.host: string | undefined
    const host = options.host ?? '0.0.0.0'
    console.log(`Starting server on ${host}:${options.port}`)
  },
})
```

### Option Aliases

```typescript
import { cfg } from 'farrow-type-cli'
import { Boolean } from 'farrow-schema'

options: {
  // Short option
  verbose: cfg(Boolean, { alias: 'v' }) // -v equals --verbose
}
```

> **POSIX Compliance**: `alias` must be a **single letter or digit character** (type system enforces `ShortOptionChar`). This is because the framework follows POSIX short option standard: `-abc` is parsed as `-a -b -c` three separate flags. If multi-character aliases were allowed (like `alias: 'port'`), `-port` would be wrongly split as `-p -o -r -t`. Use `--port` form for long options.

---

## Argument Parsing Rules

farrow-type-cli supports common **POSIX** and **GNU** argument parsing features:

| Format        | Description                                        | Example                                   |
| ------------- | -------------------------------------------------- | ----------------------------------------- |
| `--key=value` | Long option with equals                            | `--port=3000`                             |
| `--key value` | Long option with space                             | `--port 3000`                             |
| `-k value`    | Short option                                       | `-p 3000`                                 |
| `-abc`        | Combined short options                             | `-abc` = `-a -b -c`                       |
| `-abcvalue`   | Combined with value                                | `-fconfig.json`                           |
| `-k=value`    | Short option equals (for values starting with `-`) | `-v=-debug`                               |
| `--`          | Stop parsing                                       | `-- --port` treats `--port` as positional |
| `-`           | Single dash as positional                          | `cat -`                                   |
| `--ver`       | GNU abbreviation                                   | `--ver` matches `--verbose`               |

### Combined Short Options Rules

Combined short options follow **POSIX left-to-right scanning**:

```bash
# Pure flags: -abc = -a -b -c
$ myapp -abc                    # a=true, b=true, c=true

# With value: remaining chars as value, or consume next arg
$ myapp -fconfig.json           # f='config.json'
$ myapp -abf output.js          # a=true, b=true, f='output.js'

# Equals syntax: value to last option
$ myapp -abc=value              # a=true, b=true, c='value'

# ⚠️ Limitation: only one value-taking option in combination
$ myapp -xyz arg1 arg2          # x='yz', z not set
$ myapp -x arg1 -z arg2         # ✅ correct way
```

### Boolean and Duplicate Options

**Boolean options**: space syntax doesn't consume argument, equals syntax can set `false`

```bash
$ myapp --verbose production    # verbose=true, args.env='production'
$ myapp --verbose=false         # verbose=false (only way)
$ myapp --verbose true          # verbose=true, 'true' becomes positional
```

**Duplicate options handling**:

| Schema Type     | Input Example           | Output             | Description              |
| --------------- | ----------------------- | ------------------ | ------------------------ |
| `List(String)`  | `--tag a --tag b`       | `['a', 'b']`       | Collected as array       |
| `String`        | `--port 80 --port 8080` | `'8080'`           | Last wins                |
| `Boolean`       | `-v -v -v`              | `true`             | Boolean unchanged        |
| `List(Boolean)` | `-vvv`                  | `[true,true,true]` | Can be used for counting |

**Defaults**: `cfg(Boolean)` → `false`, `cfg(Optional(Boolean))` → `undefined`

### Union Types and Special Values

**Passing values starting with `-`** (negative numbers, identifiers):

```bash
$ myapp --level=-debug          # equals syntax for values starting with -
$ myapp --offset=-10
```

**Union(Boolean, String) parsing** (position-sensitive):

| Input       | Result     | Description                             |
| ----------- | ---------- | --------------------------------------- |
| `-v`        | `true`     | No following arg, treated as flag       |
| `-v info`   | `"info"`   | Following non-option, treated as string |
| `-v -f`     | `true`     | Following option, treated as flag       |
| `-v=-debug` | `"-debug"` | Equals syntax, explicit value           |

```typescript
defineCommand({
  options: { verbose: cfg(Union(Boolean, String), { alias: 'v' }) },
  action: (args, opts) => console.log(opts.verbose),
})
```

---

## Advanced Usage

### Nested Command Groups

```typescript
import { defineCli, defineCommand, defineCommandGroup, cfg } from 'farrow-type-cli'
import { Number } from 'farrow-schema'

const cli = defineCli({ name: 'myapp' })

const serverCmd = defineCommandGroup({
  path: 'server',
  aliases: ['sv'], // Command groups also support aliases
  description: 'Server management',
  subCommands: [
    defineCommand({
      path: 'start',
      args: {},
      options: { port: cfg(Number, { description: 'Port number' }) },
      action: (_, opts) => console.log(`Starting on ${opts.port}`),
    }),
    defineCommand({
      path: 'stop',
      args: {},
      options: {},
      action: () => console.log('Stopped'),
    }),
  ],
  // Default command: triggered when running server directly
  // Default command can also have its own aliases
  defaultCommand: defineCommand({
    path: 'status',
    aliases: ['st', 's'],
    args: {},
    options: {},
    action: () => console.log('Server is running'),
  }),
})

cli.add(serverCmd)
```

```bash
$ myapp server start --port 3000
$ myapp server stop
$ myapp server           # Execute default command status
$ myapp server status    # Explicitly execute default command
$ myapp server st        # Use default command alias
$ myapp server s         # Use default command short alias
$ myapp sv start         # Use group alias
$ myapp sv               # group alias + default command = execute status
```

**Alias combination rules**:

- `group alias` can replace `group path`
- `defaultCommand alias` can replace `defaultCommand path`
- Both can be combined: `sv` (group alias) + `st` (defaultCommand alias) = execute status

### Command Aliases

Both commands and command groups support aliases:

```typescript
import { defineCommand, defineCommandGroup } from 'farrow-type-cli'

// Command aliases
defineCommand({
  path: 'deploy',
  aliases: ['d', 'ship'], // Support abbreviations
  args: {},
  options: {},
  action: () => console.log('Deployed!'),
})

// Command group aliases
defineCommandGroup({
  path: 'service',
  aliases: ['svc'], // Group-level abbreviations
  description: 'Manage services',
  subCommands: [
    defineCommand({
      path: 'list',
      aliases: ['ls'],
      args: {},
      options: {},
      action: () => console.log('Listing services...'),
    }),
  ],
})
```

```bash
# Command aliases
$ myapp d              # Equals deploy
$ myapp ship           # Also equals deploy

# Command group aliases
$ myapp svc list       # Equals service list
$ myapp svc ls         # Group alias + command alias combined
```

### Alias Combination with Default Command

When a command group defines both `aliases` and `defaultCommand`, aliases can be combined:

```typescript
defineCommandGroup({
  path: 'deployment',
  aliases: ['dep', 'deploy'], // Group aliases
  description: 'Deployment management',
  subCommands: [
    defineCommand({
      path: 'create',
      aliases: ['add', 'new'],
      args: {},
      options: {},
      action: () => console.log('Creating deployment...'),
    }),
  ],
  defaultCommand: defineCommand({
    path: 'list',
    aliases: ['ls', 'l'], // Default command aliases
    args: {},
    options: {},
    action: () => console.log('Listing deployments...'),
  }),
})
```

```bash
# Full path
$ myapp deployment list           # Show deployment list
$ myapp deployment create         # Create deployment

# Use group alias
$ myapp dep list                  # dep = deployment
$ myapp deploy ls                 # deploy = deployment, ls = list

# Use group alias to access default command
$ myapp dep                       # Execute list (default command)
$ myapp dep ls                    # dep = deployment, ls = list
$ myapp dep l                     # dep = deployment, l = list

# Mixed usage
$ myapp deploy add                # deploy = deployment, add = create
```

**Priority rules**:

1. Exact path takes priority over alias
2. Subcommand takes priority over default command
3. Aliases can be arbitrarily combined (group alias + command alias)

---

## Enterprise Features

### Hook System

Onion model execution order, supports interception (via abort):

```typescript
import { defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

defineCommand({
  path: 'deploy',
  args: {},
  options: { env: String },
  hooks: {
    // preAction: execute before action
    preAction: async (input) => {
      console.log('Deploying to:', input.options.env)

      // Permission check
      if (!checkAuth()) {
        return { type: 'abort', reason: 'Unauthorized' }
      }

      // Return continue to proceed with action
      return { type: 'continue' }
    },

    // postAction: execute after action
    postAction: (input, result) => {
      if (result.success) {
        console.log('✅ Deployment successful')
      } else {
        console.log('❌ Deployment failed:', result.error?.message)
      }
    },
  },
  action: (args, options) => {
    // Execute deployment...
  },
})
```

**Execution order** (CLI → Group → Command):

```
CLI preAction
  └─> Group preAction
        └─> Command preAction
              └─> ACTION
        └─> Command postAction
  └─> Group postAction
CLI postAction
```

**Type inference for command-level hooks**:

Command-level `preAction` and `postAction` automatically infer `args` and `options` types, no manual annotation needed:

```typescript
defineCommand({
  path: 'deploy',
  args: { env: String },
  options: {
    port: cfg(Number),
    verbose: cfg(Optional(Boolean)),
  },
  hooks: {
    preAction: (input) => {
      // input.args.env is string
      // input.options.port is number
      // input.options.verbose is boolean | undefined
      return { type: 'continue' }
    },
    postAction: (input, result) => {
      // input type same as preAction
      // result.success is boolean
      // result.error is Error | undefined
    },
  },
  action: () => {},
})
```

CLI and Group level hooks **do NOT contain `args` and `options`**, only receive `{ command, fullPath }`. This is intentional design: cross-command shared logic should pass data through ALS Context, not through input:

```typescript
const TraceCtx = defineContext<{ id: string }>()

const cli = defineCli({
  name: 'myapp',
  hooks: {
    preAction: (input) => {
      // input.command - current executing command
      // input.fullPath - full command path
      // No input.args / input.options!
      TraceCtx.set({ id: generateId() })
      return { type: 'continue' }
    },
  },
})
```

### Option Constraints

```typescript
import { defineCommand, cfg } from 'farrow-type-cli'
import { String, Boolean, List } from 'farrow-schema'

defineCommand({
  path: 'build',
  args: {},
  options: {
    format: String,
    minify: Boolean,
    analyze: Boolean,
    appKey: String,
    appSecret: String,
    tags: cfg(List(String), { description: 'Tag list' }),
  },
  constraints: [
    // Exclusive: only one allowed
    {
      type: 'exclusive',
      options: ['format', 'minify'],
      description: 'Cannot specify both format and minify',
    },

    // Dependency: choosing A requires choosing B
    {
      type: 'dependsOn',
      option: 'analyze',
      requires: ['format'],
      description: 'Analyze mode requires format',
    },

    // Paired: must appear together
    {
      type: 'requiredTogether',
      options: ['appKey', 'appSecret'],
      description: 'Keys must be provided together',
    },
  ],
  action: (args, options) => {
    console.log(options.tags)
  },
})
```

### Environment Variable Binding

```typescript
import { defineCommand, cfg } from 'farrow-type-cli'
import { Optional, String } from 'farrow-schema'

defineCommand({
  path: 'deploy',
  args: {},
  options: {
    apiKey: cfg(String, { description: 'API key' }),
    region: cfg(Optional(String), { description: 'Deployment region' }),
  },
  env: {
    prefix: 'MYAPP_', // Prefix filtering
    bindings: {
      // Short form
      apiKey: 'API_KEY', // Bind MYAPP_API_KEY

      // Full form (transform return type must match corresponding option Schema type)
      region: {
        envName: 'DEPLOY_REGION',
        transform: (v) => v.toLowerCase(),
      },
    },
  },
  action: (args, opts) => {
    // Priority: CLI args > env vars
    // If neither provided, use code default
    const region = opts.region ?? 'cn-hangzhou'
    console.log(opts.apiKey) // From MYAPP_API_KEY
  },
})
```

```bash
# Method 1: CLI args (highest priority)
$ myapp deploy --apiKey secret123 --region us-west

# Method 2: Environment variables (used when CLI not provided)
$ export MYAPP_API_KEY=secret123
$ export MYAPP_DEPLOY_REGION=US-WEST
$ myapp deploy
# region = "us-west" (auto lowercased)

# Method 3: Code default (when neither provided)
$ myapp deploy
# region = "cn-hangzhou"
```

> **Global options also support env var binding**: Use `env` field in `defineCli`, same usage as command-level `env`:
>
> ```typescript
> const cli = defineCli({
>   name: 'myapp',
>   globalOptions: { apiKey: cfg(String) },
>   env: {
>     prefix: 'MYAPP_',
>     bindings: { apiKey: 'API_KEY' }, // Read MYAPP_API_KEY
>   },
> })
> ```

### ALS Context

Access context anywhere without passing layer by layer:

```typescript
import { defineCommand, defineContext } from 'farrow-type-cli'

// Define context (can set defaults)
const RequestContext = defineContext<{ requestId: string }>()
const ConfigContext = defineContext<{ debug: boolean }>({ debug: false })

// Helper: generate trace ID
const generateId = () => Math.random().toString(36).slice(2, 10)

// Set in hook
defineCommand({
  path: 'api',
  args: {},
  options: {},
  hooks: {
    preAction: (input) => {
      RequestContext.set({ requestId: generateId() })
      return { type: 'continue' }
    },
  },
  action: async () => {
    // Get anytime in async operations
    const { requestId } = RequestContext.get()

    await fetch('/api', {
      headers: { 'X-Request-ID': requestId },
    })
  },
})
```

### Global Options

Global options are auto-validated by Schema, accessed via `cli.globalOptionsContext.get()` with type safety:

```typescript
import { defineCli, defineCommand, cfg } from 'farrow-type-cli'
import { Optional, Boolean, String } from 'farrow-schema'

const cli = defineCli({
  name: 'myapp',
  globalOptions: {
    verbose: cfg(Boolean, { description: 'Show verbose logs' }),
    config: cfg(Optional(String), { description: 'Config file path' }),
  },
})

// Global options auto-validated, access via Context
cli.add(
  defineCommand({
    path: 'cmd',
    args: {},
    options: {},
    hooks: {
      preAction: (input) => {
        // Get validated global options (type-safe)
        const globalOpts = cli.globalOptionsContext.get()

        if (globalOpts.verbose) {
          console.log('Verbose mode enabled')
        }

        if (globalOpts.config) {
          // Read config file...
        }

        return { type: 'continue' }
      },
    },
    action: (args, options) => {
      // options only contains options defined by this command, completely isolated from global options
      console.log(options)
    },
  })
)
```

---

## Edge Cases

### 1. Rest vs Args Priority

`args` take positional parameters first, remainder goes to `rest`:

```bash
$ myapp copy a.txt b.txt c.txt d.txt
# args.source='a.txt', args.target='b.txt', rest=['c.txt', 'd.txt']
```

**Note**: Required fields assigned before optional; positional args cannot be skipped.

### 2. Environment Variable Naming

| Configuration                                 | Variable Read            |
| --------------------------------------------- | ------------------------ |
| `prefix: 'MYAPP_'` + `apiKey: 'API_KEY'`      | `MYAPP_API_KEY`          |
| `prefix: 'MYAPP_'` + `{ envName: 'DB_HOST' }` | `MYAPP_DB_HOST`          |
| No `prefix`                                   | Reads `envName` directly |

Empty strings are valid; use `transform: (v) => v || undefined` to treat as unset.

### 3. Subcommand with Same Name as Parent

```typescript
import { defineCli, defineCommand, defineCommandGroup } from 'farrow-type-cli'

const cli = defineCli({ name: 'myapp' })

// Define server command group
cli.add(
  defineCommandGroup({
    path: 'server',
    subCommands: [
      // Subcommand also called server (same as parent group)
      defineCommand({
        path: 'server',
        args: {},
        options: {},
        action: () => console.log('server server'),
      }),
      defineCommand({
        path: 'stop',
        args: {},
        options: {},
        action: () => console.log('server stop'),
      }),
    ],
  })
)

// $ myapp server server  → matches server/server command
```

**Matching rules**: longest match wins; subcommand takes priority over parent group.

### 4. Alias and Option Conflicts

| Conflict Scenario         | Priority      | Description                                    |
| ------------------------- | ------------- | ---------------------------------------------- |
| Group alias vs subcommand | Subcommand    | `$ myapp svc` matches `svc` subcommand first   |
| Short alias conflict      | Command-level | Global and command both use `-v`, command wins |
| Global vs command option  | Command       | Global via `cli.globalOptionsContext.get()`    |

> **Short alias conflict**: If global and command options share short alias (like `-v`), **command option wins**. Global options need long form (like `--verbose`).

#### Short Alias Conflict Resolution Strategy

When global and command options use same short alias (like `-v`), framework uses **conservative merge**: prefers `takesValue=true` to prevent value loss.

```bash
$ myapp deploy -v 1.0.0     # ✅ Correctly parsed
$ myapp deploy -v           # ❌ Error: -v needs value (even if global -v is flag)
```

**Why not command-level precise parsing?**

Precise parsing requires "match command first → then parse options by command config", but this causes circular dependency:

- Matching command needs parsed positional args
- Parsing options needs to know which command matched

Two-pass parsing is possible but doubles core flow complexity. We choose **simplicity first**: short alias conflicts are edge cases, recommend using long options (`--verbose` / `--version`) or different short aliases (`-v` / `-V`).

#### Short Alias Conflict Best Practices

To avoid unexpected behavior from short alias conflicts, follow these conventions:

| Scenario                     | Recommended Solution                | Example                                       |
| ---------------------------- | ----------------------------------- | --------------------------------------------- |
| Global flag + command option | Global uppercase, command lowercase | Global `-V` (verbose), Command `-v` (version) |
| Both are flags               | Can share, but avoid                | When both use `-f`, command wins              |
| Both need value              | Strictly avoid                      | Causes parsing ambiguity                      |
| One flag one value           | **Must avoid**                      | `-v` being both flag and value option         |

**Design principles**:

1. Global options prefer **uppercase short aliases** (`-V`, `-C`, `-D`)
2. Command-level options use **lowercase short aliases** (`-v`, `-c`, `-d`)
3. Or global options **don't use short aliases**, only long options (`--verbose`, `--config`)

### 5. preAction Abort and postAction

**Behavior rules**:

| Trigger          | action  | postAction             |
| ---------------- | ------- | ---------------------- |
| preAction abort  | ❌ Skip | ✅ Run (aborted=true)  |
| action throws    | ❌ Fail | ✅ Run (success=false) |
| action completes | ✅ Run  | ✅ Run (success=true)  |

**Execution order** (onion model):

```
CLI preAction → Group preAction → Command preAction → ACTION
                                                  ↓
CLI postAction ← Group postAction ← Command postAction
```

- Abort stops chain immediately, but postAction still runs in reverse order
- postAction errors don't affect exit code (force failure with `process.exit(1)`)

### 6. Global Error Handling

#### Error Handling

CLI auto-outputs formatted errors (validation failure, constraint violation, command not found, etc.). In `postAction` check result via `result.success`:

```typescript
postAction: (input, result) => {
  if (!result.success) {
    reportError(result.error)
    cleanupTempFiles()
  }
}
```

**Exit codes**: Normal/help/version → 0; Error/abort → 1

> **Note**: Command success calls `process.exit(0)` immediately. For async cleanup, handle synchronously in `postAction`.

### 7. Reserved Option Names

| Option          | Behavior                      | Note                              |
| --------------- | ----------------------------- | --------------------------------- |
| `--help` / `-h` | Show help, exit 0             | Don't define `help` / `h` options |
| `--version`     | Show version, exit 0          | Don't define `version` option     |
| `-v`            | **Not reserved**, free to use | Usually for `--verbose`           |

---

## Testing Tools

### Mock Runner

```typescript
import { createMockCli, createTestCli } from 'farrow-type-cli'

// Create test CLI
const cli = createTestCli({
  name: 'test',
  commands: [
    /* ... */
  ],
})

// Mock run
const mock = createMockCli(cli)
const result = await mock.run(['deploy', '--env', 'prod'])

// Assertions
expect(result.exitCode).toBe(0)
expect(result.stdout).toContain('Deployed')
mock.assertOutputContains('success')
mock.assertExitCode(0)
```

**Mock assertion methods**:

```typescript
// Get all output
const { stdout, stderr } = mock.getOutputs()

// Assert output contains
mock.assertOutputContains('Deployed') // Check stdout
mock.assertErrorContains('error message') // Check stderr
mock.assertExitCode(0) // Check exit code
```

### Environment Variable Simulation

```typescript
import { withEnv, runCli, defineCli, defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

// Assume existing CLI instance
const cli = defineCli({ name: 'myapp' })
cli.add(
  defineCommand({
    path: 'deploy',
    args: {},
    options: { apiKey: String },
    action: (_, opts) => console.log(`Deploying with ${opts.apiKey}`),
  })
)

const result = await withEnv({ API_KEY: 'secret-123' }, async () => {
  // In this scope, process.env.API_KEY = 'secret-123'
  return await runCli(cli, ['deploy'])
})
```

---

## Shell Completion

Auto-generate Bash/Zsh/Fish completion scripts.

```typescript
import { generateCompletion, defineCommand, cfg } from 'farrow-type-cli'
import { Union, Literal } from 'farrow-schema'

// Add completion command to your CLI
cli.add(
  defineCommand({
    path: 'completion',
    args: {
      shell: cfg(Union(Literal('bash'), Literal('zsh'), Literal('fish'))),
    },
    options: {},
    action: (args) => {
      const script = generateCompletion(cli, args.shell)
      console.log(script)
    },
  })
)
```

**Completion contents**:

- Commands and subcommands (including nested levels)
- Command aliases
- Long options (`--port`) and short options (`-p`)
- Global options

**Note**: Completion scripts are statically generated from CLI Schema. Dynamic content (like option values from server) needs custom extension.

**Install completion scripts**:

```bash
# Bash (~/.bashrc)
eval "$(myapp completion bash)"

# Zsh (~/.zshrc)
eval "$(myapp completion zsh)"

# Fish (~/.config/fish/completions/myapp.fish)
myapp completion fish | source
```

Or generate static script files:

```bash
# Generate and save
myapp completion bash > /etc/bash_completion.d/myapp
myapp completion zsh > /usr/local/share/zsh/site-functions/_myapp
myapp completion fish > ~/.config/fish/completions/myapp.fish
```

---

## API Reference

### Core Functions

| Function                     | Description                               |
| ---------------------------- | ----------------------------------------- |
| `defineCli(config)`          | Define CLI instance                       |
| `defineCommand(config)`      | Define command                            |
| `defineCommandGroup(config)` | Define command group                      |
| `cfg(schema, config?)`       | Simplified option definition (object API) |
| `run(cli, argv?)`            | Run CLI                                   |
| `createMockCli(cli)`         | Create mock runner                        |

### cfg() Detailed Usage

```typescript
import { cfg } from 'farrow-type-cli'
import { Number, String, Boolean, Optional, List } from 'farrow-schema'

// Object API (alias must be single character, POSIX compliant)
port: cfg(Number, { description: 'Port number', alias: 'p' })

// Optional value
region: cfg(Optional(String), { description: 'Deployment region' })

// Array (multi-value option)
tags: cfg(List(String), { description: 'Tag list' })
```

### defineCommand() Common Configuration

```typescript
import { defineCommand, cfg } from 'farrow-type-cli'
import { String, Number, Boolean, Optional } from 'farrow-schema'

defineCommand({
  path: 'deploy', // Command path (required)
  aliases: ['d'], // Aliases
  description: 'Deploy application', // Description
  args: { env: String }, // Positional args
  options: {
    // Option definitions
    port: cfg(Number, { alias: 'p' }),
    verbose: cfg(Boolean, { alias: 'v' }),
    config: cfg(Optional(String), { description: 'Config file' }),
  },
  rest: String, // Rest args (optional)
  constraints: [
    // Option constraints
    { type: 'exclusive', options: ['port', 'dryRun'] }, // Exclusive
  ],
  hooks: {
    // Command-level hooks (input has full type inference for args/options)
    preAction: (input) => {
      // input.args.env: string
      // input.options.port: number
      return { type: 'continue' }
    },
    postAction: (input, result) => {
      // input type same as preAction
      // result.success: boolean
    },
  },
  env: {
    // Environment variable binding
    prefix: 'APP_',
    bindings: { apiKey: 'API_KEY' },
  },
  action: (args, options, rest) => {
    // Execute function (required)
    // args: { env: string }
    // options: { port: number, verbose: boolean }
    // rest: string[] (if rest defined)
  },
})
```

### defineCli() Common Configuration

```typescript
import { defineCli, cfg } from 'farrow-type-cli'
import { Boolean, Optional, String } from 'farrow-schema'

const cli = defineCli({
  name: 'myapp', // CLI name (required)
  version: '1.0.0', // Version
  description: 'My CLI tool', // Description
  globalOptions: {
    // Global options
    verbose: cfg(Boolean, { alias: 'v' }),
    config: cfg(Optional(String)),
  },
  hooks: {
    // Global hooks (input only has { command, fullPath }, no args/options)
    preAction: (input) => {
      // input.command - current command
      // input.fullPath - full path
      return { type: 'continue' }
    },
    postAction: (input, result) => {},
  },
})

// Add commands
cli.add(command1, command2)
cli.add([command3, command4])

// Get global options (in action/hook)
const { verbose } = cli.globalOptionsContext.get()
```

### defineCommandGroup() Common Configuration

```typescript
import { defineCommandGroup, defineCommand } from 'farrow-type-cli'

defineCommandGroup({
  path: 'server',                    // Group path (required)
  aliases: ['sv'],                   // Group aliases (optional)
  hidden: true,                     // Hidden (optional, for help/completion)
  description: 'Server management', // Description
  subCommands: [                     // Subcommand list (required)
    defineCommand({ path: 'start', args: {}, options: {}, ... }),
    defineCommand({ path: 'stop', args: {}, options: {}, ... })
  ],
  defaultCommand: defineCommand({    // Default command (optional)
    path: 'status',
    args: {},
    options: {},
    action: () => console.log('Running')
  }),
  hooks: {                           // Group-level hooks (input only has { command, fullPath })
    preAction: (input) => { return { type: 'continue' } }
  }
})
```

### Context API (ALS Context)

Context system design inspired by [farrow-pipeline](https://github.com/farrow-js/farrow/tree/master/packages/farrow-pipeline) Context mechanism, based on Node.js `AsyncLocalStorage`, access context anywhere without passing layer by layer.

```typescript
import { defineContext } from 'farrow-type-cli'

// Define context (can set defaults)
const RequestContext = defineContext<{ id: string }>()
const ConfigContext = defineContext<{ debug: boolean }>({ debug: false })

// Set in preAction
preAction: () => {
  RequestContext.set({ id: generateId() })
  return { type: 'continue' }
}

// Get in action (anywhere)
action: async () => {
  const { id } = RequestContext.get() // string
  const { debug } = ConfigContext.get() // boolean
}
```

### Testing Tools API

```typescript
import { createMockCli, withEnv, captureError } from 'farrow-type-cli'

// Create mock runner
const mock = createMockCli(cli)
const result = await mock.run(['deploy', '--env', 'prod'])

// Assertions
expect(result.exitCode).toBe(0)
expect(result.stdout).toContain('success')
mock.assertOutputContains('Deployed')
mock.assertExitCode(0)

// Simulate environment variables
await withEnv({ API_KEY: 'secret' }, async () => {
  return await mock.run(['deploy'])
})

// Capture error
const error = await captureError(async () => {
  await mock.run(['invalid-command'])
})
```

### Schema Types

```typescript
import {
  String,
  Number,
  Boolean,
  Int,
  Float,
  List,
  Optional,
  Nullable,
  ObjectType,
  Struct,
} from 'farrow-schema'
```

> **Note**: Since farrow has been in construction for a long time, official docs may not be detailed enough. We provide third-party reference: https://farrow-doc.vercel.app/

### Constraint Definitions

```typescript
// Exclusive: --format and --minify cannot be used together
{ type: 'exclusive', options: ['format', 'minify'], description: 'Cannot specify both' }

// Dependency: using --analyze requires --format
{ type: 'dependsOn', option: 'analyze', requires: ['format'] }

// Paired: --appKey and --appSecret must appear together
{ type: 'requiredTogether', options: ['appKey', 'appSecret'] }

// Custom: port must be > 1024
{ type: 'custom', description: 'Must be > 1024', check: (opts) => opts.port > 1024 }
```

> **Note**: `exclusive`/`dependsOn`/`requiredTogether` use `userProvidedKeys` to determine if user explicitly provided the option, avoiding Boolean default `false` being mistaken as "user specified".

### Utility Functions

```typescript
// Environment variable binding (defined in env.bindings)
// Short form: 'API_KEY'  →  with prefix: 'MYAPP_' reads MYAPP_API_KEY
// Full form: { envName: 'DEPLOY_REGION', transform: (v) => v }
// Note: with prefix, envName is suffix, prefix auto-added
//       transform return type must match corresponding option type

// Testing tools
withEnv(env, fn) // Simulate environment variable execution
wait(ms) // Async wait
captureError(fn) // Capture async error
```

---

## Comparison

### Feature Matrix

| Feature                | farrow-type-cli   | Oclif         | Yargs         | Commander.js |
| ---------------------- | ----------------- | ------------- | ------------- | ------------ |
| **Type Safety**        | ⭐⭐⭐⭐⭐        | ⭐⭐          | ⭐⭐          | ⭐⭐         |
| **Runtime Validation** | ✅ Schema-driven  | ⚠️ Manual     | ⚠️ Manual     | ❌ None      |
| **Nested Subcommands** | ✅ Unlimited      | ✅ Yes        | ✅ Yes        | ✅ Yes       |
| **Hook System**        | ✅ Layered        | ✅ Rich       | ⚠️ Middleware | ✅ Basic     |
| **Plugin Ecosystem**   | ❌ No (by design) | ✅ Strong     | ❌ No         | ❌ No        |
| **Bundle Size**        | Medium            | Large         | Medium        | Small        |
| **Install Size**       | ~100KB + deps     | ~500KB + deps | ~200KB + deps | ~50KB        |

### Use Case Comparison

| Tool                | Best For                                                   | Core Advantage                                 |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| **farrow-type-cli** | TypeScript teams, nested commands, type-sensitive projects | Schema once, get types + validation + docs     |
| **Oclif**           | Platform CLI (e.g., Heroku CLI), need plugin ecosystem     | Rich lifecycle hooks, user-installable plugins |
| **Yargs**           | Cross-platform (Node/Deno), config-driven projects         | Middleware pattern, config inheritance         |
| **Commander.js**    | Simple scripts, examples, size-sensitive scenes            | Minimal API, smallest dependency               |

---

### Design Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│  Design Philosophy Spectrum                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Full-featured ◄──────────────────────────────► Minimal     │
│                                                             │
│  Oclif ──── farrow-type-cli ──── Yargs ──── Commander      │
│   (Platform)   (Engineering)     (Tool)      (Library)      │
│                                                             │
│  Built-in      Core complete     Middleware   Free-form     │
│  Plugins       Composable        Config       Extension     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Decision Tree

```
Need user-installable plugins?
├── Yes → Oclif
└── No → Care about type safety?
         ├── Yes → Need complex nested commands?
         │         ├── Yes → farrow-type-cli
         │         └── No → Consider Commander + Zod
         └── No → Need Middleware?
                   ├── Yes → Yargs
                   └── No → Commander.js
```

---

## License

[MIT](./LICENSE)

---

## Acknowledgments

- [farrow](https://github.com/farrow-js/farrow) - Powerful Schema type system
- [farrow-pipeline](https://github.com/farrow-js/farrow/tree/master/packages/farrow-pipeline) - Inspiration for Context mechanism design
- [@Lucifier129](https://github.com/Lucifier129) - Author of farrow, master of TypeScript type system artistry
- **[Kimi Code](https://www.kimi.com/code)** ⭐ **Highly Recommended** - Deeply involved in architecture design and code review, the soul partner of this project

## Related Projects

- [koka-ts/koka](https://github.com/koka-ts/koka) - Lightweight TypeScript library (only 3kB) based on algebraic effects, alternative to Effect-TS
- [remesh-js/remesh](https://github.com/remesh-js/remesh) - DDD framework for large-scale frontend applications

---

<p align="center">
  Made with ❤️ using <a href="https://github.com/farrow-js/farrow">farrow-schema</a>
</p>
