import { arnFor } from './arn-synth.js'
import { registerLambda } from './registry.js'

/**
 * Pre-populates the registry with one identity record per declared function so
 * cross-function references (`Ref`/`Fn::GetAtt` against a sibling's
 * `…LambdaFunction` logical id) resolve to the correct local ARN.
 *
 * For each entry in `serverless.service.functions` it derives:
 * - `logicalId` via the provider's `naming.getLambdaLogicalId(functionKey)`,
 * - `name` (the deployed function name) as `fn.name ?? functionKey`, matching
 *   how the offline Lambda facade derives `context.functionName`,
 * - `arn` as the synthesized Lambda ARN for that deployed name.
 *
 * Naming access is guarded: when `serverless.getProvider` or
 * `naming.getLambdaLogicalId` is unavailable (some callers pass a minimal
 * stub), this seeds nothing rather than throwing.
 *
 * @param {object} serverless - The Serverless instance.
 * @param {ReturnType<import('./registry.js').createRegistry>} registry
 *   The registry to populate.
 * @returns {void}
 */
export function seedLambdaIdentities(serverless, registry) {
  const naming =
    typeof serverless?.getProvider === 'function'
      ? serverless.getProvider('aws')?.naming
      : undefined

  if (!naming || typeof naming.getLambdaLogicalId !== 'function') {
    return
  }

  const functions = serverless.service?.functions ?? {}

  for (const [functionKey, fn] of Object.entries(functions)) {
    const logicalId = naming.getLambdaLogicalId(functionKey)
    const name = fn?.name ?? functionKey
    const arn = arnFor('lambda', name)
    registerLambda(registry, { logicalId, functionKey, name, arn })
  }
}
