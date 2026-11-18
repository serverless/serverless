/**
 * What deploy, package and info code outside the web-apps plugin needs to know
 * about `webApps`: whether a service has any, which wording a deployment
 * bucket message uses, and the context lines appended to errors when it does.
 */

/**
 * The service's `webApps`, or an empty object.
 *
 * @param {object} [serverless]
 * @returns {Record<string, object>}
 */
export const getWebAppsConfig = (serverless) =>
  serverless?.service?.webApps || serverless?.configurationInput?.webApps || {}

/**
 * Whether the service defines at least one web app. Deploy and package code
 * outside the web-apps plugin uses it to apply web-app-only behaviour.
 *
 * @param {object} [serverless]
 * @returns {boolean}
 */
export const serviceHasWebApps = (serverless) =>
  Object.keys(getWebAppsConfig(serverless)).length > 0

/** Appended to a Web Function failure whose reason names a quota or limit. */
export const WEB_FUNCTION_QUOTA_CONTEXT =
  "Check this account's Web Function quotas with: aws lambda-web get-web-account-settings"

/**
 * Appended to CloudFormation's error for a Region without the Web Function
 * resource types: there `ValidateTemplate` answers "Template format error:
 * Unrecognized resource types: [AWS::Lambda::WebFunction, ...]", which does
 * not name the Region as the cause. No AWS page lists the Regions in a form a
 * link can point at, so the message names none.
 *
 * @param {string} region
 * @returns {string}
 */
export const getWebFunctionsUnavailableContext = (region) =>
  `AWS Lambda Web Functions aren't available in ${region}. Deploy to a Region that offers them.`

/**
 * The wording of a deployment bucket error or warning, which names only
 * settings the service sets: the `codeStorageMode: reference` text when the
 * service sets it, with or without web apps, otherwise the web apps text when
 * the service has web apps.
 *
 * @param {object} serverless
 * @param {object} provider
 * @param {{ reference: string, webApps: string }} messages
 * @returns {string}
 */
export const bucketMessage = (serverless, provider, { reference, webApps }) =>
  !provider.isReferenceCodeStorageMode() && serviceHasWebApps(serverless)
    ? webApps
    : reference
