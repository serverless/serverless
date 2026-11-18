'use strict'

import { DEFAULT_RUNTIME, MIN_NODE_MAJOR_VERSION } from './constants.js'

/**
 * A Lambda Node.js runtime identifier for Node.js 24 or newer
 * (`nodejs<major>.x`), so a newer version works without a Framework release;
 * Lambda rejects one it does not support yet at deploy.
 *
 * @param {unknown} runtime
 * @returns {boolean}
 */
export const isSupportedRuntime = (runtime) => {
  const match = /^nodejs([1-9][0-9]*)\.x$/.exec(runtime)
  return Boolean(match) && Number(match[1]) >= MIN_NODE_MAJOR_VERSION
}

/**
 * The runtime a web app runs on: its own `runtime`, else `provider.runtime`
 * when that is a supported one (Node.js 24 or newer), else `nodejs24.x`. A
 * `provider.runtime` the functions use (older Node.js, another language) is
 * left to them, without a warning.
 *
 * @param {object} [webApp] - a `webApps.<name>` entry
 * @param {unknown} providerRuntime - `provider.runtime`
 * @returns {unknown} a string, unless the web app's own `runtime` is not one
 */
export const getWebAppRuntime = (webApp, providerRuntime) =>
  webApp?.runtime ??
  (isSupportedRuntime(providerRuntime) ? providerRuntime : DEFAULT_RUNTIME)
