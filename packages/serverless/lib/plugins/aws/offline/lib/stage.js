/**
 * Single source of truth for the active deployment stage offline.
 *
 * Several subsystems need the stage value: the HTTP API event factory
 * populates `event.requestContext.stage`, the REST API route loader prepends
 * `/<stage>/` to route paths (unless `--noPrependStageInUrl`), the WebSocket
 * `@connections` mount lives at `/<stage>/@connections/{id}`, ARN/URL
 * synthesizers embed it, and the provisioner builds the local CloudFormation
 * stack name from it. Inlining `provider.stage ?? DEFAULT_STAGE` at every
 * site invites drift; centralising avoids it.
 *
 * Framework already wires `--stage` into `serverless.service.provider.stage`,
 * so this helper only reads that value with the documented fallback.
 */

import { DEFAULT_STAGE } from './constants.js'

/**
 * Read the active stage from a Framework serverless instance.
 *
 * @param {object} serverless - A Framework serverless instance.
 * @returns {string} The stage name (e.g. `'dev'`, `'prod'`).
 */
export function getStage(serverless) {
  return serverless?.service?.provider?.stage ?? DEFAULT_STAGE
}
