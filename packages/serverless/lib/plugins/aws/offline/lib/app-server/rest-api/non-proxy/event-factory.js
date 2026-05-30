/**
 * APIGW REST API (v1) non-proxy (Lambda integration) event factory for the
 * offline REST server.
 *
 * Selects the velocity request template matching the request's content type,
 * builds the `{ context, input, util }` scope, and renders the template into
 * the JSON event passed to the Lambda. For application/json and
 * application/x-www-form-urlencoded with no configured template, API Gateway's
 * built-in passthrough template is applied. A request whose content type
 * matches neither a configured template nor a built-in default is rejected:
 * the default passthrough behavior for an AWS (Lambda) integration is NEVER, so
 * API Gateway answers 415 Unsupported Media Type and never delivers the body to
 * the integration.
 */

import ServerlessError from '../../../../../../../serverless-error.js'
import { buildVelocityContext } from '../velocity/context.js'
import { renderVelocityTemplateObject } from '../velocity/render.js'
import { defaultRequestTemplate } from '../velocity/templates/index.js'

/**
 * Error code thrown by `buildNonProxyEvent` when the request's content type has
 * no matching request template (configured or built-in default). The non-proxy
 * dispatch translates this into a 415 Unsupported Media Type reply.
 */
export const UNSUPPORTED_MEDIA_TYPE_CODE = 'OFFLINE_REST_UNSUPPORTED_MEDIA_TYPE'

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
  const explicit = requestTemplates?.[contentType]
  // API Gateway applies a built-in passthrough template for application/json
  // and application/x-www-form-urlencoded when an integration declares no
  // template of its own. The gateway's form template parses the raw `a=1&b=2`
  // string into an object before emitting it as the event body; Hapi has
  // already parsed the form body into exactly that object (route payload
  // parsing is on for non-proxy integrations), so the JSON default template —
  // which emits `"body": $input.json("$")` — reproduces the correct event body
  // for both content types.
  const template =
    explicit ??
    (contentType === 'application/json' ||
    contentType === 'application/x-www-form-urlencoded'
      ? defaultRequestTemplate
      : undefined)

  // A content type with neither a configured template nor a built-in default
  // is rejected. The AWS (Lambda) integration's default passthrough behavior is
  // NEVER, so API Gateway answers 415 and the body never reaches the
  // integration. The dispatch translates this signal into a 415 reply.
  if (template === undefined || template === null) {
    throw new ServerlessError(
      `No request template matches content type "${contentType}"`,
      UNSUPPORTED_MEDIA_TYPE_CODE,
    )
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
