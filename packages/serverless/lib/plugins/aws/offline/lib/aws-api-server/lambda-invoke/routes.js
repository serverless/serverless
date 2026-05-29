import { Buffer } from 'node:buffer'
import {
  toInvokeResponse,
  toInvokeError,
  toNotFound,
  toInvalidParameterValue,
} from './response.js'

/**
 * AWS Lambda Invoke API route registration.
 *
 * Mounts the two documented Lambda invocation endpoints on a Hapi server so a
 * handler can call another local function through the AWS SDK `LambdaClient`
 * (pointed at the offline AWS-API server). Both routes resolve the deployed
 * `{functionName}` back to a serverless.yml key, decode the optional
 * `X-Amz-Client-Context` header, parse the raw request body as JSON, and
 * dispatch through the shared function facade.
 *
 *  - POST /2015-03-31/functions/{functionName}/invocations  — synchronous by
 *    default; asynchronous when `X-Amz-Invocation-Type: Event` is sent.
 *  - POST /2014-11-13/functions/{functionName}/invoke-async  — always
 *    asynchronous (legacy API).
 */

const INVOCATIONS_PATH = '/2015-03-31/functions/{functionName}/invocations'
const INVOKE_ASYNC_PATH = '/2014-11-13/functions/{functionName}/invoke-async'

// Synchronous invoke responses cap at 6 MB; match that for the raw request
// body so the SDK's `application/x-amz-json-1.0` payload is accepted as-is.
const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024

/**
 * Parse the raw request payload Buffer into an event object. An empty body
 * yields `{}`; malformed JSON is tolerated and also falls back to `{}` so a
 * stray body never turns into a 500 in local development.
 *
 * @param {Buffer | undefined} payload
 * @returns {unknown}
 */
function parseEvent(payload) {
  if (!payload || payload.length === 0) return {}
  try {
    return JSON.parse(payload.toString('utf8'))
  } catch {
    return {}
  }
}

/**
 * Decode the base64 `X-Amz-Client-Context` header into an object. Returns
 * `undefined` when the header is absent or cannot be decoded.
 *
 * @param {string | undefined} header
 * @returns {unknown}
 */
function decodeClientContext(header) {
  if (!header) return undefined
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * Register the two Lambda Invoke routes on the supplied Hapi server. Must be
 * called before any catch-all (`* /{any*}`) route so the specific invoke paths
 * take precedence in Hapi's match table.
 *
 * @param {import('@hapi/hapi').Server} server
 * @param {object} deps
 * @param {(functionKey: string) => { invoke: (event: unknown, options?: { clientContext?: unknown }) => Promise<unknown> }} deps.getLambdaFunction
 *   Resolves a function facade by its serverless.yml key.
 * @param {Map<string, string>} deps.functionNameMap
 *   Lookup from deployed function name to serverless.yml key.
 * @param {{ error?: (...args: unknown[]) => void }} [deps.logger]
 *   Optional logger; async invoke rejections are reported via `logger.error`.
 */
export function registerLambdaInvokeRoutes(
  server,
  { getLambdaFunction, functionNameMap, logger },
) {
  const payloadOptions = {
    payload: { parse: false, maxBytes: MAX_PAYLOAD_BYTES },
  }

  /**
   * Fire-and-forget an asynchronous invoke and return an immediate 202. A
   * synchronous `.catch` keeps a rejected invoke from becoming an unhandled
   * rejection.
   */
  function invokeAsync(functionKey, event, options, h) {
    getLambdaFunction(functionKey)
      .invoke(event, options)
      .catch((err) => logger?.error?.(err))
    return h.response('').code(202)
  }

  server.route({
    method: 'POST',
    path: INVOCATIONS_PATH,
    options: payloadOptions,
    /**
     * Synchronous (`RequestResponse`, the default) or asynchronous (`Event`)
     * invocation, selected by the `X-Amz-Invocation-Type` header.
     */
    handler(request, h) {
      const { functionName } = request.params
      const functionKey = functionNameMap.get(functionName)
      if (functionKey === undefined) return toNotFound(functionName, h)

      const event = parseEvent(request.payload)
      const clientContext = decodeClientContext(
        request.headers['x-amz-client-context'],
      )
      const options = { clientContext }

      const invocationType =
        request.headers['x-amz-invocation-type'] ?? 'RequestResponse'

      // DryRun validates the request (function existence, here) without
      // invoking the handler and returns an empty 204, matching real Lambda.
      if (invocationType === 'DryRun') {
        return h.response().code(204)
      }

      if (invocationType !== 'Event' && invocationType !== 'RequestResponse') {
        return toInvalidParameterValue(
          `Unsupported invocation type: ${invocationType}`,
          h,
        )
      }

      if (invocationType === 'Event') {
        return invokeAsync(functionKey, event, options, h)
      }

      return (async () => {
        try {
          const result = await getLambdaFunction(functionKey).invoke(
            event,
            options,
          )
          return toInvokeResponse(result, h)
        } catch (err) {
          return toInvokeError(err, h)
        }
      })()
    },
  })

  server.route({
    method: 'POST',
    path: INVOKE_ASYNC_PATH,
    options: payloadOptions,
    /**
     * Legacy asynchronous invocation — always fire-and-forget, 202.
     */
    handler(request, h) {
      const { functionName } = request.params
      const functionKey = functionNameMap.get(functionName)
      if (functionKey === undefined) return toNotFound(functionName, h)

      const event = parseEvent(request.payload)
      const clientContext = decodeClientContext(
        request.headers['x-amz-client-context'],
      )

      return invokeAsync(functionKey, event, { clientContext }, h)
    },
  })
}
