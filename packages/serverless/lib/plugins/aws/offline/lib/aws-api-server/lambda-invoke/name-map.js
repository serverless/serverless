import ServerlessError from '../../../../../../serverless-error.js'

/**
 * Build a lookup from a function's deployed name to its serverless.yml key.
 *
 * AWS LambdaClient.invoke({ FunctionName }) sends the deployed function name
 * (e.g. `my-service-dev-worker`, or an explicit `functions.x.name` override),
 * NOT the short serverless.yml key. This map lets the invoke route resolve the
 * path param back to the key the function facade is keyed by.
 *
 * Functions whose name has not been resolved are skipped (they cannot be
 * addressed by name).
 *
 * @param {object} serverless  Framework instance.
 * @returns {Map<string, string>}  deployedName -> functionKey.
 * @throws {ServerlessError} OFFLINE_DUPLICATE_FUNCTION_NAME when two functions
 *   resolve to the same deployed name (only possible via colliding explicit
 *   `name` overrides — fail loud rather than silently shadow one).
 */
export function buildFunctionNameMap(serverless) {
  /** @type {Map<string, string>} */
  const map = new Map()
  const functions = serverless.service?.functions ?? {}

  for (const [functionKey, fn] of Object.entries(functions)) {
    const name = fn?.name
    if (typeof name !== 'string' || name.length === 0) continue

    if (map.has(name)) {
      throw new ServerlessError(
        `Two functions resolve to the same deployed name "${name}" ` +
          `("${map.get(name)}" and "${functionKey}"). ` +
          'Give each function a unique name.',
        'OFFLINE_DUPLICATE_FUNCTION_NAME',
      )
    }
    map.set(name, functionKey)
  }

  return map
}
