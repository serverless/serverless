/**
 * Builder for the `requestContext.identity` object AWS API Gateway emits on the
 * REST API (v1) Lambda-proxy event and on the HTTP API payload format 1.0 event
 * (which mirrors the REST v1 shape). Shared so both factories produce a
 * byte-identical identity block.
 *
 * Only `sourceIp` and `userAgent` are populated locally; every other documented
 * field is reported as `null`, matching real API Gateway when no IAM / Cognito
 * authorizer attributed the caller.
 */

/**
 * Build the REST-style `requestContext.identity` object.
 *
 * @param {object} opts
 * @param {string} opts.sourceIp   Remote IP address.
 * @param {string} opts.userAgent  Request `User-Agent` (empty string when absent).
 * @returns {Record<string, string | null>}
 */
export function buildRestIdentity({ sourceIp, userAgent }) {
  return {
    accessKey: null,
    accountId: null,
    caller: null,
    cognitoAuthenticationProvider: null,
    cognitoAuthenticationType: null,
    cognitoIdentityId: null,
    cognitoIdentityPoolId: null,
    principalOrgId: null,
    sourceIp,
    user: null,
    userAgent,
    userArn: null,
  }
}
