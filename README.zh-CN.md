# farrow-type-cli

> 类型安全的 CLI 框架，Schema 即真理

<p align="center">
  <img src="https://img.shields.io/npm/v/farrow-type-cli" alt="npm version">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue" alt="TypeScript">
  <img src="https://codecov.io/gh/AisonSu/farrow-type-cli/branch/main/graph/badge.svg" alt="Coverage">
  <img src="https://github.com/AisonSu/farrow-type-cli/workflows/CI/badge.svg" alt="CI Status">
</p>

<p align="center">
  <a href="./README.md">English</a> | <b>中文</b>
</p>

## 目录

- [特性](#特性)
- [定位与哲学](#定位与哲学)
- [快速开始](#快速开始)
- [核心理念](#核心理念)
- [基础用法](#基础用法)
  - [位置参数 (Args)](#位置参数-args)
  - [剩余参数 (Rest)](#剩余参数-rest)
  - [可选参数](#可选参数)
  - [选项别名](#选项别名)
- [参数解析规则](#参数解析规则)
  - [重复选项处理](#重复选项处理)
  - [使用 List(Boolean) 实现计数](#使用-listboolean-实现计数)
  - [传递以 `-` 开头的值](#传递以--开头的值)
  - [Union 类型的解析行为](#union-类型的解析行为)
- [进阶用法](#进阶用法)
  - [嵌套命令组](#嵌套命令组)
  - [命令别名](#命令别名)
- [企业级特性](#企业级特性)
  - [钩子系统 (Hooks)](#钩子系统-hooks)
  - [选项约束与转换](#选项约束与转换)
  - [环境变量绑定](#环境变量绑定)
  - [ALS 上下文 (Context)](#als-上下文-context)
  - [全局选项](#全局选项)
- [边缘情况与注意事项](#边缘情况与注意事项)
- [测试工具](#测试工具)
- [Shell 补全](#shell-补全)
- [API 速查](#api-速查)
- [与同类产品对比](#与同类产品对比)
- [许可证](#许可证)

## 特性

- 🎯 **Schema-First** - 用 Schema 定义命令，自动获得类型安全 + 运行时验证
- 🧅 **洋葱钩子** - 分层 pre/post 钩子，支持输入拦截和转换
- 🌲 **嵌套命令** - 无限层级子命令，支持默认命令，命令和命令组都支持别名
- 🔒 **选项约束** - 互斥、依赖、联动约束开箱即用
- 🌍 **环境变量** - 无缝绑定环境变量，优先级自动处理
- 📦 **ALS 上下文** - AsyncLocalStorage 实现的无透传上下文
- 🧪 **测试友好** - 内置 Mock 运行器和测试工具

---

## 定位与哲学

### CLI 框架就诊指南

| 症状                             | 处方                | 副作用                                   |
| -------------------------------- | ------------------- | ---------------------------------------- |
| "我就写个脚本，要啥自行车"       | Commander.js        | 类型报错时想砸键盘，`.option()` 读到眼瞎 |
| "我要做平台，让全世界给我写插件" | Oclif               | 用户安装时风扇狂转，冷启动喝杯咖啡       |
| "类型安全！不手写验证！"         | **farrow-type-cli** | 同事看你写代码傻笑，以为你在摸鱼         |

---

### 我们的态度

**对 Commander.js 用户说**：

> 你写 `.option('-p, --port <number>')` 时，心里真的相信 `options.port` 是 number 吗？不，你心知肚明它是 `any`，只是选择闭上眼睛。

**对 Oclif 用户说**：

> 你的插件系统很强大，但用户只是想跑个 `hello world`，为什么要等 3 秒冷启动？

**对自己说**：

> 我们要证明：TypeScript CLI 可以既有**强类型保证**，又有**秒级启动**，还能写**嵌套命令**而不发疯。

---

### 三句话讲清核心

**1. 一份 Schema = 类型 + 验证 + 帮助**

```typescript
// Commander 用户维护三份文件：
// types.ts + validate.ts + help.txt ❌

// 我们一行搞定 ✅
options: {
  port: cfg(Number, { description: '端口', alias: 'p' })
}
```

**2. 俄罗斯套娃架构**

```
CLI preAction
  └─ Group preAction
        └─ Command preAction
              └─ action
        └─ Command postAction
  └─ Group postAction
CLI postAction
```

每层都能拦截、终止，并通过 ALS Context 传递数据。剥洋葱时不流泪。

**3. ALS Context：告别 ctx 击鼓传花**

> 设计灵感来自 [farrow-pipeline](https://github.com/farrow-js/farrow/tree/master/packages/farrow-pipeline) 的 Context 机制。

```typescript
// Koa 风格：层层透传，ctx.state 是 any，拼写错误运行时才炸 ❌
// 我们：无参数传递，编译时类型检查，IDE 自动补全 ✅

const UserCtx = defineContext<{ id: string }>()
preAction: () => {
  UserCtx.set({ id: '007' })
  return { type: 'continue' }
}
action: () => {
  UserCtx.get().id
} // 精确 string，写错编译报错
```

---

### 两项「TS 生态独一份」的突破

#### 🏗️ 在沙漠里建水库

TypeScript 编译后类型擦除殆尽。没有 `get_type_hints()`，没有运行时反射。

我们通过 **farrow-schema** 自建完整类型系统，实现**编译时 + 运行时**统一：

```typescript
options: {
  port: cfg(Number)
}
// 编译时：options.port 是 number
// 运行时：输入 "abc" 自动报错
// 开发时：帮助文档自动生成
```

难度系数：在类型擦除的语言里做类型反射 = **沙漠里建水库，然后通自来水**。

#### 🪝 ALS 类型安全上下文

Koa/Express/Oclif 都没做到：

```typescript
// 他们：层层透传 ctx，ctx.state 是 any
defineCommand({
  hooks: {
    preAction: () => {
      UserCtx.set(user)
      return { type: 'continue' }
    },
  },
  action: () => {
    UserCtx.get() // 精确类型，零参数，IDE 重构友好
  },
})
```

**独家**：AsyncLocalStorage + 泛型 = React Hooks 风格的 CLI 开发。

#### 🌍 全局选项的完美类型安全

CLI 框架的老大难问题：**全局选项**。

```typescript
// 其他框架：全局选项和命令选项混在一起，any 满天飞 ❌
// 我们：完全隔离，通过 globalOptionsContext 类型安全访问 ✅

const cli = defineCli({
  name: 'deploy',
  globalOptions: {
    verbose: cfg(Boolean, { description: '详细日志', alias: 'v' }),
    apiKey: cfg(String, { description: 'API 密钥' }),
  },
})

cli.add(
  defineCommand({
    path: 'prod',
    args: {},
    options: { region: String },
    action: (args, options) => {
      // options 只有 { region: string }
      // 全局选项通过 cli.globalOptionsContext.get() 获取
      const { verbose, apiKey } = cli.globalOptionsContext.get()
      // verbose: boolean, apiKey: string
      // 类型精确，绝不混淆
    },
  })
)
```

**关键**：命令选项和全局选项**完全隔离**，不会污染 action 的 options 参数，又能随时通过 ALS Context 类型安全地获取。

---

## 快速开始

### 安装

```bash
npm install farrow-type-cli
```

### 实战：开发者的「假装很忙」CLI

老板走过时，你需要一个看起来专业、输出满满、实则 harmless 的 CLI。让我们 5 分钟造一个：

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
    verbose: cfg(Boolean, { description: '详细日志', alias: 'v' }),
  },
})

// ALS Context：让 ctx 像空气一样存在（无感但必需）
const TraceCtx = defineContext<{ id: string }>()

// 嵌套命令：server → start（像俄罗斯套娃一样层层包裹）
cli.add(
  defineCommandGroup({
    path: 'server',
    aliases: ['sv'], // 组级别的缩写，同样懒癌福音
    subCommands: [
      defineCommand({
        path: 'start',
        aliases: ['up'], // 懒癌福音：少打几个字
        args: { env: String },
        options: {
          port: cfg(Number, { description: '端口', alias: 'p' }),
          workers: cfg(Optional(Number), { description: '工作进程' }),
        },
        // 老板看了点头的严谨性检查
        constraints: [
          {
            type: 'exclusive',
            options: ['port', 'workers'],
            description: '端口和进程数互斥，不要贪心',
          },
        ],
        hooks: {
          preAction: () => {
            // 生成追踪 ID，看起来很像那么回事
            TraceCtx.set({ id: Math.random().toString(36).slice(2, 8) })
            const { verbose } = cli.globalOptionsContext.get()
            if (verbose) console.log(`[${TraceCtx.get().id}] 开始...`)
            return { type: 'continue' }
          },
          postAction: () => {
            console.log(`[${TraceCtx.get().id}] 完成（其实啥也没干，但看起来很专业）`)
          },
        },
        action: (args, options) => {
          // options.port 是 number，不是 string | any | 薛定谔的猫
          console.log(`启动 ${args.env} 于端口 ${options.port}`)
        },
      }),
    ],
  })
)

run(cli)
```

### 效果演示

```bash
# 1. 验证拦截：想传字符串？门儿都没有
$ deploy server start prod -p not-a-number
Invalid options:
  x "not-a-number" is not a valid number

Run 'deploy server start --help' for usage.

# 2. 约束拦截：贪心触发老板的警觉
$ deploy server start prod -p 8080 --workers 4
Constraint violations:
  x 端口和进程数互斥，不要贪心

Run 'deploy server start --help' for usage.

# 3. 正常执行：Hooks + ALS Context 丝滑连招
$ deploy -v server start prod -p 3000
[7a3f9b2] 开始...
启动 prod 于端口 3000
[7a3f9b2] 完成（其实啥也没干，但看起来很专业）

# 4. 别名：懒癌患者的福音
$ deploy server up dev -p 8080
启动 dev 于端口 8080

# 5. 组别名：更少的打字
$ deploy sv up prod -p 3000
启动 prod 于端口 3000
```

**你写的代码**：40 行，只有 Schema 和业务逻辑。
**你获得的**：验证 + 约束 + 类型 + 帮助 + 钩子 + Context。
**实际情况**：老板看了点头，同事看了流泪，只有你自己心里清楚——**一行校验代码都没写，全让 Schema 给干了。**

---

## 核心理念

### Schema 即真理

传统 CLI 框架需要分别定义：**类型** + **验证** + **帮助文本**。在 farrow-type-cli 中，只需定义 **Schema**，三者自动生成。

```typescript
import { cfg } from 'farrow-type-cli'

// 定义即一切
options: {
  port: cfg(Number, { description: '服务端口', alias: 'p' })
}

// 自动获得：
// ✅ TypeScript 类型推导 (number)
// ✅ 运行时类型验证 ("abc" → 报错)
// ✅ 帮助文档生成 (--port <number> 服务端口)
```

### 支持的 Schema 类型

所有类型需从 `farrow-schema` 导入：

```typescript
import { String, Number, Boolean, List, Optional, ObjectType } from 'farrow-schema'
```

| 类型               | 示例                | 说明                       |
| ------------------ | ------------------- | -------------------------- |
| `String`           | `'hello'`           | 字符串                     |
| `Number`           | `3000`              | 数值                       |
| `Boolean`          | `true`              | 布尔                       |
| `List(String)`     | `['a', 'b']`        | 数组，支持多值选项         |
| `Optional(Number)` | `3000 \| undefined` | 可选值，不填为 `undefined` |
| `ObjectType`       | `{ host: String }`  | 嵌套对象                   |

### 高级 Schema 类型

```typescript
import {
  String,
  Number,
  Boolean,
  Union,
  Literal, // 联合类型
  Tuple, // 元组类型
  List, // 数组类型
  Record, // 字典类型
  Nullable, // 可空类型
  Intersect, // 交叉类型
} from 'farrow-schema'
import { defineCommand, cfg } from 'farrow-type-cli'

defineCommand({
  path: 'advanced',
  args: {},
  options: {
    // 联合类型：限制为特定值
    format: cfg(Union(Literal('esm'), Literal('cjs'))),

    // 元组类型：固定长度数组
    point: cfg(Tuple(Number, Number), { description: '坐标点 [x, y]' }),

    // 列表类型：可变长度数组
    tags: cfg(List(String), { description: '标签列表' }),

    // 字典类型：键值对
    metadata: cfg(Record(String), { description: '元数据' }),

    // 可空类型：string | null
    description: cfg(Nullable(String)),

    // 交叉类型：合并多个类型
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

## 基础用法

### 位置参数 (Args)

```typescript
import { defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

defineCommand({
  path: 'copy',
  args: {
    source: String, // 第1个参数
    target: String, // 第2个参数
  },
  options: {},
  action: (args) => {
    // args.source, args.target 均有类型推导
    console.log(`Copy ${args.source} to ${args.target}`)
  },
})
```

```bash
$ myapp copy file.txt backup/
```

### 剩余参数 (Rest)

```typescript
import { defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

defineCommand({
  path: 'lint',
  args: {},
  options: {},
  rest: String, // 捕获所有剩余参数
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

### 可选参数

```typescript
import { defineCommand } from 'farrow-type-cli'
import { Optional, Number, String } from 'farrow-schema'
import { cfg } from 'farrow-type-cli'

defineCommand({
  path: 'server',
  args: {},
  options: {
    // 必填选项
    port: cfg(Number, { description: '服务端口号', alias: 'p' }),

    // 可选选项（使用 Optional 包装）
    host: cfg(Optional(String), { description: '绑定地址，默认为 0.0.0.0' }),
  },
  action: (args, options) => {
    // options.port: number
    // options.host: string | undefined
    const host = options.host ?? '0.0.0.0'
    console.log(`Starting server on ${host}:${options.port}`)
  },
})
```

### 选项别名

```typescript
import { cfg } from 'farrow-type-cli'
import { Boolean } from 'farrow-schema'

options: {
  // 短选项
  verbose: cfg(Boolean, { alias: 'v' }) // -v 等同于 --verbose
}
```

> **POSIX 合规**：`alias` 必须是**单个字母或数字字符**（类型系统强制约束为 `ShortOptionChar`）。这是因为框架遵循 POSIX 短选项标准：`-abc` 会被解析为 `-a -b -c` 三个独立 flag。如果允许多字符别名（如 `alias: 'port'`），`-port` 会被错误拆分为 `-p -o -r -t`。长选项请使用 `--port` 形式。

---

## 参数解析规则

farrow-type-cli 支持常用的 **POSIX** 和 **GNU** 参数解析特性：

### 已实现的解析特性

| 格式          | 说明                                  | 示例                                 |
| ------------- | ------------------------------------- | ------------------------------------ |
| `--key=value` | 长选项等号赋值                        | `--port=3000`                        |
| `--key value` | 长选项空格赋值                        | `--port 3000`                        |
| `-k value`    | 短选项（自动识别是否需要值）          | `-p 3000`                            |
| `-abc`        | 组合短选项                            | `-abc` 等价于 `-a -b -c`             |
| `-abcvalue`   | 组合选项带值（自动识别）              | `-fconfig.json`                      |
| `-k=value`    | 短选项等号赋值（传递以 `-` 开头的值） | `-v=-debug` 设置值为 `-debug`        |
| `--`          | 停止解析                              | `-- --port` 中的 `--port` 是位置参数 |
| `-`           | 单横线作为位置参数                    | `cat -` 中的 `-` 是文件名            |
| `--ver`       | GNU 缩写（唯一前缀匹配）              | `--ver` 匹配 `--verbose`             |
| `--`          | 长选项前导双横线                      | `--help`                             |

### 组合短选项规则

组合短选项（如 `-abc`）遵循 **POSIX 从左到右扫描**规则：

```bash
# 纯 flags：-abc = -a -b -c
$ myapp -abc                    # a=true, b=true, c=true

# 带值选项：剩余字符作为值，或消费下一个参数
$ myapp -fconfig.json           # f='config.json'
$ myapp -abf output.js          # a=true, b=true, f='output.js'

# 等号语法：值赋给最后一个选项
$ myapp -abc=value              # a=true, b=true, c='value'

# ⚠️ 限制：组合中只能有一个带值选项生效
$ myapp -xyz arg1 arg2          # x='yz'，z 未被设置
$ myapp -x arg1 -z arg2         # ✅ 正确做法
```

### Boolean 与重复选项

**Boolean 选项**：空格语法不消费参数，等号语法可设 `false`

```bash
$ myapp --verbose production    # verbose=true, args.env='production'
$ myapp --verbose=false         # verbose=false（唯一方式）
$ myapp --verbose true          # verbose=true, 'true' 成为位置参数
```

**重复选项处理**：

| Schema 类型     | 输入示例                | 输出值             | 说明       |
| --------------- | ----------------------- | ------------------ | ---------- |
| `List(String)`  | `--tag a --tag b`       | `['a', 'b']`       | 收集为数组 |
| `String`        | `--port 80 --port 8080` | `'8080'`           | 取最后一个 |
| `Boolean`       | `-v -v -v`              | `true`             | 布尔值不变 |
| `List(Boolean)` | `-vvv`                  | `[true,true,true]` | 可用于计数 |

**默认值**：`cfg(Boolean)` → `false`，`cfg(Optional(Boolean))` → `undefined`

### Union 类型与特殊值

**传递以 `-` 开头的值**（负数值、标识符）：

```bash
$ myapp --level=-debug          # 等号语法传递以 - 开头的值
$ myapp --offset=-10
```

**Union(Boolean, String) 解析行为**（位置敏感）：

| 输入        | 结果       | 说明                     |
| ----------- | ---------- | ------------------------ |
| `-v`        | `true`     | 后面无参数，作为 flag    |
| `-v info`   | `"info"`   | 后跟非选项值，作为字符串 |
| `-v -f`     | `true`     | 后跟选项，作为 flag      |
| `-v=-debug` | `"-debug"` | 等号语法，显式指定值     |

```typescript
defineCommand({
  options: { verbose: cfg(Union(Boolean, String), { alias: 'v' }) },
  action: (args, opts) => console.log(opts.verbose),
})
```

---

## 进阶用法

### 嵌套命令组

```typescript
import { defineCli, defineCommand, defineCommandGroup, cfg } from 'farrow-type-cli'
import { Number } from 'farrow-schema'

const cli = defineCli({ name: 'myapp' })

const serverCmd = defineCommandGroup({
  path: 'server',
  aliases: ['sv'], // 命令组也支持别名
  description: '服务管理',
  subCommands: [
    defineCommand({
      path: 'start',
      args: {},
      options: { port: cfg(Number, { description: '端口号' }) },
      action: (_, opts) => console.log(`Starting on ${opts.port}`),
    }),
    defineCommand({
      path: 'stop',
      args: {},
      options: {},
      action: () => console.log('Stopped'),
    }),
  ],
  // 默认命令：直接执行 server 时触发
  // 默认命令也可以有自己的别名
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
$ myapp server           # 执行默认命令 status
$ myapp server status    # 显式执行默认命令
$ myapp server st        # 使用默认命令别名
$ myapp server s         # 使用默认命令短别名
$ myapp sv start         # 使用 group 别名
$ myapp sv               # group 别名 + 默认命令 = 执行 status
```

**别名组合规则**：

- `group 别名` 可以替代 `group 路径`
- `defaultCommand 别名` 可以替代 `defaultCommand 路径`
- 两者可以组合使用：`sv` (group别名) + `st` (defaultCommand别名) = 执行 status

### 命令别名

命令和命令组都支持别名：

```typescript
import { defineCommand, defineCommandGroup } from 'farrow-type-cli'

// 命令别名
defineCommand({
  path: 'deploy',
  aliases: ['d', 'ship'], // 支持缩写
  args: {},
  options: {},
  action: () => console.log('Deployed!'),
})

// 命令组别名
defineCommandGroup({
  path: 'service',
  aliases: ['svc'], // 组级别的缩写
  description: '管理服务',
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
# 命令别名
$ myapp d              # 等同于 deploy
$ myapp ship           # 也等同于 deploy

# 命令组别名
$ myapp svc list       # 等同于 service list
$ myapp svc ls         # 组别名 + 命令别名组合
```

### 别名组合与默认命令

当命令组同时定义了 `aliases` 和 `defaultCommand` 时，别名可以组合使用：

```typescript
defineCommandGroup({
  path: 'deployment',
  aliases: ['dep', 'deploy'], // 组别名
  description: '部署管理',
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
    aliases: ['ls', 'l'], // 默认命令别名
    args: {},
    options: {},
    action: () => console.log('Listing deployments...'),
  }),
})
```

```bash
# 完整路径
$ myapp deployment list           # 显示部署列表
$ myapp deployment create         # 创建部署

# 使用组别名
$ myapp dep list                  # dep = deployment
$ myapp deploy ls                 # deploy = deployment, ls = list

# 使用组别名访问默认命令
$ myapp dep                       # 执行 list（默认命令）
$ myapp dep ls                    # dep = deployment, ls = list
$ myapp dep l                     # dep = deployment, l = list

# 混合使用
$ myapp deploy add                # deploy = deployment, add = create
```

**优先级规则**：

1. 精确路径优先于别名
2. 子命令优先于默认命令
3. 别名可以任意组合（group别名 + command别名）

---

## 企业级特性

### 1. 钩子系统 (Hooks)

洋葱模型执行顺序，支持拦截（通过 abort）：

```typescript
import { defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

defineCommand({
  path: 'deploy',
  args: {},
  options: { env: String },
  hooks: {
    // preAction: 在 action 前执行
    preAction: async (input) => {
      console.log('Deploying to:', input.options.env)

      // 权限检查
      if (!checkAuth()) {
        return { type: 'abort', reason: '未授权' }
      }

      // 返回 continue 继续执行 action
      return { type: 'continue' }
    },

    // postAction: 在 action 后执行
    postAction: (input, result) => {
      if (result.success) {
        console.log('✅ 部署成功')
      } else {
        console.log('❌ 部署失败:', result.error?.message)
      }
    },
  },
  action: (args, options) => {
    // 执行部署...
  },
})
```

**执行顺序**（CLI → Group → Command）：

```
CLI preAction
  └─> Group preAction
        └─> Command preAction
              └─> ACTION
        └─> Command postAction
  └─> Group postAction
CLI postAction
```

**命令级钩子的类型推导**：

命令级 `preAction` 和 `postAction` 会自动推导 `args` 和 `options` 的类型，无需手动标注：

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
      // input.args.env 是 string
      // input.options.port 是 number
      // input.options.verbose 是 boolean | undefined
      return { type: 'continue' }
    },
    postAction: (input, result) => {
      // input 类型与 preAction 一致
      // result.success 是 boolean
      // result.error 是 Error | undefined
    },
  },
  action: () => {},
})
```

CLI 和 Group 级别的钩子**不包含 `args` 和 `options`**，只接收 `{ command, fullPath }`。这是有意的设计：跨命令的共享逻辑应该通过 ALS Context 传递数据，而不是通过 input：

```typescript
const TraceCtx = defineContext<{ id: string }>()

const cli = defineCli({
  name: 'myapp',
  hooks: {
    preAction: (input) => {
      // input.command - 当前执行的命令
      // input.fullPath - 完整命令路径
      // 没有 input.args / input.options！
      TraceCtx.set({ id: generateId() })
      return { type: 'continue' }
    },
  },
})
```

### 2. 选项约束与转换

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
    tags: cfg(List(String), { description: '标签列表' }),
  },
  constraints: [
    // 互斥：只能选一个
    {
      type: 'exclusive',
      options: ['format', 'minify'],
      description: '不能同时指定 format 和 minify',
    },

    // 依赖：选 A 必须选 B
    {
      type: 'dependsOn',
      option: 'analyze',
      requires: ['format'],
      description: '分析模式需要指定 format',
    },

    // 联动：必须同时出现
    { type: 'requiredTogether', options: ['appKey', 'appSecret'], description: '密钥必须成对提供' },
  ],
  action: (args, options) => {
    console.log(options.tags)
  },
})
```

### 3. 环境变量绑定

```typescript
import { defineCommand, cfg } from 'farrow-type-cli'
import { Optional, String } from 'farrow-schema'

defineCommand({
  path: 'deploy',
  args: {},
  options: {
    apiKey: cfg(String, { description: 'API 密钥' }),
    region: cfg(Optional(String), { description: '部署区域' }),
  },
  env: {
    prefix: 'MYAPP_', // 前缀过滤
    bindings: {
      // 简写形式
      apiKey: 'API_KEY', // 绑定 MYAPP_API_KEY

      // 完整形式（transform 返回类型与对应选项的 Schema 类型一致）
      region: {
        envName: 'DEPLOY_REGION',
        transform: (v) => v.toLowerCase(),
      },
    },
  },
  action: (args, opts) => {
    // 优先级：命令行 > 环境变量
    // 如果都未提供，使用代码默认值
    const region = opts.region ?? 'cn-hangzhou'
    console.log(opts.apiKey) // 来自 MYAPP_API_KEY
  },
})
```

```bash
# 方式1：命令行传值（优先级最高）
$ myapp deploy --apiKey secret123 --region us-west

# 方式2：环境变量（命令行未提供时使用）
$ export MYAPP_API_KEY=secret123
$ export MYAPP_DEPLOY_REGION=US-WEST
$ myapp deploy
# region = "us-west"（自动转为小写）

# 方式3：代码默认值（都未提供时）
$ myapp deploy
# region = "cn-hangzhou"
```

> **全局选项也支持环境变量绑定**：在 `defineCli` 中使用 `env` 字段，用法与命令级 `env` 完全一致：
>
> ```typescript
> const cli = defineCli({
>   name: 'myapp',
>   globalOptions: { apiKey: cfg(String) },
>   env: {
>     prefix: 'MYAPP_',
>     bindings: { apiKey: 'API_KEY' }, // 读取 MYAPP_API_KEY
>   },
> })
> ```

### 4. ALS 上下文 (Context)

无需层层传递，在任何地方获取上下文：

```typescript
import { defineCommand, defineContext } from 'farrow-type-cli'

// 定义上下文（可设默认值）
const RequestContext = defineContext<{ requestId: string }>()
const ConfigContext = defineContext<{ debug: boolean }>({ debug: false })

// 辅助函数：生成追踪 ID
const generateId = () => Math.random().toString(36).slice(2, 10)

// 在钩子中设置
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
    // 在异步操作中随时获取
    const { requestId } = RequestContext.get()

    await fetch('/api', {
      headers: { 'X-Request-ID': requestId },
    })
  },
})
```

### 5. 全局选项

全局选项通过 Schema 自动验证，通过 `cli.globalOptionsContext.get()` 获取类型安全值：

```typescript
import { defineCli, defineCommand, cfg } from 'farrow-type-cli'
import { Optional, Boolean, String } from 'farrow-schema'

const cli = defineCli({
  name: 'myapp',
  globalOptions: {
    verbose: cfg(Boolean, { description: '显示详细日志' }),
    config: cfg(Optional(String), { description: '配置文件路径' }),
  },
})

// 全局选项自动验证，通过 Context 获取
cli.add(
  defineCommand({
    path: 'cmd',
    args: {},
    options: {},
    hooks: {
      preAction: (input) => {
        // 获取已验证的全局选项（类型安全）
        const globalOpts = cli.globalOptionsContext.get()

        if (globalOpts.verbose) {
          console.log('详细模式已开启')
        }

        if (globalOpts.config) {
          // 读取配置文件...
        }

        return { type: 'continue' }
      },
    },
    action: (args, options) => {
      // options 仅包含该命令定义的选项，与全局选项完全隔离
      console.log(options)
    },
  })
)
```

---

## 边缘情况与注意事项

### 1. Rest 参数与 Args 优先级

`args` 优先占用位置参数，剩余进入 `rest`：

```bash
$ myapp copy a.txt b.txt c.txt d.txt
# args.source='a.txt', args.target='b.txt', rest=['c.txt', 'd.txt']
```

**注意**：必填字段先于可选字段分配；位置参数不能跳过。

### 2. 环境变量命名

| 配置                                          | 读取的变量         |
| --------------------------------------------- | ------------------ |
| `prefix: 'MYAPP_'` + `apiKey: 'API_KEY'`      | `MYAPP_API_KEY`    |
| `prefix: 'MYAPP_'` + `{ envName: 'DB_HOST' }` | `MYAPP_DB_HOST`    |
| 无 `prefix`                                   | 直接读取 `envName` |

空字符串视为有效值；如需视为未设置，用 `transform: (v) => v || undefined`。

### 3. 子命令与父命令同名

```typescript
import { defineCli, defineCommand, defineCommandGroup } from 'farrow-type-cli'

const cli = defineCli({ name: 'myapp' })

// 定义 server 命令组
cli.add(
  defineCommandGroup({
    path: 'server',
    subCommands: [
      // 子命令也叫 server（与父组同名）
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

// $ myapp server server  → 匹配 server/server 命令
```

**匹配规则**：最长匹配优先；同名时子命令优先于父组。

### 4. 别名与选项冲突

| 冲突场景         | 优先级     | 说明                                               |
| ---------------- | ---------- | -------------------------------------------------- |
| 组别名 vs 子命令 | 子命令优先 | `$ myapp svc` 优先匹配子命令 `svc`                 |
| 短别名冲突       | 命令级优先 | 全局和命令都用 `-v` 时，命令优先                   |
| 全局 vs 命令选项 | 命令优先   | 全局选项通过 `cli.globalOptionsContext.get()` 访问 |

> **短别名冲突**：若全局和命令选项共用短别名（如都用 `-v`），**命令选项优先**。全局选项需用长形式（如 `--verbose`）访问。

#### 短别名冲突的解析策略

当全局选项和命令选项使用相同短别名（如都用 `-v`）时，框架采用**保守合并**：偏向 `takesValue=true`，防止值丢失。

```bash
$ myapp deploy -v 1.0.0     # ✅ 正确解析
$ myapp deploy -v           # ❌ 错误：-v 需要值（即使全局 -v 是 flag）
```

**为什么不做成命令级精确解析？**

精确解析需要"先匹配命令 → 再按命令配置解析选项"，但这会导致循环依赖：

- 匹配命令需要解析后的位置参数
- 解析选项需要知道匹配到了哪个命令

两次解析虽可行，但会让核心流程复杂度翻倍。我们选择**简单性优先**：短别名冲突是边缘情况，推荐用长选项（`--verbose` / `--version`）或不同短别名（`-v` / `-V`）避免。

#### 短别名冲突最佳实践

为避免短别名冲突带来的意外行为，建议遵循以下约定：

| 场景                 | 推荐方案               | 示例                                     |
| -------------------- | ---------------------- | ---------------------------------------- |
| 全局 flag + 命令选项 | 全局用大写，命令用小写 | 全局 `-V` (verbose)，命令 `-v` (version) |
| 两个都是 flag        | 可以共用，但建议避免   | 都用 `-f` 时，命令优先                   |
| 两个都需要值         | 严格避免               | 会导致解析歧义                           |
| 一个 flag 一个带值   | **必须避免**           | `-v` 既是 flag 又是带值选项              |

**设计原则**：

1. 全局选项倾向于使用**大写短别名**（`-V`, `-C`, `-D`）
2. 命令级选项使用**小写短别名**（`-v`, `-c`, `-d`）
3. 或者全局选项**不使用短别名**，仅用长选项（`--verbose`, `--config`）

### 5. preAction abort 与 postAction

**行为规则**：

| 触发条件        | action    | postAction               |
| --------------- | --------- | ------------------------ |
| preAction abort | ❌ 不执行 | ✅ 执行（aborted=true）  |
| action 抛出错误 | ❌ 失败   | ✅ 执行（success=false） |
| action 正常完成 | ✅ 执行   | ✅ 执行（success=true）  |

**执行顺序**（洋葱模型）：

```
CLI preAction → Group preAction → Command preAction → ACTION
                                                  ↓
CLI postAction ← Group postAction ← Command postAction
```

- abort 立即停止链条，但 postAction 仍会逆序执行
- postAction 错误不影响退出码（如需强制失败，显式调用 `process.exit(1)`）

### 8. 全局错误处理

#### 错误处理

CLI 自动输出格式化错误（验证失败、约束违反、命令未找到等）。在 `postAction` 中通过 `result.success` 判断结果：

```typescript
postAction: (input, result) => {
  if (!result.success) {
    reportError(result.error)
    cleanupTempFiles()
  }
}
```

**退出码**：正常/help/version → 0；错误/abort → 1

> **注意**：命令成功后调用 `process.exit(0)` 立即退出。如需清理异步操作，在 `postAction` 中同步处理。

### 6. 保留选项名

| 选项            | 行为                   | 注意                       |
| --------------- | ---------------------- | -------------------------- |
| `--help` / `-h` | 显示帮助，退出码 0     | 不要定义 `help` / `h` 选项 |
| `--version`     | 显示版本，退出码 0     | 不要定义 `version` 选项    |
| `-v`            | **不保留**，可自由使用 | 通常用于 `--verbose`       |

---

## 测试工具

### Mock 运行器

```typescript
import { createMockCli, createTestCli } from 'farrow-type-cli'

// 创建测试 CLI
const cli = createTestCli({
  name: 'test',
  commands: [
    /* ... */
  ],
})

// Mock 运行
const mock = createMockCli(cli)
const result = await mock.run(['deploy', '--env', 'prod'])

// 断言
expect(result.exitCode).toBe(0)
expect(result.stdout).toContain('Deployed')
mock.assertOutputContains('success')
mock.assertExitCode(0)
```

**Mock 断言方法**：

```typescript
// 获取所有输出
const { stdout, stderr } = mock.getOutputs()

// 断言输出包含指定内容
mock.assertOutputContains('Deployed') // 检查 stdout
mock.assertErrorContains('error message') // 检查 stderr
mock.assertExitCode(0) // 检查退出码
```

### 环境变量模拟

```typescript
import { withEnv, runCli, defineCli, defineCommand } from 'farrow-type-cli'
import { String } from 'farrow-schema'

// 假设已有 CLI 实例
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
  // 在此作用域内，process.env.API_KEY = 'secret-123'
  return await runCli(cli, ['deploy'])
})
```

---

## Shell 补全

自动生成 Bash/Zsh/Fish 补全脚本。

```typescript
import { generateCompletion, defineCommand, cfg } from 'farrow-type-cli'
import { Union, Literal } from 'farrow-schema'

// 在你的 CLI 中添加 completion 命令
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

**支持补全的内容**：

- 命令和子命令（含嵌套层级）
- 命令别名
- 长选项（`--port`）和短选项（`-p`）
- 全局选项

**注意**：补全脚本基于 CLI Schema 静态生成。动态内容（如从服务器获取的选项值）需自行扩展。

**安装补全脚本**：

```bash
# Bash (~/.bashrc)
eval "$(myapp completion bash)"

# Zsh (~/.zshrc)
eval "$(myapp completion zsh)"

# Fish (~/.config/fish/completions/myapp.fish)
myapp completion fish | source
```

或者生成静态脚本文件：

```bash
# 生成并保存
myapp completion bash > /etc/bash_completion.d/myapp
myapp completion zsh > /usr/local/share/zsh/site-functions/_myapp
myapp completion fish > ~/.config/fish/completions/myapp.fish
```

---

## API 速查

### 核心函数

| 函数                         | 说明                     |
| ---------------------------- | ------------------------ |
| `defineCli(config)`          | 定义 CLI 实例            |
| `defineCommand(config)`      | 定义命令                 |
| `defineCommandGroup(config)` | 定义命令组               |
| `cfg(schema, config?)`       | 简化选项定义（对象 API） |
| `run(cli, argv?)`            | 运行 CLI                 |
| `createMockCli(cli)`         | 创建 Mock 运行器         |

### `cfg()` 详细用法

```typescript
import { cfg } from 'farrow-type-cli'
import { Number, String, Boolean, Optional, List } from 'farrow-schema'

// 对象 API（alias 必须是单个字符，遵循 POSIX 标准）
port: cfg(Number, { description: '端口号', alias: 'p' })

// 可选值
region: cfg(Optional(String), { description: '部署区域' })

// 数组（多值选项）
tags: cfg(List(String), { description: '标签列表' })
```

### `defineCommand()` 常用配置

```typescript
import { defineCommand, cfg } from 'farrow-type-cli'
import { String, Number, Boolean, Optional } from 'farrow-schema'

defineCommand({
  path: 'deploy', // 命令路径（必填）
  aliases: ['d'], // 别名
  description: '部署应用', // 描述
  args: { env: String }, // 位置参数
  options: {
    // 选项定义
    port: cfg(Number, { alias: 'p' }),
    verbose: cfg(Boolean, { alias: 'v' }),
    config: cfg(Optional(String), { description: '配置文件' }),
  },
  rest: String, // 剩余参数（可选）
  constraints: [
    // 选项约束
    { type: 'exclusive', options: ['port', 'dryRun'] }, // 互斥
  ],
  hooks: {
    // 命令级钩子（input 包含完整类型推导的 args/options）
    preAction: (input) => {
      // input.args.env: string
      // input.options.port: number
      return { type: 'continue' }
    },
    postAction: (input, result) => {
      // input 类型与 preAction 一致
      // result.success: boolean
    },
  },
  env: {
    // 环境变量绑定
    prefix: 'APP_',
    bindings: { apiKey: 'API_KEY' },
  },
  action: (args, options, rest) => {
    // 执行函数（必填）
    // args: { env: string }
    // options: { port: number, verbose: boolean }
    // rest: string[]（如果定义了 rest）
  },
})
```

### `defineCli()` 常用配置

```typescript
import { defineCli, cfg } from 'farrow-type-cli'
import { Boolean, Optional, String } from 'farrow-schema'

const cli = defineCli({
  name: 'myapp', // CLI 名称（必填）
  version: '1.0.0', // 版本
  description: 'My CLI tool', // 描述
  globalOptions: {
    // 全局选项
    verbose: cfg(Boolean, { alias: 'v' }),
    config: cfg(Optional(String)),
  },
  hooks: {
    // 全局钩子（input 只有 { command, fullPath }，无 args/options）
    preAction: (input) => {
      // input.command - 当前命令
      // input.fullPath - 完整路径
      return { type: 'continue' }
    },
    postAction: (input, result) => {},
  },
})

// 添加命令
cli.add(command1, command2)
cli.add([command3, command4])

// 获取全局选项（在 action/hook 中）
const { verbose } = cli.globalOptionsContext.get()
```

### `defineCommandGroup()` 常用配置

```typescript
import { defineCommandGroup, defineCommand } from 'farrow-type-cli'

defineCommandGroup({
  path: 'server',                    // 组路径（必填）
  aliases: ['sv'],                   // 组别名（可选）
  hidden: true,                     // 是否隐藏（可选，用于帮助/补全）
  description: '服务管理',            // 描述
  subCommands: [                     // 子命令列表（必填）
    defineCommand({ path: 'start', args: {}, options: {}, ... }),
    defineCommand({ path: 'stop', args: {}, options: {}, ... })
  ],
  defaultCommand: defineCommand({    // 默认命令（可选）
    path: 'status',
    args: {},
    options: {},
    action: () => console.log('Running')
  }),
  hooks: {                           // 组级钩子（input 只有 { command, fullPath }）
    preAction: (input) => { return { type: 'continue' } }
  }
})
```

### Context API（ALS 上下文）

Context 系统的设计灵感来自 [farrow-pipeline](https://github.com/farrow-js/farrow/tree/master/packages/farrow-pipeline) 的 Context 机制，基于 Node.js `AsyncLocalStorage` 实现，无需层层透传即可在任意位置获取上下文。

```typescript
import { defineContext } from 'farrow-type-cli'

// 定义上下文（可设默认值）
const RequestContext = defineContext<{ id: string }>()
const ConfigContext = defineContext<{ debug: boolean }>({ debug: false })

// 在 preAction 中设置
preAction: () => {
  RequestContext.set({ id: generateId() })
  return { type: 'continue' }
}

// 在 action 中获取（任意位置）
action: async () => {
  const { id } = RequestContext.get() // string
  const { debug } = ConfigContext.get() // boolean
}
```

### 测试工具 API

```typescript
import { createMockCli, withEnv, captureError } from 'farrow-type-cli'

// 创建 Mock 运行器
const mock = createMockCli(cli)
const result = await mock.run(['deploy', '--env', 'prod'])

// 断言
expect(result.exitCode).toBe(0)
expect(result.stdout).toContain('success')
mock.assertOutputContains('Deployed')
mock.assertExitCode(0)

// 模拟环境变量
await withEnv({ API_KEY: 'secret' }, async () => {
  return await mock.run(['deploy'])
})

// 捕获错误
const error = await captureError(async () => {
  await mock.run(['invalid-command'])
})
```

### Schema 类型

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

> **注意**：由于 farrow 长期处于建设状态，官方文档可能不够详细，我们提供第三方参考文档：https://farrow-doc.vercel.app/

### 约束定义

```typescript
// 互斥：--format 和 --minify 不能同时使用
{ type: 'exclusive', options: ['format', 'minify'], description: '不能同时指定' }

// 依赖：使用 --analyze 时必须同时指定 --format
{ type: 'dependsOn', option: 'analyze', requires: ['format'] }

// 联动：--appKey 和 --appSecret 必须成对出现
{ type: 'requiredTogether', options: ['appKey', 'appSecret'] }

// 自定义：端口号必须大于 1024
{ type: 'custom', description: '需大于 1024', check: (opts) => opts.port > 1024 }
```

> **注意**：`exclusive`/`dependsOn`/`requiredTogether` 通过 `userProvidedKeys` 判断用户是否显式提供了选项，避免 Boolean 默认值 `false` 被误判为"用户指定"。

### 工具函数

```typescript
// 环境变量绑定（在 env.bindings 中定义）
// 简写形式: 'API_KEY'  →  配置 prefix: 'MYAPP_' 时读取 MYAPP_API_KEY
// 完整形式: { envName: 'DEPLOY_REGION', transform: (v) => v }
// 注意：配置了 prefix 时，envName 作为后缀统一添加前缀
//       transform 返回类型必须与对应 option 的类型一致

// 测试工具
withEnv(env, fn) // 模拟环境变量执行函数
wait(ms) // 异步等待
captureError(fn) // 捕获异步错误
```

---

## 与同类产品对比

### 功能对比矩阵

| 特性           | farrow-type-cli   | Oclif         | Yargs         | Commander.js |
| -------------- | ----------------- | ------------- | ------------- | ------------ |
| **类型安全**   | ⭐⭐⭐⭐⭐        | ⭐⭐          | ⭐⭐          | ⭐⭐         |
| **运行时验证** | ✅ Schema驱动     | ⚠️ 需手写     | ⚠️ 需手写     | ❌ 无        |
| **嵌套子命令** | ✅ 无限层级       | ✅ 支持       | ✅ 支持       | ✅ 支持      |
| **钩子系统**   | ✅ 分层 pre/post  | ✅ 丰富       | ⚠️ Middleware | ✅ 基础      |
| **插件生态**   | ❌ 无（设计取舍） | ✅ 强大       | ❌ 无         | ❌ 无        |
| **包体积**     | 中等              | 较大          | 中等          | 小           |
| **安装包大小** | ~100KB + deps     | ~500KB + deps | ~200KB + deps | ~50KB        |

### 适用场景对比

| 工具                | 适合场景                                    | 核心优势                                 |
| ------------------- | ------------------------------------------- | ---------------------------------------- |
| **farrow-type-cli** | TypeScript 团队、复杂嵌套命令、类型敏感项目 | Schema 一处定义，自动获得类型+验证+文档  |
| **Oclif**           | 平台级 CLI（如 Heroku CLI）、需要插件生态   | 丰富的生命周期钩子、用户可安装第三方插件 |
| **Yargs**           | 跨平台工具（Node/Deno）、配置驱动项目       | Middleware 模式、配置继承                |
| **Commander.js**    | 简单脚本、教学示例、体积敏感场景            | 极简 API、最小依赖                       |

---

### 设计理念对比

```
┌─────────────────────────────────────────────────────────────┐
│  设计哲学谱系                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  功能全面 ◄─────────────────────────────────► 精简专注      │
│                                                             │
│  Oclif ────── farrow-type-cli ────── Yargs ──── Commander  │
│   (平台)         (工程框架)          (工具)       (库)      │
│                                                             │
│  内置一切        核心完备            Middleware   最小实现   │
│  插件生态        按需组合            配置继承     自由扩展   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 决策树

```
需要用户可安装插件？
├── 是 → Oclif
└── 否 → 重视类型安全？
         ├── 是 → 需要复杂嵌套命令？
         │         ├── 是 → farrow-type-cli
         │         └── 否 → 考虑 Commander + Zod
         └── 否 → 需要 Middleware？
                   ├── 是 → Yargs
                   └── 否 → Commander.js
```

---

## 许可证

[MIT](./LICENSE)

---

## 致谢

- [farrow](https://github.com/farrow-js/farrow) - 提供强大的 Schema 类型系统
- [farrow-pipeline](https://github.com/farrow-js/farrow/tree/master/packages/farrow-pipeline) - Context 机制的设计灵感
- [@Lucifier129](https://github.com/Lucifier129) - farrow 作者，TypeScript 类型系统的艺术大师
- **[Kimi Code](https://www.kimi.com/code)** ⭐ **强力推荐** - 深度参与架构设计与代码审查，本项目的灵魂搭档

## 推荐项目

- [koka-ts/koka](https://github.com/koka-ts/koka) - 基于代数效应的轻量级 TypeScript 库（仅 3kB），Effect-TS 的替代方案
- [remesh-js/remesh](https://github.com/remesh-js/remesh) - 用于大型前端应用的 DDD 框架

---

<p align="center">
  Made with ❤️ using <a href="https://github.com/farrow-js/farrow">farrow-schema</a>
</p>
