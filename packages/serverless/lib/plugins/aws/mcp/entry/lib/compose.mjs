// Runs inside the user's Lambda: no framework imports, plain Errors.
// Every composition decision the entry makes, kept out of `../index.mjs` so it
// can be exercised without the top-level await of a cold start.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import {
  OAuthError,
  OAuthErrorCode,
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
} from '@modelcontextprotocol/server'
import { metadataSegment, protectedResourceMetadata } from './discovery.mjs'

/**
 * The configured audiences, as the plugin wrote them: a JSON array
 * (`../../lib/synthesize-functions.js`).
 *
 * JSON is what makes the encoding lossless - an audience is an opaque string
 * the issuer decides, and one carrying a comma would come back as two audiences
 * from a delimited list, accepting tokens for values nobody configured.
 *
 * A value that is not JSON is not this entry's to interpret (an artifact
 * deployed by an older release, a hand-edited function configuration), and it
 * is read as ONE audience rather than split: a single audience can only reject
 * more than intended, while splitting could accept something unconfigured.
 */
const parseAudiences = (raw) => {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return [raw.trim()]
  }
  if (Array.isArray(parsed)) {
    return parsed.filter((value) => typeof value === 'string' && value !== '')
  }
  return typeof parsed === 'string' && parsed !== '' ? [parsed] : [raw.trim()]
}

/**
 * The entry's whole environment contract, read in one place.
 *
 * The presence of an issuer is what "auth is configured" means — the plugin
 * writes SERVERLESS_MCP_AUTH_ISSUER only for a server with an `auth` block
 * (`../../lib/synthesize-functions.js`). Audiences are not validated here:
 * `createTokenVerifier` already fails at cold start with a message naming
 * SERVERLESS_MCP_AUTH_AUDIENCES, and duplicating that check would let the two
 * messages drift.
 */
export const readEntryEnv = (env) => {
  const serverModulePath = env.SERVERLESS_MCP_SERVER_MODULE
  if (typeof serverModulePath !== 'string' || serverModulePath === '') {
    throw new Error(
      'The MCP entry needs SERVERLESS_MCP_SERVER_MODULE — the path of the module that default-exports the MCP handler — and the variable is not set in this function\'s environment. It is set by Serverless Framework from the "server:" property of the mcp server, so an unset value means this function was not deployed as an MCP server.',
    )
  }
  const issuer = env.SERVERLESS_MCP_AUTH_ISSUER
  const publicBaseUrl = env.SERVERLESS_MCP_PUBLIC_BASE_URL
  return {
    serverModulePath,
    // Set only when the deployment knows a public URL the request itself
    // cannot reveal — see `clientFacingLocation`.
    publicBaseUrl:
      typeof publicBaseUrl === 'string' && publicBaseUrl !== ''
        ? publicBaseUrl
        : undefined,
    auth:
      typeof issuer === 'string' && issuer !== ''
        ? {
            issuer,
            audiences: parseAudiences(env.SERVERLESS_MCP_AUTH_AUDIENCES),
          }
        : undefined,
    stateKeyRef: env.SERVERLESS_MCP_STATE_KEY_REF,
    region: env.AWS_REGION,
    taskRoot: env.LAMBDA_TASK_ROOT,
  }
}

// SERVERLESS_MCP_SERVER_MODULE is authoritative: packaging rewrites it to the
// path the artifact actually contains — the emitted file in esbuild mode, the
// configured `server:` path in classic mode (`../../lib/packaging.js`). The
// probe below is legacy defense behind that value, for an artifact packaged
// before the rewrite existed, and its first candidate is the configured path
// itself, so it agrees with the rewrite in both modes.
//
// What ships in the artifact is whatever the bundler emitted, while an
// un-rewritten SERVERLESS_MCP_SERVER_MODULE holds the configured `server:` path
// — the source file, whose extension may be one that never reaches the package.
// The candidate order mirrors that: the configured path first (classic packaging
// ships it verbatim), then the JavaScript extensions a bundler emits in its
// place.
const RUNTIME_EXTENSIONS = ['.mjs', '.js', '.cjs']

