/**
 * API key store for REST API `private: true` enforcement.
 *
 * Reads `provider.apiGateway.apiKeys` (Framework-blessed location). When at
 * least one key is configured, the store holds exactly those keys and
 * `generated` is false.
 *
 * When NO key is configured, a single random key is generated and added to the
 * store with `generated: true` — a local-dev convenience matching the community
 * serverless-offline plugin, which auto-generates a key for private routes when
 * none is configured. (The plugin emits a constant md5-of-empty
 * `d41d8cd98f00b204e9800998ecf8427e`, a known plugin bug; we emit a unique
 * random key instead.) The caller prints the generated key at boot so the user
 * can copy it into the `x-api-key` header. This differs from deployed AWS, which
 * requires a usable key in the route's usage plan and denies all callers
 * otherwise.
 *
 * @param {object} serverless          Framework serverless instance.
 * @returns {{ keys: Set<string>, generated: boolean }}
 */
import { randomBytes } from 'node:crypto'

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
    // No configured key: generate a unique random one so private routes are
    // reachable locally. Surfaced via `generated` so the caller can print it.
    keys.add(randomBytes(16).toString('hex'))
    return { keys, generated: true }
  }

  return { keys, generated: false }
}
