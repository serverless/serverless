import { ServerlessError } from '@serverless/util'
import { publicBaseUrl } from './packaging.js'

// RFC 9728 fixes the location: the protected resource's path, prefixed by
// `/.well-known/oauth-protected-resource`. `well-known` is a reserved server
// name (`./validate.js`) precisely so nothing can be mounted on top of it.
const DISCOVERY_PATH_PREFIX = '.well-known/oauth-protected-resource'

// Response-header values are VTL string literals, hence the inner quotes.
const CORS_ORIGIN = "'*'"
const CORS_METHODS = "'GET,OPTIONS'"
// `mcp-protocol-version` is sent by every spec-compliant client; `authorization`
// is here because a client that already holds a token replays the request with
// it, and a preflight that omits it fails in the browser before the retry.
const CORS_HEADERS = "'content-type,mcp-protocol-version,authorization'"

// The `Fn::Sub` variable that stands in for the REST API id, so the stage URL
// works whether the API is this service's own or one imported through
// `provider.apiGateway.restApiId` - in which case the `ApiGatewayRestApi`
// resource is never created (`api-gateway/lib/rest-api.js` returns early) and
// referencing it by name would fail the deploy.
const REST_API_ID_VARIABLE = 'RestApiId'

// The `Fn::Sub` variable that stands in for an issuer written as a
// CloudFormation intrinsic. Prefixed so it cannot collide with the one above,
// nor read as a logical id a user would recognize as their own.
const ISSUER_VARIABLE = 'McpOauthIssuer'

const discoveryPathOf = (name) => `${DISCOVERY_PATH_PREFIX}/${name}/mcp`

/**
 * One MOCK route on the discovery path.
 *
 * A MOCK integration has no backend at all: the request template names the
 * status code, and the integration response registered for that code carries
 * the headers and the body. Both halves are pre-normalized the way the
 * api-gateway seam expects a contributed descriptor to be - it runs only
 * `getAuthorizer` over these, never `getIntegration`, `getRequest` or
 * `getResponse` - so the integration is spelled uppercase, the method
 * lowercase, and the status-code entry carries the `pattern` key
 * `getResponse` would otherwise have defaulted in.
 */
const mockRoute = ({ name, method, statusCode, headers, template }) => ({
  functionName: name,
  http: {
    path: discoveryPathOf(name),
    method,
    integration: 'MOCK',
    request: {
      template: { 'application/json': `{"statusCode": ${statusCode}}` },
    },
    response: {
      statusCodes: {
        [statusCode]: {
          pattern: '',
          headers,
          ...(template === undefined
            ? {}
            : { template: { 'application/json': template } }),
        },
      },
    },
  },
})

/**
 * Refuse to publish a document that Velocity would rewrite.
 *
 * API Gateway serves the discovery document as a response template and
 * evaluates it as Velocity on every request: "$" opens a variable reference and
 * "#" opens a directive, so either character silently changes what a client
 * reads, behind a perfectly green deploy.
 *
 * `./validate.js` already rejects both characters in `oauthDiscovery.issuer` and
 * `oauthDiscovery.publicUrl`, which are the two values it owns - for an
 * intrinsic issuer, in the only part of it that is literal (an `Fn::Sub`
 * template's text). The values checked here are the ones it cannot see: a
 * custom domain resolved from `provider.domain`, the stage name, and the server
 * name - none of which is schema-constrained by the time it lands in the
 * document.
 */
