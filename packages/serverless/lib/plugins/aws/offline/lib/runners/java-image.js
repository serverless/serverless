import ServerlessError from '../../../../../serverless-error.js'

/**
 * Map a serverless.yml runtime string to the canonical
 * `public.ecr.aws/lambda/java:<tag>` image URI.
 *
 * Tag is the runtime's "major version" suffix:
 *  - `java21`   → `:21`
 *  - `java17`   → `:17`
 *  - `java11`   → `:11`
 *  - `java8.al2`→ `:8.al2`
 *
 * `provided.al{,2,2023}` runtimes are routed to Java by the multiplexer's
 * `.jar` artifact-extension check; when that happens this function is
 * called with the `provided.*` string and we pin to the current LTS
 * image (Java 21) rather than guessing the user's intended version.
 *
 * @param {string} runtime
 * @returns {string}  Full image URI, e.g. `'public.ecr.aws/lambda/java:21'`.
 * @throws {ServerlessError} OFFLINE_JAVA_RUNTIME_UNSUPPORTED if the runtime
 *   string doesn't match any Java family.
 */
export function runtimeToImage(runtime) {
  const javaMatch = String(runtime ?? '').match(/^java(\d+(?:\.al2)?)$/)
  if (javaMatch) {
    return `public.ecr.aws/lambda/java:${javaMatch[1]}`
  }

  if (/^provided\.(al|al2|al2023)$/.test(runtime ?? '')) {
    return 'public.ecr.aws/lambda/java:21'
  }

  throw new ServerlessError(
    `Runtime "${runtime}" is not a supported Java runtime. ` +
      `Expected one of: java21, java17, java11, java8.al2 ` +
      `(or provided.al{,2,2023} with a .jar artifact).`,
    'OFFLINE_JAVA_RUNTIME_UNSUPPORTED',
  )
}
