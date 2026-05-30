/**
 * Hapi auth scheme for custom Lambda authorizers (TOKEN + REQUEST types).
 *
 * Algorithm per AWS API Gateway:
 *   1. Build the methodArn from the request (apiId=offline, accountId,
 *      stage, method, path).
 *   2. For REQUEST: extract the identitySource. If a source is configured but
 *      its value is absent → 401 (do NOT invoke the authorizer Lambda — same
 *      behavior as real APIGW). When no identitySource is configured, invoke
 *      with an empty identity (identity type NONE) rather than rejecting.
 *      For TOKEN: when an identityValidationExpression is configured, the
 *      incoming token is matched against it; a non-match → 401 without
 *      invoking the authorizer Lambda (matching real APIGW).
 *   3. Build the TOKEN or REQUEST event.
 *   4. Invoke the configured authorizer Lambda via the LambdaFunction
 *      facade — same worker pool as user handlers.
 *   5. On thrown / literal `'Unauthorized'` → 401.
 *   6. Evaluate the returned policy. Missing principalId → 403.
 *      No Allow match (or any Deny) → 403. Otherwise 200 with credentials
 *      attached so the downstream event factory can surface the authorizer
 *      context to the handler.
 */

import {
  buildTokenEvent,
  buildRequestEvent,
} from './lambda-authorizer-event.js'
import { evaluatePolicy } from './policy-evaluator.js'
import {
  parseIdentitySource,
  allIdentitySourcesPresent,
} from './identity-source.js'
import {
  unauthorized,
  forbidden,
  authorizerConfigurationError,
} from '../shared/auth-envelopes.js'
import { validateAuthorizerContext } from './validate-authorizer-context.js'

const UNAUTHORIZED_LITERAL = 'Unauthorized'

/**
 * @param {object} opts
 * @param {object} opts.authorizerDef
 *   `{ name, type?: 'TOKEN'|'REQUEST', identitySource?: string }`. type
 *   defaults to TOKEN when omitted.
 * @param {{ invoke: (event: object) => Promise<unknown> }} opts.lambdaFunction
 *   Resolved LambdaFunction facade for the configured authorizer.
 * @param {string} opts.stage
 * @param {string} opts.accountId
 * @returns {(server: import('@hapi/hapi').Server) => object}
 */
export function createLambdaAuthorizerScheme({
  authorizerDef,
  lambdaFunction,
  stage,
  accountId,
}) {
  const type = String(authorizerDef.type ?? 'TOKEN').toUpperCase()
  const identitySources =
    type === 'REQUEST' ? parseIdentitySource(authorizerDef.identitySource) : []
  // TOKEN authorizers may declare a regex the incoming token must match before
  // the authorizer Lambda is invoked; a non-match is a 401 with no invocation.
  // An unparseable expression is ignored (treated as no validation).
  const identityValidationRegExp =
    type === 'TOKEN'
      ? safeRegExp(authorizerDef.identityValidationExpression)
      : null

  return function lambdaAuthorizerSchemeFactory() {
    return {
      async authenticate(request, h) {
        // The APIGW resource template (e.g. `/users/{id}`), the request path
        // with the stage prefix stripped, and the uppercased method are shared
        // by the method ARN and the REQUEST event below. The full wire path
        // (stage prefix intact) is threaded separately as `requestContext.path`,
        // mirroring the REST proxy factory's `path` / `eventPath` split — real
        // API Gateway reports `$context.path` with the stage, while the
        // top-level `event.path` has it stripped.
        const resourcePath =
          request.route?.settings?.plugins?.offline?.apigwPath ??
          stripStage(request.path, stage)
        const eventPath = stripStage(request.path, stage)
        const method = request.method.toUpperCase()
        const methodArn = buildMethodArn({
          resourcePath,
          method,
          stage,
          accountId,
        })

        let event
        if (type === 'REQUEST') {
          // A REQUEST authorizer requires EVERY configured identitySource to be
          // present and non-empty; if any is missing it is a 401 with no
          // invocation (matching real API Gateway). A REQUEST authorizer with
          // no identitySource is invoked with an empty identity (identity type
          // NONE) — never short-circuited to 401. The resolved values are not
          // surfaced on the event (REST v1 REQUEST events carry no
          // identitySource); they only gate the 401 decision.
          if (
            identitySources.length > 0 &&
            !allIdentitySourcesPresent(request, identitySources)
          ) {
            return unauthorized(h)
          }
          event = buildRequestEvent({
            request,
            methodArn,
            resourcePath,
            path: eventPath,
            requestContextPath: request.path,
            httpMethod: method,
            stage,
            accountId,
          })
        } else {
          const authorizationToken = readAuthorizationHeader(request)
          if (!authorizationToken) {
            return unauthorized(h)
          }
          if (
            identityValidationRegExp &&
            !identityValidationRegExp.test(authorizationToken)
          ) {
            return unauthorized(h)
          }
          event = buildTokenEvent({ methodArn, authorizationToken })
        }

        let result
        try {
          result = await lambdaFunction.invoke(event)
        } catch {
          return unauthorized(h)
        }

        if (result === UNAUTHORIZED_LITERAL) {
          return unauthorized(h)
        }

        if (!result || typeof result !== 'object') {
          return forbidden(h)
        }

        const {
          principalId,
          policyDocument,
          context = {},
          usageIdentifierKey,
        } = result

        if (!principalId) {
          return forbidden(h)
        }

        let evaluation
        try {
          evaluation = evaluatePolicy({
            principalId,
            methodArn,
            policyDocument,
            context,
          })
        } catch {
          return forbidden(h)
        }

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
            // Surface a usageIdentifierKey returned by the authorizer so a
            // private route's api-key requirement can be satisfied by the
            // authorizer's key (matching real API Gateway behavior). Only a
            // string key is meaningful; ignore other shapes.
            ...(typeof usageIdentifierKey === 'string' && usageIdentifierKey
              ? { usageIdentifierKey }
              : {}),
            authorizer: {
              principalId: evaluation.principalId,
              ...validated.context,
            },
          },
        })
      },
    }
  }
}

function buildMethodArn({ resourcePath, method, stage, accountId }) {
  return `arn:aws:execute-api:us-east-1:${accountId}:offline/${stage}/${method}${resourcePath}`
}

function stripStage(path, stage) {
  if (!path) return '/'
  const prefix = `/${stage}`
  if (path === prefix) return '/'
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length)
  return path
}

function readAuthorizationHeader(request) {
  const raw = request?.headers?.authorization
  if (typeof raw === 'string' && raw.length > 0) return raw
  return null
}

/**
 * Compile a validation expression into a RegExp, or null when the input is
 * absent or not a valid pattern (lenient — a bad expression disables
 * validation rather than crashing the request).
 *
 * @param {unknown} source
 * @returns {RegExp | null}
 */
function safeRegExp(source) {
  if (typeof source !== 'string' || source.length === 0) return null
  try {
    return new RegExp(source)
  } catch {
    return null
  }
}
