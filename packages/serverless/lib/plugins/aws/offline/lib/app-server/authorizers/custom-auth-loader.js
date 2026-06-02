/**
 * Load and validate a user-provided custom authentication provider.
 *
 * The user configures `custom.serverless-offline.customAuthenticationProvider`
 * as a string path (relative to the service directory). At boot we resolve the path,
 * dynamic-import the file, and call its default export — a factory
 * function — once to obtain a `{ name, scheme, getAuthenticateFunction }`
 * tuple that `registerAuthSchemes` then wires into both v1 and v2
 * authorizer-strategy maps.
 *
 * Boot-time invocation (not per-route): the upstream pattern calls the
 * factory per endpoint with `(endpoint, functionKey, method, path)`. We
 * call once at boot with stub args `(null, null, null, null)`. Factories
 * that ignore the args work identically. Factories that depend on the
 * args are a known limitation — tracked for a future milestone.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ServerlessError from '../../../../../../serverless-error.js'

/**
 * @param {object} args
 * @param {object} args.serverless  Framework's serverless instance — must
 *   expose `serviceDir` and
 *   `service.custom['serverless-offline'].customAuthenticationProvider`
 *   when configured.
 * @returns {Promise<
 *   { name: string, scheme: string, getAuthenticateFunction: Function }
 *   | null
 * >}
 *   Resolved strategy definition, or null when the user did not configure
 *   `custom.serverless-offline.customAuthenticationProvider`.
 *
 * @throws {ServerlessError} OFFLINE_CUSTOM_AUTH_LOAD_FAILED — on any of:
 *   file missing, import failure, export not a function, factory returns
 *   malformed shape.
 */
export async function loadCustomAuthenticationProvider({ serverless }) {
  // Read from the canonical offline config home (`custom.serverless-offline`),
  // matching every other offline option. Framework v4 / sf-core stores the raw
  // YAML on `service.initialServerlessConfig`; fall back to the resolved
  // `service.custom` so users who declare
  // `custom.serverless-offline.customAuthenticationProvider:` are honored.
  const offlineBlock =
    serverless?.service?.initialServerlessConfig?.custom?.[
      'serverless-offline'
    ] ??
    serverless?.service?.custom?.['serverless-offline'] ??
    {}
  const providerPath = offlineBlock.customAuthenticationProvider
  if (typeof providerPath !== 'string' || providerPath.length === 0) {
    return null
  }

  const serviceDir = serverless.serviceDir ?? process.cwd()
  const absPath = path.resolve(serviceDir, providerPath)
  const fileUrl = pathToFileURL(absPath).href

  let imported
  try {
    imported = await import(fileUrl)
  } catch (err) {
    throw new ServerlessError(
      `Failed to load custom.serverless-offline.customAuthenticationProvider at "${absPath}": ${err.message}`,
      'OFFLINE_CUSTOM_AUTH_LOAD_FAILED',
    )
  }

  // Accept either an ESM default export OR a CJS module whose top-level
  // export is callable (some users write `module.exports = function () { ... }`).
  // Node's ESM loader exposes that as both `default` and the namespace itself.
  let factory
  if (typeof imported.default === 'function') {
    factory = imported.default
  } else if (typeof imported === 'function') {
    factory = imported
  } else {
    throw new ServerlessError(
      `custom.serverless-offline.customAuthenticationProvider at "${absPath}" must export a factory function (default export).`,
      'OFFLINE_CUSTOM_AUTH_LOAD_FAILED',
    )
  }

  let strategy
  try {
    // Boot-time invocation with stub args — see file-level JSDoc.
    strategy = factory(null, null, null, null)
  } catch (err) {
    throw new ServerlessError(
      `custom.serverless-offline.customAuthenticationProvider factory at "${absPath}" threw during initialization: ${err.message}`,
      'OFFLINE_CUSTOM_AUTH_LOAD_FAILED',
    )
  }

  if (
    !strategy ||
    typeof strategy.name !== 'string' ||
    typeof strategy.scheme !== 'string' ||
    typeof strategy.getAuthenticateFunction !== 'function'
  ) {
    throw new ServerlessError(
      `custom.serverless-offline.customAuthenticationProvider factory at "${absPath}" must return { name: string, scheme: string, getAuthenticateFunction: Function }.`,
      'OFFLINE_CUSTOM_AUTH_LOAD_FAILED',
    )
  }

  return strategy
}
