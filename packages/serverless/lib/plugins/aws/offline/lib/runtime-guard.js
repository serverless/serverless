import ServerlessError from '../../../../serverless-error.js'

/** Matches any Node.js runtime identifier (e.g. nodejs18.x, nodejs20.x, nodejs22). */
const NODE_RUNTIME_RE = /^nodejs\d+\.?x?$/

/**
 * Asserts that every function in the service uses a Node.js runtime.
 *
 * Resolution rule: `function.runtime ?? provider.runtime`. If neither is set,
 * the function is skipped — the Framework's own schema validation will surface
 * a clearer missing-runtime error.
 *
 * @param {object} serverless - The Serverless instance.
 * @param {{ service: { provider: { runtime?: string }, functions?: Record<string, { runtime?: string }> } }} serverless
 * @throws {ServerlessError} With code `OFFLINE_UNSUPPORTED_RUNTIME` when one or
 *   more functions declare a non-Node runtime.
 * @returns {undefined}
 */
export function assertAllNodeRuntimes(serverless) {
  const { provider, functions = {} } = serverless.service
  const providerRuntime = provider.runtime

  /** @type {Array<{ name: string, runtime: string }>} */
  const offenders = []

  for (const [functionName, fn] of Object.entries(functions)) {
    const effectiveRuntime = fn.runtime ?? providerRuntime

    // No runtime defined at all — skip and let Framework validation handle it.
    if (effectiveRuntime === undefined) continue

    if (!NODE_RUNTIME_RE.test(effectiveRuntime)) {
      offenders.push({ name: functionName, runtime: effectiveRuntime })
    }
  }

  if (offenders.length === 0) return undefined

  const list = offenders
    .map(({ name, runtime }) => `  ${name} (${runtime})`)
    .join('\n')
  throw new ServerlessError(
    `sls offline only supports Node.js runtimes in this build:\n${list}`,
    'OFFLINE_UNSUPPORTED_RUNTIME',
  )
}
