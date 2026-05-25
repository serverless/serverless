/**
 * APIGW REST API (v1) non-proxy (Lambda integration) event factory for the
 * offline REST server.
 *
 * Selects the velocity request template matching the request's content type,
 * builds the `{ context, input, util }` scope, and renders the template into
 * the JSON event passed to the Lambda. When no template matches, the parsed
 * request payload is forwarded verbatim, mirroring the upstream fallback
 * behavior of API Gateway when a content-type lacks a mapping template.
 */

import ServerlessError from '../../../../../../../serverless-error.js'
import { buildVelocityContext } from '../velocity/context.js'
import { renderVelocityTemplateObject } from '../velocity/render.js'

/**
 * Build the Lambda event for a non-proxy (Lambda integration) REST API route.
 *
 * @param {object} args
 * @param {object} args.request          - Hapi-shaped request object.
 * @param {string} args.stage            - The deployment stage (e.g. "dev").
 * @param {string} args.resourcePath     - The API Gateway resource path.
 * @param {object} [args.requestTemplates] - Map of content-type to template.
 * @returns {unknown}
 */
export function buildNonProxyEvent({
  request,
  stage,
  resourcePath,
  requestTemplates,
}) {
  const contentType = request.mime ?? 'application/json'
  const template = requestTemplates?.[contentType]

  if (template === undefined || template === null) {
    return request.payload
  }

  const velocityContext = buildVelocityContext({
    request,
    stage,
    payload: request.payload ?? {},
    resourcePath,
  })

  try {
    return renderVelocityTemplateObject(template, velocityContext)
  } catch (error) {
    throw new ServerlessError(
      `Failed to render request template for content type "${contentType}": ${error.message}`,
      'OFFLINE_REST_TEMPLATE_RENDER_FAILED',
    )
  }
}
