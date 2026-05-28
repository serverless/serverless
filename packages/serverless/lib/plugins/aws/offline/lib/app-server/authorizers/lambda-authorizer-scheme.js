/**
 * Hapi auth scheme for custom Lambda authorizers (TOKEN + REQUEST types).
 *
 * Algorithm per AWS API Gateway:
 *   1. Build the methodArn from the request (apiId=offline, accountId,
 *      stage, method, path).
 *   2. For REQUEST: extract the identitySource. If null → 401 (do NOT
 *      invoke the authorizer Lambda — same behavior as real APIGW).
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
  extractIdentitySource,
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

  return function lambdaAuthorizerSchemeFactory() {
    return {
      async authenticate(request, h) {
        const methodArn = buildMethodArn({
          request,
          stage,
          accountId,
        })

        let authorizationToken
        if (type === 'REQUEST') {
          authorizationToken = extractIdentitySource(request, identitySources)
          if (authorizationToken === null) {
            return unauthorized(h)
          }
        } else {
          authorizationToken = readAuthorizationHeader(request)
          if (!authorizationToken) {
            return unauthorized(h)
          }
        }

        const event =
          type === 'REQUEST'
            ? buildRequestEvent({ request, methodArn, authorizationToken })
            : buildTokenEvent({ methodArn, authorizationToken })

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

        const { principalId, policyDocument, context = {} } = result

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

function buildMethodArn({ request, stage, accountId }) {
  const apigwPath =
    request.route?.settings?.plugins?.offline?.apigwPath ??
    stripStage(request.path, stage)
  const method = request.method.toUpperCase()
  return `arn:aws:execute-api:us-east-1:${accountId}:offline/${stage}/${method}${apigwPath}`
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
