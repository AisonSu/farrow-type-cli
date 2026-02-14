/* eslint-disable @typescript-eslint/no-explicit-any */
import { format } from 'node:util'
import { Cli, AnyCommand, CommandGroup, DefineSchemaInput } from './types'
import { runCli, defineCli, CliWithAdd } from './index'

/**
 * Mock CLI 运行结果
 */
export type MockResult = {
  exitCode: number
  stdout: string
  stderr: string
  error?: Error
}

/**
 * 创建 Mock CLI 运行器
 * 用于测试 CLI 命令而不需要实际启动进程
 *
 * @example
 * const mock = createMockCli(cli)
 * const result = await mock.run(['deploy', '--env', 'prod'])
 * expect(result.exitCode).toBe(0)
 * expect(result.stdout).toContain('Deployed')
 */
export const createMockCli = (cli: Cli) => {
  const outputs: { stdout: string[]; stderr: string[] } = {
    stdout: [],
    stderr: [],
  }

  let exitCode: number = 0

  // 保存原始方法
  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn
  const originalExit = process.exit

  // Mock 方法
  const mockLog = (...args: any[]) => {
    outputs.stdout.push(format(...args))
  }

  const mockError = (...args: any[]) => {
    outputs.stderr.push(format(...args))
  }

  const mockWarn = (...args: any[]) => {
    outputs.stderr.push(format(...args))
  }

  const mockExit = (code?: number) => {
    exitCode = code ?? 0
    throw new ExitError(code ?? 0)
  }

  /**
   * 运行 CLI 命令
   * @param argv 命令行参数（不包括程序名）
   * @returns Mock 运行结果
   */
  const run = async (argv: string[]): Promise<MockResult> => {
    // 重置状态
    outputs.stdout = []
    outputs.stderr = []
    exitCode = 0

    // 应用 mock
    console.log = mockLog
    console.error = mockError
    console.warn = mockWarn
    process.exit = mockExit as never

    try {
      await runCli(cli, argv)
      return {
        exitCode: 0,
        stdout: outputs.stdout.join('\n'),
        stderr: outputs.stderr.join('\n'),
      }
    } catch (e) {
      if (e instanceof ExitError) {
        return {
          exitCode: e.code,
          stdout: outputs.stdout.join('\n'),
          stderr: outputs.stderr.join('\n'),
        }
      }
      return {
        exitCode: 1,
        stdout: outputs.stdout.join('\n'),
        stderr: outputs.stderr.join('\n'),
        error: e as Error,
      }
    } finally {
      // 恢复原始方法
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
      process.exit = originalExit
    }
  }

  /**
   * 获取所有输出
   */
  const getOutputs = () => ({
    stdout: outputs.stdout.join('\n'),
    stderr: outputs.stderr.join('\n'),
  })

  /**
   * 断言输出包含指定内容
   */
  const assertOutputContains = (substring: string) => {
    const output = outputs.stdout.join('\n')
    if (!output.includes(substring)) {
      throw new Error(`Expected output to contain "${substring}" but got:\n${output}`)
    }
  }

  /**
   * 断言错误输出包含指定内容
   */
  const assertErrorContains = (substring: string) => {
    const output = outputs.stderr.join('\n')
    if (!output.includes(substring)) {
      throw new Error(`Expected stderr to contain "${substring}" but got:\n${output}`)
    }
  }

  /**
   * 断言退出码
   */
  const assertExitCode = (expectedCode: number) => {
    if (exitCode !== expectedCode) {
      throw new Error(`Expected exit code ${expectedCode} but got ${exitCode}`)
    }
  }

  return {
    run,
    getOutputs,
    assertOutputContains,
    assertErrorContains,
    assertExitCode,
  }
}

/**
 * 退出错误（内部使用）
 */
export class ExitError extends Error {
  constructor(public code: number) {
    super(`Process exited with code ${code}`)
    this.name = 'ExitError'
  }
}

/**
 * 创建测试用 CLI（简化版）
 * 用于快速编写单元测试
 *
 * @example
 * const cli = createTestCli({
 *   name: 'test',
 *   commands: [
 *     defineCommand({
 *       path: 'hello',
 *       action: () => console.log('Hello!')
 *     })
 *   ]
 * })
 * const mock = createMockCli(cli)
 */
export const createTestCli = (config: {
  name: string
  commands: (AnyCommand | CommandGroup)[]
  version?: string
  description?: string
  globalOptions?: DefineSchemaInput
}): Cli<any> => {
  const cli = defineCli({
    name: config.name,
    version: config.version || '1.0.0',
    description: config.description,
    globalOptions: config.globalOptions,
  }) as CliWithAdd<any>

  for (const cmd of config.commands) {
    cli.add(cmd)
  }

  return cli
}

/**
 * 异步测试辅助函数
 * 等待指定毫秒
 */
export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 捕获异步错误
 * @param fn 可能抛出错误的函数
 * @returns 捕获的错误或 undefined
 *
 * @example
 * const error = await captureError(async () => {
 *   await runCli(cli, ['invalid-command'])
 * })
 * expect(error).toBeDefined()
 */
export const captureError = async (fn: () => Promise<unknown>): Promise<Error | undefined> => {
  try {
    await fn()
    return undefined
  } catch (e) {
    return e as Error
  }
}

/**
 * 模拟环境变量
 * @param env 要设置的环境变量
 * @param fn 要执行的函数
 * @returns 函数返回值
 *
 * @example
 * const result = await withEnv({ API_KEY: 'secret' }, async () => {
 *   return process.env.API_KEY
 * })
 * expect(result).toBe('secret')
 */
export const withEnv = async <T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>
): Promise<T> => {
  // 只保存被修改的 key 的原始值
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key]
  }

  // 设置新环境变量
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await fn()
  } finally {
    // 恢复原始环境变量
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}
