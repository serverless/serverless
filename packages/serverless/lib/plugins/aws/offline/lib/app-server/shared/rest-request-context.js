/**
 * Placeholder values that fill APIGW REST API (v1) `requestContext` fields
 * whose real values would come from the deployed API (apiId / domainPrefix /
 * resourceId) or the gateway's HTTP protocol negotiation (protocol).
 *
 * Shared single source of truth so the REST proxy event factory and the Lambda
 * authorizer REQUEST event factory emit byte-identical placeholders and cannot
 * drift apart.
 */

export const PLACEHOLDER_API_ID = 'offline'
export const PLACEHOLDER_DOMAIN_PREFIX = 'offline'
export const PLACEHOLDER_RESOURCE_ID = 'offline'
export const PLACEHOLDER_PROTOCOL = 'HTTP/1.1'