// A configured path with one of these extensions is skipped even when the file
// is right there in the artifact — `package.patterns` can ship the sources next
// to the build output, and `import()` of one of them is never what the user
// meant: node20 rejects the extension with ERR_UNKNOWN_FILE_EXTENSION, and
// node22+ type-strips it and then imports unbundled source, whose bare imports
// the artifact has no node_modules to answer. Either way the built sibling is
// the only loadable file, so it must win.
const SOURCE_ONLY_EXTENSION = /\.(ts|mts|cts|tsx|jsx)$/
const ANY_SOURCE_EXTENSION = /\.(mjs|cjs|js|jsx|ts|mts|cts|tsx)$/

const moduleCandidates = (modulePath) => {
  const withoutExtension = modulePath.replace(ANY_SOURCE_EXTENSION, '')
  return [
    ...(SOURCE_ONLY_EXTENSION.test(modulePath) ? [] : [modulePath]),
    ...RUNTIME_EXTENSIONS.map((extension) => `${withoutExtension}${extension}`),
  ]
}

/**
 * Absolute path of the user's server module inside the deployed artifact.
 *
 * `taskRoot` is Lambda's own LAMBDA_TASK_ROOT (`/var/task`), with the working
 * directory as the fallback for hosts that do not set it. `exists` is injected
 * so the probe is testable without a filesystem.
 */
export const resolveServerModulePath = ({
  modulePath,
  taskRoot,
  exists = existsSync,
}) => {
  const root = taskRoot ?? process.cwd()
  const candidates = [
    ...new Set(
      moduleCandidates(modulePath).map((candidate) =>
        path.resolve(root, candidate),
      ),
    ),
  ]
  const found = candidates.find((candidate) => exists(candidate))
  if (found === undefined) {
    throw new Error(
      `The MCP server module "${modulePath}" is not in the deployed package: none of ${candidates.join(
        ', ',
      )} exists. Check the "server:" path of this mcp server, and that the file is not excluded from packaging.`,
    )
  }
  return found
}

const headerValue = (headers, name) => {
  if (headers === null || typeof headers !== 'object') return undefined
  const lowered = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowered) continue
    return Array.isArray(value) ? value[0] : value
  }
  return undefined
}

// Only `http` and `https` are accepted, and X-Forwarded-Host is deliberately
// never read: API Gateway resolves the API from the Host header, so `Host` (and
// `requestContext.domainName`) cannot be forged past routing, while
// X-Forwarded-Host is free-form client input that would let a caller move the
// advertised metadata URL onto a domain of their choosing.
const forwardedScheme = (event) => {
  const proto = headerValue(event?.headers, 'x-forwarded-proto')
  return proto === 'http' || proto === 'https' ? proto : undefined
}

/**
 * The client-facing view of the request, which the Hono aws-lambda adapter's
 * own URL is not: that URL hardcodes `https` and, on a REST API, derives the
 * path from `event.path` — the stage-less resource path (verified in
 * `hono/dist/adapter/aws-lambda/handler.js`, `EventV1Processor.getPath`).
 *
 * `requestContext.path` is the same path with the stage — or, behind a custom
 * domain, with the base-path mapping — still on the front, so the difference
 * between the two is exactly the prefix the app is mounted under. Everything
 * downstream (the metadata document's `resource`, the `resource_metadata` URL
 * of the 401 challenge) is built from this and must include that prefix, since
 * that is what the client used and what API Gateway routes.
 *
 * The query string is taken from the adapter's URL, which already reassembled
 * it from the event.
 *
 * `publicBaseUrl` (SERVERLESS_MCP_PUBLIC_BASE_URL, written by the plugin from
 * the deployment's own domain configuration) short-circuits all of that,
 * because the base-path mapping of a REST custom domain is the one prefix the
 * subtraction may not be able to recover: the mapping is stripped before the
 * function is invoked, so it is absent from `event.path` and may be absent from
 * `requestContext.path` as well (unverified against a live custom domain). The
 * override is authoritative wherever it is set; the subtraction below is
 * best-effort. The value is the absolute public origin plus that prefix and no
 * trailing slash (`https://api.acme.com/assistant`, or `https://mcp.acme.com`
 * when the app is mounted at the root); everything the request says about host,
 * scheme and prefix is then ignored in its favour.
 */
