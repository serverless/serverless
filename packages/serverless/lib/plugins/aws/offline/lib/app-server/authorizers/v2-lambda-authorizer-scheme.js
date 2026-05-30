/**
 * Hapi auth scheme for HTTP API v2 custom Lambda authorizers (REQUEST only).
 *
 * AWS HTTP API v2 differs from REST v1:
 *   - Only REQUEST authorizer type (no TOKEN).
 *   - identitySource uses `$request.header.*` / `$request.querystring.*`.
 *   - The authorizer Lambda receives a v2 payload (version "2.0") with
 *     `routeKey` + `routeArn` instead of `methodArn`.
 *   - On success the authorizer context is surfaced to the handler under
 *     `requestContext.authorizer.lambda.<key>` — i.e. the credentials we
 *     attach here are namespaced as `{ authorizer: { lambda: <context> } }`.
 *
 * Algorithm:
 *   1. Parse identitySource (defaults to `$request.header.Authorization`).
 *   2. Extract the value from the Hapi request. If null → 401 (do NOT
 *      invoke the authorizer Lambda — same behavior as real APIGW).
 *   3. Synthesize routeKey + routeArn from the matched route.
 *   4. Build the v2 REQUEST event and invoke the configured Lambda via the
 *      LambdaFunction facade — same worker pool as user handlers.
 *   5. A literal `'Unauthorized'` result, or an error whose message is exactly
 *      `Unauthorized`, → 401. Any other thrown error or a non-object result is
 *      an authorizer configuration error → 500.
 *   6. Simple-response authorizers (`enableSimpleResponses`): `isAuthorized`
 *      falsy → 403, else 200 with credentials.authorizer.lambda = context
 *      (validated; bad context → 500). No policy evaluation.
 *   7. Otherwise (IAM policy): a missing principalId or a malformed policy
 *      document is a configuration error → 500; a well-formed policy with no
 *      Allow match (or any Deny) → 403.
 *   8. On allow → 200 with credentials.authorizer.lambda = context
 *      (validated; bad context → 500).
 */

import crypto from 'node:crypto'
import { buildV2RequestEvent } from './v2-lambda-authorizer-event.js'
import { evaluatePolicy } from './policy-evaluator.js'
import {
  unauthorized,
  forbidden,
  authorizerConfigurationError,
} from '../shared/auth-envelopes.js'
import { validateAuthorizerContext } from './validate-authorizer-context.js'
import {
  parseV2IdentitySource,
  extractV2IdentitySource,
} from './v2-identity-source.js'

const UNAUTHORIZED_LITERAL = 'Unauthorized'
const DEFAULT_IDENTITY_SOURCE = '$request.header.Authorization'

/**
 * @param {object} opts
 * @param {object} opts.authorizerDef
 *   `{ name, identitySource?: string | string[], enableSimpleResponses?: boolean }`.
 *   identitySource defaults to `$request.header.Authorization` when omitted.
 *   `enableSimpleResponses` switches the expected authorizer result to the
 *   `{ isAuthorized, context }` simple-response shape.
 * @param {{ invoke: (event: object) => Promise<unknown> }} opts.lambdaFunction
 *   Resolved LambdaFunction facade for the configured authorizer.
 * @param {string} opts.stage
 * @param {string} opts.accountId
 * @param {string} opts.domainName
 * @returns {(server: import('@hapi/hapi').Server) => object}
 */
export function createV2LambdaAuthorizerScheme({
  authorizerDef,
  lambdaFunction,
  stage,
  accountId,
  domainName,
}) {
  const identitySources = parseV2IdentitySource(
    authorizerDef.identitySource ?? DEFAULT_IDENTITY_SOURCE,
  )

  return function v2LambdaAuthorizerSchemeFactory() {
    return {
      async authenticate(request, h) {
        const authorizationToken = extractV2IdentitySource(
          request,
          identitySources,
        )
        if (authorizationToken === null) {
          return unauthorized(h)
        }

        const apigwPath =
          request.route?.settings?.plugins?.offline?.apigwPath ?? request.path
        const method = request.method.toUpperCase()
        const routeKey = `${method} ${apigwPath}`
        const routeArn = `arn:aws:execute-api:us-east-1:${accountId}:offline/${stage}/${method}${apigwPath}`

        const event = buildV2RequestEvent({
          request,
          routeArn,
          routeKey,
          authorizationToken,
          stage,
          accountId,
          domainName,
          requestId: crypto.randomUUID(),
        })

        let result
        try {
          result = await lambdaFunction.invoke(event)
        } catch (err) {
          // Only an error whose message is exactly `Unauthorized` denies access
          // with a 401 (matching real API Gateway). Any other thrown error is
          // an authorizer configuration failure → 500.
          if (err?.message === UNAUTHORIZED_LITERAL) {
            return unauthorized(h)
          }
          return authorizerConfigurationError(h)
        }

        if (result === UNAUTHORIZED_LITERAL) {
          return unauthorized(h)
        }

        // A non-object authorizer response (other than the literal
        // `Unauthorized`) is a configuration error → 500.
        if (!result || typeof result !== 'object') {
          return authorizerConfigurationError(h)
        }

        if (authorizerDef.enableSimpleResponses) {
          if (!result.isAuthorized) {
            return forbidden(h)
          }
          const validated = validateAuthorizerContext(result.context)
          if (!validated.ok) {
            return authorizerConfigurationError(h)
          }
          return h.authenticated({
            credentials: {
              authorizer: {
                lambda: validated.context,
              },
            },
          })
        }

        const { principalId, policyDocument, context = {} } = result

        // A missing principalId is a malformed authorizer response → 500.
        if (!principalId) {
          return authorizerConfigurationError(h)
        }

        let evaluation
        try {
          evaluation = evaluatePolicy({
            principalId,
            methodArn: routeArn,
            policyDocument,
            context,
          })
        } catch {
          // A malformed policy document is a configuration error → 500.
          return authorizerConfigurationError(h)
        }

        // A well-formed policy that does not Allow the resource (or Denies it)
        // is an authorization denial → 403.
        if (!evaluation.allow) {
          return forbidden(h)
        }

        const validated = validateAuthorizerContext(evaluation.context)
        if (!validated.ok) {
          return authorizerConfigurationError(h)
        }

        return h.authenticated({
          credentials: {
            principalId: evaluation.principalId,
            authorizer: {
              lambda: validated.context,
            },
          },
        })
      },
    }
  }
}
