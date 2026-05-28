import crypto from 'node:crypto'

// External published-layer ARNs look like
// arn:aws:lambda:<region>:<acct>:layer:<name>:<version> (also arn:aws-us-gov,
// arn:aws-cn). Anything else (a { Ref } to a layer defined in this service's
// `layers:` block, or any non-string) is treated as a local/unsupported layer.
const LAYER_ARN_RE = /^arn:aws[\w-]*:lambda:/

/**
 * Stable content-addressed key for an ordered list of layer ARNs.
 *
 * @param {string[]} arns
 * @returns {string} sha256 hex digest
 */
export function layerSetKey(arns) {
  return crypto.createHash('sha256').update(JSON.stringify(arns)).digest('hex')
}

/**
 * Classify every function's effective layers into downloadable external ARNs
 * versus skipped local/Ref entries.
 *
 * Effective layers follow the Framework rule: a function's own `layers` replace
 * `provider.layers` (no merge); a function without `layers` inherits the
 * provider list.
 *
 * @param {object} serverless
 * @returns {{ byFunction: Map<string, string[]>, skipped: Array<{ functionKey: string, ref: unknown }> }}
 *   `byFunction` maps each function key that has >=1 external-ARN layer to its
 *   ordered ARN list. `skipped` records each local/Ref entry for a boot notice.
 */
export function resolveFunctionLayers(serverless) {
  const service = serverless.service ?? {}
  const providerLayers = service.provider?.layers
  const functions = service.functions ?? {}

  /** @type {Map<string, string[]>} */
  const byFunction = new Map()
  /** @type {Array<{ functionKey: string, ref: unknown }>} */
  const skipped = []

  for (const [functionKey, fn] of Object.entries(functions)) {
    const effective = fn?.layers ?? providerLayers ?? []
    if (!Array.isArray(effective) || effective.length === 0) continue

    const arns = []
    for (const entry of effective) {
      if (typeof entry === 'string' && LAYER_ARN_RE.test(entry)) {
        arns.push(entry)
      } else {
        skipped.push({ functionKey, ref: entry })
      }
    }
    if (arns.length > 0) byFunction.set(functionKey, arns)
  }

  return { byFunction, skipped }
}

/**
 * Collapse per-function ARN lists into unique ordered sets, keyed by a stable
 * sha256 so functions sharing the same layers share one download/extraction.
 *
 * @param {Map<string, string[]>} byFunction
 * @returns {Map<string, string[]>} setKey -> ordered ARN list
 */
export function uniqueLayerSets(byFunction) {
  /** @type {Map<string, string[]>} */
  const sets = new Map()
  for (const arns of byFunction.values()) {
    sets.set(layerSetKey(arns), arns)
  }
  return sets
}