export const clientFacingLocation = ({ event, requestUrl, publicBaseUrl }) => {
  const adapterUrl = new URL(requestUrl)
  if (publicBaseUrl !== undefined) {
    let base
    try {
      base = new URL(publicBaseUrl)
      // An `http:`/`https:` origin is the only thing that can be advertised as
      // an MCP resource identifier, and `new URL` accepts far more than that —
      // `mailto:`, `data:`, or a stray `api.acme.com/assistant` parsed as a
      // scheme. Rejecting the rest here means the same message covers it.
      if (base.protocol !== 'http:' && base.protocol !== 'https:') {
        throw new Error(`the scheme is "${base.protocol}"`)
      }
    } catch (error) {
      throw new Error(
        `SERVERLESS_MCP_PUBLIC_BASE_URL must be an absolute http or https URL — the public origin of this server plus any base-path prefix, such as "https://api.acme.com/assistant" — and is "${publicBaseUrl}".`,
        { cause: error },
      )
    }
    const appPath = event?.path ?? event?.rawPath ?? adapterUrl.pathname
    const origin = `${base.protocol}//${base.host}`
    // A trailing slash would double up against the leading slash of appPath.
    const mountPrefix = base.pathname.replace(/\/+$/, '')
    return {
      origin,
      mountPrefix,
      appPath,
      requestUrl: `${origin}${mountPrefix}${appPath}${adapterUrl.search}`,
    }
  }
  const apiGatewayDomain = event?.requestContext?.domainName
  const host =
    apiGatewayDomain ?? headerValue(event?.headers, 'host') ?? adapterUrl.host
  // API Gateway serves HTTPS only — there is no http listener to reach a REST
  // API, an HTTP API or a function URL through — so a request it delivered is
  // https no matter what X-Forwarded-Proto says. The forwarded header is only
  // consulted off API Gateway (a local emulator, a proxy in front of a plain
  // server), where it is the sole source of the scheme.
  const scheme = apiGatewayDomain
    ? 'https'
    : (forwardedScheme(event) ?? adapterUrl.protocol.replace(/:$/, ''))
  const appPath = event?.path ?? event?.rawPath ?? adapterUrl.pathname
  const mountedPath = event?.requestContext?.path ?? event?.rawPath ?? appPath
  // The root-resource case, `appPath === '/'`, is the one shape this subtraction
  // cannot recover: API Gateway reports the mounted path without a trailing
  // slash (`/dev`), so the suffix does not match and the prefix comes out empty,
  // dropping the stage from every advertised URL. It is unreachable through the
  // Framework's own routes — `../../lib/route-descriptors.js` mounts each server
  // at `/<name>/mcp`, so the app-relative path always carries two segments — and
  // is left alone rather than guessed at.
  const mountPrefix = mountedPath.endsWith(appPath)
    ? mountedPath.slice(0, mountedPath.length - appPath.length)
    : ''
  const origin = `${scheme}://${host}`
  return {
    origin,
    mountPrefix,
    appPath,
    requestUrl: `${origin}${mountPrefix}${appPath}${adapterUrl.search}`,
  }
}

/**
 * The RFC 9728 metadata URL to advertise for this request.
 *
 * The SDK owns the insertion rule (`/.well-known/oauth-protected-resource`
 * ahead of the resource path), but applies it at the origin root — which on a
 * staged REST API is a path nothing routes to. Applying it to the app-relative
 * path and putting the mount prefix back in front yields the route the
 * Framework actually registered (`../../lib/route-descriptors.js`).
 */
export const protectedResourceMetadataUrl = ({
  origin,
  mountPrefix,
  appPath,
}) => {
  const wellKnown = new URL(
    getOAuthProtectedResourceMetadataUrl(new URL(`${origin}${appPath}`)),
  )
  return `${origin}${mountPrefix}${wellKnown.pathname}`
}

/**
 * The unauthenticated discovery route: a read of the metadata document.
 *
 * The segment is `./discovery.mjs`'s own — this predicate decides which requests
 * reach that module, and it throws on a URL carrying no such segment, so the two
 * cannot be allowed to drift. GET is the only method: the Framework registers
 * the metadata route as GET (`../../lib/route-descriptors.js`), so nothing else
 * is routed to the function on that path.
 */
export const isMetadataRequest = ({ method, path: requestPath }) =>
  method === 'GET' && metadataSegment.test(requestPath)

/**
 * Our verifier as the SDK's `OAuthTokenVerifier`.
 *
 * The rethrow is not cosmetic: `bearerAuthChallengeResponse` maps anything that
 * is not an `OAuthError` to `500 server_error`, so a plain `Error` from the
 * verifier — which is all `./auth.mjs` throws, by design — would answer 500 and
 * the spec's `401` + `WWW-Authenticate` discovery flow would never fire. The
 * verifier's message is carried into `error_description` because that is what
 * MCP clients show the user, and it is the whole point of those messages.
 */
