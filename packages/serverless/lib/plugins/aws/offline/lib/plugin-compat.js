/**
 * Maps serverless-offline plugin option names to their built-in `sls offline`
 * equivalents. Only names that differ between the plugin and the built-in
 * command are listed here.
 *
 * @type {Record<string, string>}
 */
export const ALIAS_KEYS = { httpPort: 'appPort' }

/**
 * serverless-offline plugin option names with no equivalent in the built-in
 * `sls offline` command. Presence of any of these should be surfaced to the
 * user since the corresponding feature is not supported.
 *
 * @type {string[]}
 */
export const UNSUPPORTED_KEYS = [
  'websocketPort',
  'albPort',
  'preLoadModules',
  'resourceRoutes',
]

/**
 * serverless-offline plugin option names that the built-in command silently
 * ignores (no equivalent behavior, no warning needed).
 *
 * @type {string[]}
 */
export const SILENT_IGNORE_KEYS = ['noSponsor']

/**
 * Permissive JSON schema for the `custom.serverless-offline` config block. A
 * richer native schema is planned separately; for now any object is accepted.
 *
 * @type {{ type: string, additionalProperties: boolean }}
 */
export const CUSTOM_SERVERLESS_OFFLINE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
}

/**
 * Returns a shallow copy of `source` with serverless-offline plugin option
 * names rewritten to their built-in equivalents per {@link ALIAS_KEYS}. The
 * canonical (built-in) name wins: if both the alias and its target are present,
 * the explicit target value is kept and the alias key is dropped.
 *
 * @param {Record<string, unknown>} [source={}] Plugin-named options.
 * @returns {Record<string, unknown>} A new object with normalized key names.
 */
export function normalizePluginKeys(source = {}) {
  const result = { ...source }

  for (const [from, to] of Object.entries(ALIAS_KEYS)) {
    if (source[from] !== undefined && result[to] === undefined) {
      result[to] = source[from]
    }

    delete result[from]
  }

  return result
}

/**
 * Collects the {@link UNSUPPORTED_KEYS} that are present (own enumerable, with a
 * defined value) in either the CLI options or the plugin `custom` config.
 *
 * @param {{ cliOptions?: Record<string, unknown>, pluginCustom?: Record<string, unknown> }} [args={}]
 * @returns {string[]} Sorted, de-duplicated list of unsupported keys in use.
 */
export function collectUnsupportedKeys({
  cliOptions = {},
  pluginCustom = {},
} = {}) {
  const isUsed = (source, key) =>
    Object.prototype.hasOwnProperty.call(source, key) &&
    source[key] !== undefined

  const present = UNSUPPORTED_KEYS.filter(
    (key) => isUsed(cliOptions, key) || isUsed(pluginCustom, key),
  )

  return [...new Set(present)].sort()
}
