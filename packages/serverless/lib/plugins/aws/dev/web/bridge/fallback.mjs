/**
 * The way to the deployed code: a request the developer's machine did not take is sent to the
 * endpoint `sls-dev-fallback`, which serves a clone of the deployed revision with the auth type of
 * `main` (SLS_DEV_FALLBACK_AUTH):
 *
 * - ApplicationManaged (the default for web apps): the request goes as it came, unsigned, so the
 *   app's own Authorization header reaches it as it reaches `main`.
 * - IamAuth: signed with SigV4 for the service `lambda` in the headers, with the broker
 *   credentials, whose session policy allows lambda:InvokeWebFunctionEndpoint on this endpoint
 *   alone (the execution role may not invoke it). The payload is not hashed (UNSIGNED-PAYLOAD).
 *   AWS strips the caller's Authorization on `main` before the bridge sees it, and strips the
 *   bridge's signature before the app sees it.
 *
 * Either way the request keeps its path and query, Host is the endpoint's, the public host is kept
 * in X-Forwarded-Host, and the headers AWS adds to each request (lambda-web-*) are left for AWS to
 * add again.
 */
import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '../../../lib/sigv4.js'
import { endToEndHeaders } from './http.mjs'

const SERVICE = 'lambda'
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'
// What signing sets: an incoming value of these would sit next to the signature.
const SIGNING_HEADERS = [
  'authorization',
  'x-amz-date',
  'x-amz-security-token',
  'x-amz-content-sha256',
]
// Added by AWS to every request it hands to a web function.
const PLATFORM_HEADER = /^lambda-web-/

const decode = (text) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** The query string as name/value pairs, decoded as AWS decodes it ('+' stays '+'). */
const queryOf = (search) => {
  const query = new Map()
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (!part) continue
    const at = part.indexOf('=')
    const name = decode(at < 0 ? part : part.slice(0, at))
    const value = at < 0 ? '' : decode(part.slice(at + 1))
    query.set(name, query.has(name) ? [query.get(name), value].flat() : value)
  }
  // Own properties whatever the names, `__proto__` included.
  return Object.fromEntries(query)
}

export const createFallback = ({
  url,
  region,
  authType = 'IamAuth',
  credentials, // async () => the broker credentials (IamAuth only)
  send,
  now = Date.now,
}) => {
  const base = new URL(url)
  const signed = authType !== 'ApplicationManaged'
  const signer =
    signed &&
    new SignatureV4({
      service: SERVICE,
      region,
      sha256: Sha256,
      credentials: async () => {
        const current = await credentials()
        return {
          accessKeyId: current.accessKeyId,
          secretAccessKey: current.secretAccessKey,
          sessionToken: current.sessionToken,
        }
      },
    })

  return {
    url: base.origin,
    authType: signed ? 'IamAuth' : 'ApplicationManaged',
    /**
     * Sends one request (`path` with its query, as received) and resolves the deployed code's
     * answer: `{ status, headers, body }`, `body` an async iterable, hop-by-hop headers dropped.
     */
    async forward({ method, path, headers, body }) {
      // The origin is fixed: a path that starts with '//' stays a path.
      const target = new URL(
        `${base.origin}${path.startsWith('/') ? path : `/${path}`}`,
      )
      const incoming = endToEndHeaders(headers)
      const forwarded = Object.fromEntries(
        Object.entries(incoming).filter(
          ([name]) =>
            name !== 'host' &&
            name !== 'content-length' &&
            !PLATFORM_HEADER.test(name) &&
            !(signed && SIGNING_HEADERS.includes(name)),
        ),
      )
      if (!forwarded['x-forwarded-host'] && incoming.host) {
        forwarded['x-forwarded-host'] = incoming.host
      }
      const payload = body ?? Buffer.alloc(0)
      if (payload.length) forwarded['content-length'] = String(payload.length)
      let sendHeaders = { ...forwarded, host: target.host }
      if (signed) {
        const signature = await signer.sign(
          {
            method,
            protocol: 'https:',
            hostname: target.hostname,
            path: target.pathname,
            query: queryOf(target.search),
            headers: {
              host: target.host,
              'x-amz-content-sha256': UNSIGNED_PAYLOAD,
            },
            body: payload,
          },
          { signingDate: new Date(now()) },
        )
        sendHeaders = { ...forwarded, ...signature.headers }
      }
      const response = await send({
        method,
        url: target.href,
        headers: sendHeaders,
        body: payload.length ? payload : undefined,
      })
      return {
        status: response.status,
        headers: endToEndHeaders(response.headers),
        body: response.body,
      }
    },
  }
}
