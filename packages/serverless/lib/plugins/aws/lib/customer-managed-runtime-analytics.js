/**
 * Pure builder for the `customerManagedRuntimes` block of the
 * sfcore.analysis.generated.v1 analytics event, spread in by the sf-core
 * framework runner's getAnalysisEventDetails() like the sandboxes and MCP
 * blocks:
 *
 *  - Fixed keys and closed vocabularies only, never ARNs, runtime or alias
 *    names, or logical IDs.
 *  - Omit-empty: `{}` when no function uses a customer-managed runtime.
 *  - Total: never throws; malformed input degrades to `{}`.
 *
 * Exposure dimensions: `valueForms` (an intrinsic means the runtime is
 * published in the same or another stack) and `runtimeManagementModes`
 * (onFunctionUpdate is the mode where an unchanged deploy keeps the old
 * runtime version).
 */

import { isCustomerManagedRuntime } from './customer-managed-runtime.js'

const isObj = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const RUNTIME_MANAGEMENT_MODES = ['auto', 'onFunctionUpdate', 'manual']

const modeOf = (runtimeManagement) => {
  const mode = isObj(runtimeManagement)
    ? runtimeManagement.mode
    : runtimeManagement
  return RUNTIME_MANAGEMENT_MODES.includes(mode) ? mode : undefined
}

export const buildCustomerManagedRuntimesAnalytics = (config) => {
  try {
    if (!isObj(config) || !isObj(config.functions)) return {}
    const provider = isObj(config.provider) ? config.provider : {}
    const providerValue = isCustomerManagedRuntime(provider.runtime)
      ? provider.runtime
      : undefined

    let functions = 0
    let esbuildFunctions = 0
    const valueForms = new Set()
    const modes = new Set()
    const providerBuild = config.build
    const providerEsbuild =
      providerBuild === 'esbuild' || Boolean(providerBuild?.esbuild)

    for (const functionObject of Object.values(config.functions)) {
      if (!isObj(functionObject) || functionObject.image) continue
      const value =
        functionObject.runtime == null ? providerValue : functionObject.runtime
      if (!isCustomerManagedRuntime(value)) continue
      functions += 1
      valueForms.add(typeof value === 'string' ? 'aliasArn' : 'intrinsic')
      const esbuild = functionObject.build
        ? functionObject.build === 'esbuild'
        : providerEsbuild
      if (esbuild) esbuildFunctions += 1
      const mode =
        modeOf(functionObject.runtimeManagement) ??
        modeOf(provider.runtimeManagement)
      if (mode) modes.add(mode)
    }

    if (!functions) return {}
    return {
      customerManagedRuntimes: {
        functions,
        ...(providerValue !== undefined && { providerLevel: true }),
        valueForms: [...valueForms].sort(),
        ...(esbuildFunctions && { esbuildFunctions }),
        ...(modes.size && { runtimeManagementModes: [...modes].sort() }),
      },
    }
  } catch {
    return {}
  }
}
