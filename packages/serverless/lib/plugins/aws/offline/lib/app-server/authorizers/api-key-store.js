/**
 * API key store for REST API `private: true` enforcement.
 *
 * Reads `provider.apiGateway.apiKeys` (Framework-blessed location). With no
 * configured keys the store is empty, so every request to a private route is
 * rejected — matching deployed AWS, where a private route with no usable key
 * in its usage plan denies all callers.
 *
 * @param {object} serverless          Framework serverless instance.
 * @returns {{ keys: Set<string> }}
 */
export function buildApiKeyStore(serverless) {
  const declared = serverless?.service?.provider?.apiGateway?.apiKeys ?? []
  const keys = new Set()

  for (const entry of declared) {
    if (typeof entry === 'string') {
      keys.add(entry)
    } else if (
      entry &&
      typeof entry === 'object' &&
      typeof entry.value === 'string'
    ) {
      keys.add(entry.value)
    }
    // Other shapes silently ignored — Framework's schema rejects them upstream.
  }

  return { keys }
}
