/**
 * API key store for REST API `private: true` enforcement.
 *
 * Reads `provider.apiGateway.apiKeys` (Framework-blessed location). When
 * that list is empty or absent, falls back to the deterministic empty-MD5
 * hash `d41d8cd98f00b204e9800998ecf8427e` so users migrating from the
 * community plugin see the same key on first boot. The deterministic
 * default is a known footgun — surface the value loudly in the boot log
 * so it's never mistaken for a secret.
 */

import crypto from 'node:crypto'

const EMPTY_MD5 = crypto.createHash('md5').update('').digest('hex')

/**
 * @param {object} serverless          Framework serverless instance.
 * @returns {{ keys: Set<string>, generated: boolean }}
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

  if (keys.size === 0) {
    keys.add(EMPTY_MD5)
    return { keys, generated: true }
  }

  return { keys, generated: false }
}
