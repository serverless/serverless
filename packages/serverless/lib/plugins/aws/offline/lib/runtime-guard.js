import ServerlessError from '../../../../serverless-error.js'

/**
 * Runtime families that the offline runners can execute.
 *
 * Extend by adding regexes as new runners ship (M5c plans ruby*, go*,
 * java*). Order is not significant — `some` short-circuits on the first
 * match. Per the M5b lock: "supported" means the offline server has a
 * runner for the FAMILY. The actual interpreter binary on PATH (e.g.
 * `python3.11`) is NOT probed at boot — a missing binary surfaces as a
 * child-process spawn error on the first invocation. Matches the
 * community plugin's lazy-fail model.
 */
const SUPPORTED_RUNTIME_REGEXES = [
  /^nodejs\d+\.?x?$/, // nodejs18.x, nodejs20.x, nodejs22.x, nodejs22
  /^python\d+\.\d+$/, // python3.11, python3.12, python3.13
  /^ruby\d+\.\d+$/, // ruby3.2, ruby3.3, ruby3.4
  /^go\d+\.x?$/, // go1.x (legacy AL1 runtime family)
  /^provided\.(al|al2|al2023)$/, // provided.al, provided.al2, provided.al2023 (custom runtimes — Go via aws-lambda-go, Java native-image, etc.)
  /^java\d+(\.al2)?$/, // java8.al2, java11, java17, java21, future java25+
]

/**
 * Asserts that every function in the service declares a runtime the
 * offline server can execute.
 *
 * Resolution rule: `function.runtime ?? provider.runtime`. If neither is
 * set, the function is skipped — Framework's own schema validation
 * surfaces the missing-runtime error clearer than we could.
 *
 * @param {object} serverless - The Serverless instance.
 * @param {{ service: { provider: { runtime?: string }, functions?: Record<string, { runtime?: string }> } }} serverless
 * @throws {ServerlessError} With code `OFFLINE_UNSUPPORTED_RUNTIME` when
 *   one or more functions declare an unsupported runtime family.
 * @returns {undefined}
 */
export function assertSupportedRuntimes(serverless) {
  const { provider, functions = {} } = serverless.service
  const providerRuntime = provider.runtime

  /** @type {Array<{ name: string, runtime: string }>} */
  const offenders = []

  for (const [functionName, fn] of Object.entries(functions)) {
    const effectiveRuntime = fn.runtime ?? providerRuntime

    // No runtime defined at all — skip and let Framework validation handle it.
    if (effectiveRuntime === undefined) continue

    const supported = SUPPORTED_RUNTIME_REGEXES.some((re) =>
      re.test(effectiveRuntime),
    )
    if (!supported) {
      offenders.push({ name: functionName, runtime: effectiveRuntime })
    }
  }

  if (offenders.length === 0) return undefined

  const list = offenders
    .map(({ name, runtime }) => `  ${name} (${runtime})`)
    .join('\n')
  throw new ServerlessError(
    `sls offline does not yet support these runtimes:\n${list}\n` +
      `Supported in this build: Node.js (nodejs*), Python (python3.x), Ruby (ruby3.x), Go (go*.x, provided.al, provided.al2), Java (java*, java8.al2).`,
    'OFFLINE_UNSUPPORTED_RUNTIME',
  )
}
