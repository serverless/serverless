'use strict'

/** The one endpoint every web app gets in v1. */
const ENDPOINT_NAME = 'main'

/**
 * A numeric string as a number (`configValidationMode: off` leaves one as
 * written); a number or an intrinsic as it is.
 */
const toNumber = (value) => (typeof value === 'string' ? Number(value) : value)

/**
 * `IamAuth` behind a custom domain (CloudFront signs its requests, and
 * anonymous direct calls get 403) or when `url.authorizer` is `aws_iam` (any
 * case), else `ApplicationManaged`, the public endpoint `url: true` (or no
 * `url`) means.
 *
 * @param {object} webApp
 * @param {boolean} [behindDomain]
 * @returns {'IamAuth'|'ApplicationManaged'}
 */
export function getWebAppAuthType(webApp, behindDomain) {
  const authorizer = webApp.url?.authorizer
  return behindDomain ||
    (typeof authorizer === 'string' && authorizer.toLowerCase() === 'aws_iam')
    ? 'IamAuth'
    : 'ApplicationManaged'
}

/**
 * `AWS::Lambda::WebFunctionEndpoint`: the HomeRegion endpoint `main`, sending
 * all traffic to the current revision. It waits for both log groups, so no
 * request reaches the function before its log groups exist with retention.
 *
 * @param {object} params
 * @param {string} params.functionName
 * @param {object} params.webApp
 * @param {ReturnType<import('./function.js').getWebAppLogicalIds>} params.logicalIds
 * @param {boolean} [params.behindDomain] - a domain entry targets the web app
 */
export function compileEndpoint({
  functionName,
  webApp,
  logicalIds,
  behindDomain,
}) {
  const url = typeof webApp.url === 'object' && webApp.url ? webApp.url : {}
  const properties = {
    FunctionName: functionName,
    EndpointName: ENDPOINT_NAME,
    EndpointType: 'HomeRegion',
    AuthType: getWebAppAuthType(webApp, behindDomain),
    RevisionWeights: [
      {
        RevisionId: { 'Fn::GetAtt': [logicalIds.revision, 'RevisionId'] },
        Weight: 100,
      },
    ],
  }
  if (url.maxEnvironments !== undefined) {
    properties.ScalingConfig = {
      MaxEnvironments: toNumber(url.maxEnvironments),
    }
  }
  if (url.rateLimit !== undefined) {
    properties.ThrottleConfig = { RateLimit: toNumber(url.rateLimit) }
  }
  return {
    Type: 'AWS::Lambda::WebFunctionEndpoint',
    DependsOn: [
      logicalIds.webFunction,
      logicalIds.logGroup,
      logicalIds.localLogGroup,
    ],
    Properties: properties,
  }
}