export const asOAuthTokenVerifier = (verify) => ({
  verifyAccessToken: async (token) => {
    try {
      return await verify(token)
    } catch (error) {
      if (OAuthError.isInstance(error)) throw error
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        challengeSafe(error?.message) ??
          'The access token could not be verified.',
      )
    }
  },
})

// `error_description` is emitted inside a WWW-Authenticate quoted-string, and
// RFC 9110 quoted-string escaping is not honored by every client parser: an
// embedded double quote ends the parameter early, so a message could truncate
// the description or graft extra auth-params onto the challenge.
//
// Dropping the quotes does NOT on its own close that vector. RFC 9110 spells an
// auth-param value as `token / quoted-string`, so a parser taking the unquoted
// alternative reads the value as a token up to the next whitespace and then
// looks for `,` and further `name=value` pairs — under which a quote-free
// message with an `=` in it still introduces a parameter that was never sent.
// `=` is therefore dropped alongside the quotes: with no `=` in the text there
// is no `name=value` for either parser to find, and the two together leave
// nothing that can extend the challenge.
//
// Both are dropped rather than escaped, and the length is capped, because these
// messages are written by `./auth.mjs` to be read by a human — nothing
// downstream parses them.
const CHALLENGE_MESSAGE_LIMIT = 256

const challengeSafe = (message) =>
  typeof message === 'string'
    ? message.replace(/["=]/g, '').slice(0, CHALLENGE_MESSAGE_LIMIT)
    : undefined

// `createMcpHonoApp` logs, at construction time and only for the `0.0.0.0`
// host:
//
//   "Warning: Server is binding to 0.0.0.0 without DNS rebinding protection.
//    Consider using the allowedHosts option to restrict allowed hosts, or use
//    authentication to protect your server."
//
// Every cold start would print it, and both of its remedies are already met or
// inapplicable here: the warning fires even when bearer auth *is* configured
// (the SDK never looks), and `allowedHosts` guards against a browser resolving
// a hostname to a locally bound server — a threat that does not exist behind
// API Gateway, which resolves the API from the Host header before the function
// is invoked. `'0.0.0.0'` is the SDK's own documented way to disarm the
// localhost guard for a non-localhost deployment, so this is the supported
// configuration being warned about, not a misuse of it. The swap is scoped to
// the single factory call and restored unconditionally, so nothing else in the
// user's function loses its warnings.
const withoutHostGuardWarning = (build) => {
  const warn = console.warn
  console.warn = () => {}
  try {
    return build()
  } finally {
    console.warn = warn
  }
}

/**
 * The HTTP surface: one MCP server per function, so a single catch-all route.
 *
 * `createMcpHonoApp` is used for its JSON body middleware (the parsed body is
 * handed to the transport so it is not read twice) and `host: '0.0.0.0'` is the
 * documented way to disarm its localhost DNS-rebinding guard, which would
 * reject every request in the cloud. API Gateway resolves the API from the Host
 * header before the function is ever invoked, so that guard has nothing to add
 * here.
 */
export const buildApp = ({ mcpHandler, verifier, issuer, publicBaseUrl }) => {
  const app = withoutHostGuardWarning(() =>
    createMcpHonoApp({ host: '0.0.0.0' }),
  )
  app.all('*', async (c) => {
    const requestOptions = { parsedBody: c.get('parsedBody') }
    // With no auth configured there is no metadata document to serve and no
    // token to check, so nothing stands between the request and the handler.
    if (!verifier) return mcpHandler.fetch(c.req.raw, requestOptions)

    const location = clientFacingLocation({
      event: c.env?.event,
      requestUrl: c.req.url,
      publicBaseUrl,
    })
    if (isMetadataRequest({ method: c.req.method, path: location.appPath })) {
      const { status, headers, body } = protectedResourceMetadata({
        requestUrl: location.requestUrl,
        issuer,
      })
      return c.json(body, status, headers)
    }
    // The gate is built per request because the challenge it emits names this
    // request's metadata URL, which depends on the host and mount prefix.
    const gate = requireBearerAuth({
      verifier,
      resourceMetadataUrl: protectedResourceMetadataUrl(location),
    })
    const authInfo = await gate(c.req.raw)
    if (authInfo instanceof Response) return authInfo
    return mcpHandler.fetch(c.req.raw, { ...requestOptions, authInfo })
  })
  return app
}
