// REST API non-proxy (AWS / Lambda integration) response mapper.
//
// Translates a Lambda handler's resolved value or thrown error into a Hapi
// response shaped according to the endpoint's `responses` map — the classic
// API Gateway "integration response" pipeline. Responsibilities:
//
//   1. Pick the matching response key (`default` on success; first response
//      whose `selectionPattern` — or, lacking that, whose key — matches the
//      error message on failure; fall back to `default`).
//   2. Derive the HTTP status code (chosen response's `statusCode`, or 200 on
//      success; on error: a `[NNN]` status prefix in `err.message` wins,
//      otherwise the chosen response's `statusCode`, otherwise 502).
//   3. Render `responseTemplates[contentType]` (when present) against a
//      velocity context whose `$input.body` is the result or the AWS-shaped
//      error envelope `{ errorMessage, errorType, stackTrace }`.
//   4. Apply `responseParameters` — currently only the
//      `method.response.header.<NAME>` left-hand form is honored, with the
//      right-hand either `'literal-quoted'`, bare passthrough, or
//      `integration.response.body[.JSON_path]`.
//
// Any failure rendering a template falls through to plain JSON serialization
// of the payload, so a bad template never crashes the request.

import { Buffer } from 'node:buffer'

import { buildVelocityContext } from '../velocity/context.js'
import { renderVelocityTemplateObject } from '../velocity/render.js'
import { jsonPath } from '../velocity/json-path.js'

/**
 * Map a non-proxy REST API integration result to a Hapi response.
 *
 * @param {object} args
 * @param {unknown} args.result        Handler return value (success path).
 * @param {Error | null | undefined} args.err  Handler error (failure path).
 * @param {Record<string, object>} args.responses  Endpoint's response map
 *                                                 keyed by name (`default`
 *                                                 plus any status-coded keys).
 * @param {object} args.request        Hapi-shaped request.
 * @param {string} args.stage          Deployment stage (e.g. `"dev"`).
 * @param {string} args.resourcePath   API Gateway resource path.
 * @param {string} [args.contentHandling]  Integration response content
 *                                         handling. When `"CONVERT_TO_BINARY"`,
 *                                         the rendered body string is treated as
 *                                         base64 and decoded to a binary buffer.
 * @param {import('@hapi/hapi').ResponseToolkit} args.h  Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function mapNonProxyResponse({
  result,
  err,
  responses,
  request,
  stage,
  resourcePath,
  contentHandling,
  h,
}) {
  const responseMap = responses ?? {}

  // 1 + 2. Pick the response key + derive status code.
  let payload
  let chosenKey = 'default'
  let statusCode

  if (err) {
    const message = (err.message ?? err ?? '').toString()
    payload = {
      errorMessage: message,
      errorType: err?.constructor?.name ?? 'Error',
      stackTrace: typeof err?.stack === 'string' ? err.stack.split('\n') : [],
    }

    for (const [key, def] of Object.entries(responseMap)) {
      if (key === 'default') continue
      const pattern = def?.selectionPattern ?? key
      try {
        if (new RegExp(`^${pattern}$`).test(message)) {
          chosenKey = key
          break
        }
      } catch {
        // Bad regex — skip silently and keep scanning.
      }
    }

    const chosen = responseMap[chosenKey] ?? {}
    const found = message.match(/\[(\d{3})\]/)
    if (found && found.length > 1) {
      statusCode = Number(found[1])
    } else {
      statusCode = chosen.statusCode ?? 502
    }
  } else {
    payload = result
    const chosen = responseMap[chosenKey] ?? {}
    statusCode = chosen.statusCode ?? 200
  }

  const chosen = responseMap[chosenKey] ?? {}

  // 3. Render responseTemplates[contentType] if defined. The content type
  //    comes from the chosen integration response's configured Content-Type
  //    (the normalizer resolved it onto the record), NOT the request mime.
  const responseContentType = chosen.responseContentType ?? 'application/json'
  const responseTemplate = chosen.responseTemplates?.[responseContentType]
  let body = ''

  if (typeof responseTemplate === 'string' && responseTemplate !== '\n') {
    try {
      const ctx = buildVelocityContext({
        request,
        stage,
        payload,
        resourcePath,
      })
      const rendered = renderVelocityTemplateObject(
        { root: responseTemplate },
        ctx,
      )
      const rootValue = rendered?.root
      body =
        typeof rootValue === 'string' ? rootValue : JSON.stringify(rootValue)
    } catch {
      body = serializePayload(payload)
    }
  } else {
    body = serializePayload(payload)
  }

  // 4. Honor CONVERT_TO_BINARY content handling. API Gateway treats the
  //    rendered text body as base64 and decodes it into the raw binary the
  //    client receives, so decode the string into a Buffer before it reaches
  //    Hapi. Content handling applies only to 2xx integration responses, so
  //    error envelopes (4xx/5xx) pass through as text untouched.
  if (
    contentHandling === 'CONVERT_TO_BINARY' &&
    typeof body === 'string' &&
    String(statusCode).startsWith('2')
  ) {
    body = Buffer.from(body, 'base64')
  }

  // 5. Build Hapi response. Pin the response Content-Type to the same
  //    content type we used to select the response template (defaults to
  //    `application/json`). Without this, Hapi falls back to `text/html`
  //    for string bodies, which diverges from real APIGW behavior — the
  //    integration response carries the template's content type, and a
  //    null/object payload that we JSON-serialize must also surface as
  //    JSON to the client.
  const response = h.response(body).code(statusCode).type(responseContentType)

  // 6. Apply responseParameters (header subset only).
  const { responseParameters } = chosen
  if (responseParameters) {
    for (const [key, value] of Object.entries(responseParameters)) {
      if (typeof key !== 'string' || typeof value !== 'string') continue
      if (!key.startsWith('method.response.header.')) continue

      const headerName = key.slice('method.response.header.'.length)
      if (!headerName) continue

      let headerValue
      if (value.startsWith('integration.response.body')) {
        const path = value.slice('integration.response.body'.length)
        const extracted =
          path === '' || path === '.'
            ? payload
            : jsonPath(payload, path.startsWith('.') ? path.slice(1) : path)
        if (extracted == null) {
          headerValue = ''
        } else if (typeof extracted === 'string') {
          headerValue = extracted
        } else {
          headerValue = String(extracted)
        }
      } else if (/^'.*'$/.test(value)) {
        headerValue = value.slice(1, -1)
      } else {
        headerValue = value
      }

      if (headerValue !== '' && headerValue !== undefined) {
        response.header(headerName, headerValue)
      }
    }
  }

  return response
}

function serializePayload(payload) {
  if (payload === null || payload === undefined) return ''
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload)
  } catch {
    return ''
  }
}
