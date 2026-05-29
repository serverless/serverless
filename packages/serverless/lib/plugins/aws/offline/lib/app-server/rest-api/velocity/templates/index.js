import { readFileSync } from 'node:fs'

/**
 * The default `application/json` request mapping template for REST API Lambda
 * (AWS, non-proxy) integrations. API Gateway applies a built-in passthrough
 * template when an integration declares no template of its own; this mirrors
 * that template, producing the AWS-shaped event (body, method, headers, query,
 * path, identity, stageVariables, enhancedAuthContext, requestPath).
 *
 * Read once at module load — the template is a static asset.
 */
export const defaultRequestTemplate = readFileSync(
  new URL('./offline-default.req.vm', import.meta.url),
  'utf8',
)
