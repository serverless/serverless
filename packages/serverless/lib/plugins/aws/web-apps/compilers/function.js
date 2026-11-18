'use strict'

import { getLogicalId, getStageScopedName } from '../../lib/resource-naming.js'

/**
 * The web function's name: the entry's `name`, else
 * `<service>-<stage>-<key>`, the order functions use, sanitised and capped at
 * 64 characters.
 *
 * @param {{ serviceName: string, stage: string }} ctx
 * @param {string} key - the web app's key under `webApps`
 * @param {object} webApp - `webApps.<key>`
 * @returns {string}
 */
export function getWebAppFunctionName(ctx, key, webApp) {
  return webApp?.name ?? getStageScopedName(ctx.serviceName, ctx.stage, key)
}

/**
 * Logical IDs of everything compiled for one web app, named after its key.
 *
 * @param {string} key - the web app's key under `webApps`
 */
export function getWebAppLogicalIds(key) {
  const id = (suffix) => getLogicalId(key, suffix)
  return {
    webFunction: id('WebFunction'),
    revision: id('WebFunctionRevision'),
    endpoint: id('WebFunctionEndpoint'),
    logGroup: id('WebFunctionLogGroup'),
    localLogGroup: id('WebFunctionLocalLogGroup'),
    networkConnector: id('WebFunctionNetworkConnector'),
    networkConnectorOperatorRole: id('WebFunctionNetworkConnectorOperatorRole'),
    // perFunction mode, or a web app with iam.role
    executionRole: id('WebFunctionIamRoleLambdaExecution'),
    // a domain entry targets the web app
    originAccessControl: id('WebFunctionOriginAccessControl'),
    resourcePolicy: id('WebFunctionResourcePolicy'),
    urlOutput: id('WebFunctionUrl'),
  }
}

/**
 * `AWS::Lambda::WebFunction`: the name and tags (`provider.tags` merged under
 * the entry's `tags`). Code and settings live on the revision. It depends on
 * its log groups so that stack deletion removes the function and its
 * environments first: a log line delivered after a group is gone would make
 * Lambda recreate that group without a retention period.
 *
 * @param {object} params
 * @param {string} params.functionName
 * @param {object} params.webApp
 * @param {ReturnType<typeof getWebAppLogicalIds>} params.logicalIds
 * @param {object} params.providerConfig - `serverless.service.provider`
 */
export function compileWebFunction({
  functionName,
  webApp,
  logicalIds,
  providerConfig,
}) {
  const tags = { ...providerConfig.tags, ...webApp.tags }
  const properties = { FunctionName: functionName }
  if (Object.keys(tags).length > 0) {
    properties.Tags = Object.entries(tags).map(([Key, Value]) => ({
      Key,
      Value,
    }))
  }
  return {
    Type: 'AWS::Lambda::WebFunction',
    DependsOn: [logicalIds.logGroup, logicalIds.localLogGroup],
    Properties: properties,
  }
}
