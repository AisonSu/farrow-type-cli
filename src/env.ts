import { EnvBinding } from './types'

/**
 * 应用环境变量绑定
 * 将环境变量值读取并转换后注入到选项中
 *
 * 规则：
 * - 当配置了 prefix 时，所有 envName（无论简写还是对象形式）都被视为后缀，自动添加前缀
 * - 当没有配置 prefix 时，envName 被视为完整的环境变量名
 *
 * @example
 * // prefix: 'MYAPP_'
 * // 简写形式 'API_KEY' → 读取 MYAPP_API_KEY
 * // 对象形式 { envName: 'DEPLOY_REGION' } → 读取 MYAPP_DEPLOY_REGION
 *
 * @param bindings 环境变量绑定配置
 * @param options 当前选项对象
 * @param prefix 环境变量前缀（可选）
 * @returns 注入环境变量后的选项
 */
export const applyEnvBindings = <TOptions extends Record<string, unknown>>(
  bindings: { [K in keyof TOptions]?: string | EnvBinding<TOptions[K]> },
  options: Record<string, unknown>,
  prefix?: string
): Record<string, unknown> => {
  const result = { ...options }

  for (const [optionKey, binding] of Object.entries(bindings)) {
    if (binding == null) continue
    const envSuffix = typeof binding === 'string' ? binding : binding.envName
    const transformFn = typeof binding === 'string' ? undefined : binding.transform

    // 统一规则：有 prefix 时，envName 视为后缀，自动添加前缀
    const finalEnvName = prefix ? `${prefix}${envSuffix}` : envSuffix

    const envValue = process.env[finalEnvName]

    if (envValue !== undefined && !(optionKey in options)) {
      // 只有选项未通过命令行指定时才使用环境变量
      try {
        result[optionKey] = transformFn ? transformFn(envValue) : envValue
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
          `Failed to transform env variable ${finalEnvName} for option '${optionKey}': ${message}`
        )
      }
    }
  }

  return result
}
