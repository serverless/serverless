/**
 * serverless-offline plugin option names with no equivalent in the built-in
 * `sls offline` command. Presence of any of these should be surfaced to the
 * user since the corresponding feature is not supported.
 *
 * @type {string[]}
 */
export const UNSUPPORTED_KEYS = ['preLoadModules', 'resourceRoutes']

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
