'use strict'

import ServerlessError from '../../../serverless-error.js'
import { getWebAppsConfig } from '../lib/web-apps.js'
import { getInvalidWebAppMessage, isPlainObject } from './validators/config.js'

/**
 * The web app `name` names (the `--web-app` value of `invoke` and `logs`), or
 * an error that lists the service's web apps.
 *
 * @param {object} serverless
 * @param {string} name
 * @returns {object} `webApps.<name>`; an error when it is not an object
 */
export const resolveWebApp = (serverless, name) => {
  const webApps = getWebAppsConfig(serverless)
  if (typeof name === 'string' && Object.hasOwn(webApps, name)) {
    const webApp = webApps[name]
    // These commands do not run the web-apps validation that package does
    if (!isPlainObject(webApp)) {
      throw new ServerlessError(
        getInvalidWebAppMessage(name),
        'WEB_APPS_VALIDATION_ERROR',
        { stack: false },
      )
    }
    return webApp
  }
  throw new ServerlessError(
    `No web app named "${name}" in this service. Web apps: ${Object.keys(webApps).join(', ') || 'none'}.`,
    'WEB_APPS_NOT_FOUND',
    { stack: false },
  )
}