const VELOCITY_ACTIVE_CHARACTERS = /[$#]/

const assertVelocitySafe = (value, { server, describe }) => {
  const hazard = value.match(VELOCITY_ACTIVE_CHARACTERS)?.[0]
  if (hazard === undefined) return
  throw new ServerlessError(
    `MCP server "${server}" would publish an OAuth protected-resource document containing ${JSON.stringify(hazard)}, which comes from ${describe}. The discovery document is evaluated as a Velocity template by API Gateway on every request, where "$" opens a variable reference and "#" opens a directive, so the document a client reads would not be the one that was configured. Remove the character from ${describe}.`,
    'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
    { stack: false },
  )
}

// The document's `resource` is the MCP endpoint's own public URL, so the URL is
// appended to whatever base the user is reachable on. `publicUrl` is the one
// base a user writes by hand, so it is the one that can carry a trailing slash.
const stripTrailingSlashes = (url) => url.replace(/\/+$/, '')

/**
 * Where a client reaches each server, and how that was decided:
 * `name -> { source, url }`, the base URL the server's own route is appended to.
 *
 * The one derivation there is. The published discovery document names this URL
 * as its resource, and the deploy/info endpoint summary prints it
 * (`./endpoints.js`) - two answers that must never differ, so they are the same
 * answer.
 *
 * The stage URL is the last resort and the only one that is not knowable at
 * package time: the REST API id is assigned when CloudFormation creates it, so
 * the URL has to be left as an intrinsic for the deploy to render. That is why a
 * `stage` entry carries no `url` - the document builder below renders the
 * intrinsic, and the summary falls back to the deployed stack's `ServiceEndpoint`
 * output, which is that same address with the id filled in (both are built on
 * `getApiGatewayStage()`, so the two agree even when
 * `provider.apiGateway.stage` renames the stage).
 *
 * Every server is resolved, not only the ones publishing discovery: a custom
 * domain is where clients reach a server whether or not it says so in a
 * document, and the summary prints all of them. Deciding a URL is all this
 * does - the Velocity check over these values belongs to the document that
 * embeds them, and lives with the builder that writes it.
 */
export const resolveBaseUrls = ({ servers, provider }) => {
  const domain = publicBaseUrl(provider)
  const baseUrls = new Map()
  for (const server of servers) {
    const publicUrl = server.oauthDiscovery?.publicUrl
    if (publicUrl !== undefined) {
      baseUrls.set(server.name, {
        source: 'override',
        url: stripTrailingSlashes(publicUrl),
      })
      continue
    }
    baseUrls.set(
      server.name,
      domain === undefined
        ? { source: 'stage', url: undefined }
        : { source: 'domain', url: domain },
    )
  }
  return baseUrls
}

// Every value a source contributes to the base URL, checked as the part of the
// document it is about to become - the resolved URL itself for the two sources
// that have one, and the stage name for the source that is rendered from it.
// Each names its own origin, because "remove the character from the custom
// domain" and "remove it from publicUrl" are different instructions to
// different people.
const assertBaseUrlSafe = ({ server, source, url, stage }) => {
  if (source === 'override') {
    assertVelocitySafe(url, {
      server: server.name,
      describe: `"mcp.servers.${server.name}.oauthDiscovery.publicUrl"`,
    })
  }
  if (source === 'domain') {
    assertVelocitySafe(url, {
      server: server.name,
      describe: `the custom domain in front of this service ("provider.domain" / "provider.domains")`,
    })
  }
  if (source === 'stage') {
    assertVelocitySafe(stage, {
      server: server.name,
      describe: `the stage name "${stage}"`,
    })
  }
}

/**
 * The URL the document names as its resource: the server's route under the
 * resolved base URL.
 *
 * For a `stage` entry there is no base URL yet, so the `Fn::Sub` variable
 * standing in for the REST API id is written into the string instead. The
 * substitution happens in CloudFormation, before API Gateway ever sees the
 * template, so the `${...}` here never reaches Velocity.
 */
const resourceUrlOf = ({ server, source, url, stage }) =>
  source === 'stage'
    ? `https://\${${REST_API_ID_VARIABLE}}.execute-api.\${AWS::Region}.\${AWS::URLSuffix}/${stage}/${server.name}/mcp`
    : `${url}/${server.name}/mcp`

// Serialized once, here, so the document is byte-stable across packages: a key
// order that varied would rewrite the method resource on every deploy.
const documentOf = (url, issuer) =>
  JSON.stringify({
    resource: url,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
  })

/**
 * How an issuer becomes text inside the document, and what it needs in the
 * `Fn::Sub` variable map to get there.
 *
 * A literal is its own text. An intrinsic needs the document rendered through
 * `Fn::Sub`, and there the shape matters:
 *
 *  - an `Fn::Sub` issuer is INLINED - its template text becomes part of the
 *    document's own template, and its variables (list form) join the map. A
 *    nested `Fn::Sub` in a variable value would deploy (CloudFormation permits
 *    `Fn::Sub` as a `VarValue`); inlining is a choice, because the outer
 *    substitution resolves `${AWS::Region}` and `${UserPool}` identically, and
 *    one substitution pass over one variable map is a simpler template to read
 *    in the console and to diff between deploys than a nested one.
 *  - every other intrinsic becomes a variable value, which is exactly what a
 *    variable map is for.
 *
 * `${...}` inside the inlined text is CloudFormation's own and is resolved
 * before API Gateway sees the string. `./validate.js` has already refused any
 * OTHER "$" or "#" in it.
 *
 * What is NOT guarded, on either path and by design: the VALUE an intrinsic
 * resolves to. CloudFormation splices it into an already-serialized JSON string
 * at deploy time, so it is neither JSON-escaped by `documentOf` nor seen by the
 * Velocity guard - a resolved value carrying `"` or `\` would break the
 * document's JSON, and one carrying `$` or `#` would be live Velocity. That is
 * the trust boundary this feature is built on: an intrinsic names something in
 * the user's own stack, and only their stack can say what it resolves to.
 */
const issuerRenderingOf = (issuer) => {
  if (typeof issuer === 'string') return { text: issuer, variables: {} }

  const sub = issuer['Fn::Sub']
  if (typeof sub === 'string') return { text: sub, variables: {} }
  if (Array.isArray(sub) && typeof sub[0] === 'string') {
    const [template, variables] = sub
    return {
      text: template,
      variables:
        variables !== null && typeof variables === 'object' ? variables : {},
    }
  }
  return {
    text: `\${${ISSUER_VARIABLE}}`,
    variables: { [ISSUER_VARIABLE]: issuer },
  }
}

/**
 * The OAuth protected-resource metadata routes, for every server publishing it.
 *
 * The document is static, so it is served by API Gateway itself rather than by
 * the server's function: no invocation, no cold start, and - the reason it
 * matters - no authorizer, since a client that cannot yet get a token has to be
 * able to read where to get one.
 *
 * `provider` is the service's `provider` block (for the custom domain); `stage`
 * is the stage the REST API is deployed to, i.e. `provider.getApiGatewayStage()`
 * rather than the config stage, since `provider.apiGateway.stage` renames one
 * without the other; `restApiId` is what the api-gateway compiler resolves the
 * REST API to, i.e. `provider.getApiGatewayRestApiId()` - either
 * `{ Ref: 'ApiGatewayRestApi' }` or an imported id.
 *
 * Returns the descriptors alongside the `resolveBaseUrls` entries of the servers
 * it published a document for - `name -> { source, url }` - which the caller
 * reports on.
 */
export const buildDiscoveryDescriptors = ({
  servers,
  provider,
  stage,
  restApiId,
}) => {
  // Internal seam, not user config: every caller has both of these to hand, and
  // a missing one would silently produce a document pointing at "undefined".
  if (stage === undefined || restApiId === undefined) {
    throw new Error(
      'buildDiscoveryDescriptors requires both "stage" and "restApiId": pass the API Gateway stage (provider.getApiGatewayStage()) and the resolved REST API id (provider.getApiGatewayRestApiId()).',
    )
  }

  const baseUrls = resolveBaseUrls({ servers, provider })
  const descriptors = []
  const sources = new Map()

  for (const server of servers) {
    if (!server.oauthDiscovery) continue

    // Neither is schema-enforced by the time it reaches here: under the default
    // configValidationMode a server name that breaks the key pattern only warns,
    // and the issuer's own guard lives in a different module.
    assertVelocitySafe(server.name, {
      server: server.name,
      describe: 'the server name',
    })
    const { issuer } = server.oauthDiscovery
    // An intrinsic issuer was guarded at validation, on the only part of it
    // that is visible before CloudFormation resolves it.
    if (typeof issuer === 'string') {
      assertVelocitySafe(issuer, {
        server: server.name,
        describe: `"mcp.servers.${server.name}.oauthDiscovery.issuer"`,
      })
    }

    const { source, url } = baseUrls.get(server.name)
    assertBaseUrlSafe({ server, source, url, stage })
    sources.set(server.name, { source, url })

    const issuerRendering = issuerRenderingOf(issuer)
    const document = documentOf(
      resourceUrlOf({ server, source, url, stage }),
      issuerRendering.text,
    )

    // Two sources of "${...}" the Framework writes itself: the stage URL, whose
    // REST API id is not known until CloudFormation creates it, and an
    // intrinsic issuer. Either one makes the document an `Fn::Sub`, and makes
    // the whole-document Velocity belt unrunnable - so its parts were each
    // checked above instead.
    // Rejected whatever the base URL resolves to today, so that adding or
    // removing a custom domain can never turn a working document into one whose
    // REST API id was quietly redefined by the issuer.
    if (Object.hasOwn(issuerRendering.variables, REST_API_ID_VARIABLE)) {
      throw new ServerlessError(
        `MCP server "${server.name}" sets "oauthDiscovery.issuer" to an "Fn::Sub" declaring a variable named "${REST_API_ID_VARIABLE}", which is the name the discovery document itself uses for this service's REST API id. Rename the variable in "mcp.servers.${server.name}.oauthDiscovery.issuer".`,
        'MCP_OAUTH_DISCOVERY_ISSUER_VARIABLE_COLLISION',
        { stack: false },
      )
    }
    const variables = {
      ...(source === 'stage' ? { [REST_API_ID_VARIABLE]: restApiId } : {}),
      ...issuerRendering.variables,
    }
    const intrinsic = source === 'stage' || typeof issuer !== 'string'
    if (!intrinsic) {
      assertVelocitySafe(document, {
        server: server.name,
        describe: "this server's discovery configuration",
      })
    }

    descriptors.push(
      mockRoute({
        name: server.name,
        method: 'get',
        statusCode: 200,
        headers: {
          'Content-Type': "'application/json'",
          'Access-Control-Allow-Origin': CORS_ORIGIN,
        },
        template: intrinsic
          ? {
              'Fn::Sub':
                Object.keys(variables).length === 0
                  ? document
                  : [document, variables],
            }
          : document,
      }),
      // Hand-built rather than derived from a `cors` block: the seam collects
      // preflight config only from function-declared events, so a contributed
      // route's `cors` would set response headers and never emit the OPTIONS
      // method that makes them reachable.
      mockRoute({
        name: server.name,
        method: 'options',
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': CORS_ORIGIN,
          'Access-Control-Allow-Methods': CORS_METHODS,
          'Access-Control-Allow-Headers': CORS_HEADERS,
        },
      }),
    )
  }

  return { descriptors, sources }
}
