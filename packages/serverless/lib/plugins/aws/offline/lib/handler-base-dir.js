import { resolve } from 'node:path'

/**
 * Returns the base directory from which handler file paths should be resolved
 * during `sls offline`.
 *
 * Two bundler-coexistence contracts are supported:
 *
 * 1. **Framework built-in `esbuild` plugin** — calls
 *    `_setConfigForLocalInvocation()` which swaps
 *    `serverless.config.servicePath` to `<serviceDir>/.serverless/build`.
 *    Because we read `serverless.serviceDir ?? serverless.config?.servicePath`
 *    lazily (after `before:offline:start:init` fires), the swapped value is
 *    automatically picked up.
 *
 * 2. **Community `serverless-esbuild` plugin** — does NOT touch
 *    `serverless.config.servicePath`. Instead, in its `preOffline()` step it
 *    writes the build output directory into
 *    `serverless.service.custom['serverless-offline'].location` (e.g.
 *    `'.esbuild/.build'`). This is the contract the community
 *    `serverless-offline` plugin uses to find bundled handlers. We honour it
 *    by resolving the custom location against the service directory.
 *
 * Priority: `customLocation` wins when present because it is the explicit,
 * offline-specific contract set by the community bundler plugin. Without it,
 * the raw service directory (possibly already swapped by the built-in plugin)
 * is returned.
 *
 * **Behavior by scenario:**
 * - No bundler loaded → `customLocation` undefined → returns plain `serviceDir`.
 * - Built-in esbuild loaded → built-in swapped `config.servicePath`; no
 *   `customLocation` → returns the swapped `serviceDir`. Identical to pre-fix.
 * - Community `serverless-esbuild` loaded → `customLocation` is set to e.g.
 *   `'.esbuild/.build'` → returns `resolve(serviceDir, '.esbuild/.build')`. NEW.
 * - Both missing (no `serviceDir`, no `config.servicePath`) → falls back to
 *   `process.cwd()`.
 *
 * @param {object} serverless - Framework's serverless instance.
 * @returns {string} Absolute path to use as the handler resolution base.
 */
export function getHandlerBaseDir(serverless) {
  const serviceDir =
    serverless.serviceDir ?? serverless.config?.servicePath ?? process.cwd()

  const customLocation =
    serverless.service?.custom?.['serverless-offline']?.location

  if (customLocation) {
    return resolve(serviceDir, customLocation)
  }

  return serviceDir
}
