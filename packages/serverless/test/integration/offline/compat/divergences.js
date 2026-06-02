// Structured allowlist of every recorded behavior difference between OUR
// built-in `sls offline` and the community `serverless-offline` plugin, drawn
// from the divergences discovered while authoring the integration suite. The
// differential drift-detector (`differential.js`) uses `isAllowed` to filter
// out these expected diffs so only NEW, unexpected divergences fail the run.
//
// Each entry:
//   surface  — the emulated surface ('rest' | 'http-api' | 'alb' | 'websocket'
//              | 'authorizers' | 'invoke' | 'schedule' | 'runtimes' | 'layers'
//              | 'config').
//   field    — a dotted path into the diffed response/event (or a config key)
//              that names what differs. The differential runner matches on the
//              {surface, field} pair.
//   category — 'A' scope cut (we intentionally don't support it) ·
//              'B' AWS-fidelity win (we match AWS, the plugin doesn't) ·
//              'C' plugin bug (the plugin crashes/errors; we behave correctly).
//   plugin   — what the community plugin does.
//   ours     — what OUR offline does.
//   reason   — the AWS basis (or scope rationale).

/**
 * @typedef {object} Divergence
 * @property {string} surface
 * @property {string} field
 * @property {'A'|'B'|'C'} category
 * @property {string} plugin
 * @property {string} ours
 * @property {string} reason
 */

/** @type {Divergence[]} */
export const DIVERGENCES = [
  // --- REST API v1 (G2) ---
  {
    surface: 'rest',
    field: 'requestContext.path',
    category: 'B',
    plugin: 'omits the stage (/items/42)',
    ours: 'includes the stage (/dev/items/42)',
    reason: 'AWS $context.path includes the stage',
  },
  {
    surface: 'rest',
    field: 'requestContext.resourcePath',
    category: 'B',
    plugin: 'includes the stage (/dev/items/{id})',
    ours: 'stage-less (/items/{id})',
    reason: 'AWS $context.resourcePath is stage-less',
  },
  {
    surface: 'rest',
    field: 'headers.access-control-allow-origin',
    category: 'B',
    plugin: 'echoes the request Origin and always sets Allow-Credentials',
    ours: 'returns Access-Control-Allow-Origin: * with no credentials',
    reason: 'matches the AWS REST cors:true default (wildcard origin)',
  },
  {
    surface: 'rest',
    field: 'headers.access-control-allow-credentials',
    category: 'B',
    plugin: 'always sets Allow-Credentials on a cors:true preflight',
    ours: 'omits Allow-Credentials for cors:true',
    reason: 'AWS cors:true does not enable credentials',
  },
  {
    surface: 'rest',
    field: 'headers.access-control-allow-methods',
    category: 'B',
    plugin: 'lists only the route method (GET)',
    ours: 'lists the route method plus OPTIONS (GET,OPTIONS)',
    reason:
      'AWS includes OPTIONS in the preflight Access-Control-Allow-Methods',
  },
  {
    surface: 'rest',
    field: 'headers.access-control-allow-headers',
    category: 'B',
    plugin: 'echoes the request Access-Control-Request-Headers (lowercased)',
    ours: 'returns the AWS default cors:true allow-list',
    reason: 'matches the AWS REST cors:true default Allow-Headers set',
  },
  {
    surface: 'rest',
    field: 'headers.content-type',
    category: 'B',
    plugin: 'omits a content-type on the preflight response',
    ours: 'sets a content-type on the small preflight body',
    reason:
      'cosmetic preflight-body transport detail; the preflight succeeds on both',
  },
  {
    surface: 'rest',
    field: 'requestContext.resourceId',
    category: 'B',
    plugin: 'synthesizes the placeholder offlineContext_resourceId',
    ours: 'synthesizes the placeholder "offline"',
    reason: 'cosmetic; neither side has a real API Gateway resource id offline',
  },
  {
    surface: 'rest',
    field: 'response.template',
    category: 'B',
    plugin: 'returned the raw handler result (no template applied)',
    ours: 'applies the integration response template',
    reason: 'AWS applies integration response templates on lambda integrations',
  },
  {
    surface: 'rest',
    field: 'statusCodes',
    category: 'B',
    plugin: 'returned 502 with the raw error',
    ours: 'selects the mapped status (404) via the selectionPattern',
    reason: 'AWS integration-response status-code selection',
  },

  // --- HTTP API v2 (G1) ---
  {
    surface: 'http-api',
    field: 'cookies',
    category: 'B',
    plugin: 'always emits cookies: []',
    ours: 'omits the cookies field when the request carries no Cookie header',
    reason: 'AWS omits cookies from the v2 event when there are none',
  },

  // --- ALB (G2) ---
  {
    surface: 'alb',
    field: 'urlStagePrefix',
    category: 'B',
    plugin: 'serves ALB targets at /<stage>/<path> (prepends the stage)',
    ours: 'serves the stage-less <path> and emits a stage-less event.path',
    reason:
      'ALB has no stages; a real ALB routes the literal path with no stage segment',
  },
  {
    surface: 'alb',
    field: 'multiValueHeaders',
    category: 'B',
    plugin: 'emits BOTH single- and multi-value maps regardless of config',
    ours: 'emits exactly one variant per the multiValueHeaders flag',
    reason:
      'ALB emits one variant governed by lambda.multi_value_headers.enabled',
  },
  {
    surface: 'alb',
    field: 'multiValueQueryStringParameters',
    category: 'B',
    plugin: 'emits BOTH single- and multi-value maps regardless of config',
    ours: 'emits exactly one variant per the multiValueHeaders flag',
    reason:
      'ALB emits one variant governed by lambda.multi_value_headers.enabled',
  },
  {
    surface: 'alb',
    field: 'headers.x-forwarded-for',
    category: 'B',
    plugin: 'omits the forwarding headers',
    ours: 'synthesizes x-forwarded-for',
    reason: 'a real ALB injects x-forwarded-* before reaching the target',
  },
  {
    surface: 'alb',
    field: 'headers.x-forwarded-proto',
    category: 'B',
    plugin: 'omits the forwarding headers',
    ours: 'synthesizes x-forwarded-proto',
    reason: 'a real ALB injects x-forwarded-* before reaching the target',
  },
  {
    surface: 'alb',
    field: 'headers.x-forwarded-port',
    category: 'B',
    plugin: 'omits the forwarding headers',
    ours: 'synthesizes x-forwarded-port',
    reason: 'a real ALB injects x-forwarded-* before reaching the target',
  },
  {
    surface: 'alb',
    field: 'headers.x-amzn-trace-id',
    category: 'B',
    plugin: 'omits the trace header',
    ours: 'synthesizes x-amzn-trace-id (Root=1-...)',
    reason: 'a real ALB injects x-amzn-trace-id before reaching the target',
  },
  {
    surface: 'alb',
    field: 'body',
    category: 'B',
    plugin: 'omits the body field on a bodyless GET',
    ours: 'sets body: ""',
    reason: 'ALB always includes a body field (empty string when bodyless)',
  },
  {
    surface: 'alb',
    field: 'response.headers',
    category: 'C',
    plugin:
      'CRASHES marshalling a response headers object (TypeError: type.trim is not a function)',
    ours: 'marshals the response headers correctly',
    reason: 'plugin bug; ours follows the ALB response contract',
  },

  // --- WebSocket (G3) ---
  {
    surface: 'websocket',
    field: 'requestContext.domainName',
    category: 'B',
    plugin: 'hardcodes "localhost" (no port)',
    ours: 'reports the real localhost:<appPort>',
    reason:
      'AWS sets domainName to the routable host so handlers can compose the @connections endpoint',
  },
  {
    surface: 'websocket',
    field: 'requestContext.stage',
    category: 'B',
    plugin: 'hardcodes "local"',
    ours: 'reports the real configured stage (dev)',
    reason:
      'AWS reports the deployed stage; the @connections route lives under /<stage>/',
  },
  {
    surface: 'websocket',
    field: 'connectionsRoute',
    category: 'B',
    plugin:
      'mounts POST /@connections/{id} on a separate websocketPort with no /<stage>/ prefix',
    ours: 'mounts /<stage>/@connections/{id} on the shared appPort',
    reason:
      'matches the domainName + "/" + stage URL the AWS SDK management client builds',
  },
  {
    surface: 'websocket',
    field: 'connectionsFanOut',
    category: 'B',
    plugin:
      'a broadcast to the AWS-standard @connections endpoint does NOT reach other clients',
    ours: 'the pushed message is received end-to-end',
    reason:
      'plugin domainName/stage/route-path do not compose into the endpoint it serves',
  },
  {
    surface: 'websocket',
    field: 'requestContext.messageId',
    category: 'B',
    plugin: 'sets messageId on $connect AND $disconnect events',
    ours: 'sets messageId only on MESSAGE events',
    reason: 'AWS populates messageId only for MESSAGE (route) events',
  },
  {
    surface: 'websocket',
    field: 'requestContext.disconnectStatusCode',
    category: 'B',
    plugin:
      'omits disconnectStatusCode (synthesizes placeholder disconnect headers)',
    ours: 'sets disconnectStatusCode (e.g. 1000) from the WS close frame',
    reason: 'AWS reports the close code on $disconnect',
  },
  {
    surface: 'websocket',
    field: 'requestContext.disconnectReason',
    category: 'B',
    plugin: 'omits disconnectReason',
    ours: 'sets disconnectReason (e.g. "bye") from the WS close frame',
    reason: 'AWS reports the close reason on $disconnect',
  },

  // --- Authorizers (G4) ---
  // The REST authorizer fixture is API Gateway REST v1, so it carries the same
  // REST path/resourcePath/resourceId divergences as the rest surface.
  {
    surface: 'authorizers',
    field: 'requestContext.path',
    category: 'B',
    plugin: 'omits the stage (/iam)',
    ours: 'includes the stage (/dev/iam)',
    reason: 'AWS $context.path includes the stage',
  },
  {
    surface: 'authorizers',
    field: 'requestContext.resourcePath',
    category: 'B',
    plugin: 'includes the stage (/dev/iam)',
    ours: 'stage-less (/iam)',
    reason: 'AWS $context.resourcePath is stage-less',
  },
  {
    surface: 'authorizers',
    field: 'requestContext.resourceId',
    category: 'B',
    plugin: 'synthesizes the placeholder offlineContext_resourceId',
    ours: 'synthesizes the placeholder "offline"',
    reason: 'cosmetic; neither side has a real API Gateway resource id offline',
  },
  {
    surface: 'authorizers',
    field: 'body',
    category: 'B',
    plugin: 'returns a Hapi/Boom envelope ({ statusCode, error, message })',
    ours: 'returns the AWS-shaped flat envelope ({ message: "Unauthorized" | "Forbidden" })',
    reason:
      'AWS rejection bodies are a flat { message } object, not a nested Boom envelope',
  },
  {
    surface: 'authorizers',
    field: 'headers.x-amzn-errortype',
    category: 'B',
    plugin: 'omits the x-amzn-ErrorType header on rejection',
    ours: 'sets x-amzn-ErrorType: UnauthorizedException / ForbiddenException',
    reason: 'AWS sets the x-amzn-ErrorType header on gateway rejections',
  },
  {
    surface: 'authorizers',
    field: 'requestContext.authorizer',
    category: 'B',
    plugin:
      'injects a placeholder authorizer on an aws_iam route (principalId: offlineContext_authorizer_principalId)',
    ours: 'omits the authorizer block entirely on an aws_iam route',
    reason: 'AWS attaches no Lambda-authorizer context to an aws_iam route',
  },
  {
    surface: 'authorizers',
    field: 'requestContext.authorizer.lambda',
    category: 'B',
    plugin: 'emits an empty lambda: {} sibling next to jwt (and vice-versa)',
    ours: 'emits only the block that applies for the route authorizer type',
    reason:
      'AWS populates exactly one of jwt / lambda — never an empty sibling',
  },
  {
    surface: 'authorizers',
    field: 'requestContext.authorizer.jwt',
    category: 'B',
    plugin: 'emits an empty jwt: {} sibling next to lambda (and vice-versa)',
    ours: 'emits only the block that applies for the route authorizer type',
    reason:
      'AWS populates exactly one of jwt / lambda — never an empty sibling',
  },
  {
    surface: 'authorizers',
    field: 'simpleResponseUnauthorizedStatus',
    category: 'B',
    plugin:
      'returns 403 for the Unauthorized literal under enableSimpleResponses',
    ours: 'returns 401 for the Unauthorized literal',
    reason:
      'the Unauthorized literal is the AWS sentinel for a 401 denial across authorizer types',
  },
  {
    surface: 'authorizers',
    field: 'customAuthenticationProvider.configLocation',
    category: 'A',
    plugin: 'reads custom.offline.customAuthenticationProvider',
    ours: 'reads the top-level offline.customAuthenticationProvider block (sf-core canonical)',
    reason:
      'config-surface difference; a migrating fixture moves the key up one level',
  },
  {
    surface: 'authorizers',
    field: 'customAuthenticationProvider.scope',
    category: 'A',
    plugin: 'applies the provider globally as the default auth on every route',
    ours: 'applies it only to routes that reference its returned name via authorizer: { name }',
    reason:
      'scope cut — no global default-auth wiring; the route must opt in by name',
  },
  {
    surface: 'authorizers',
    field: 'customAuthenticationProvider.credentialsKey',
    category: 'A',
    plugin:
      'surfaces credentials.context at requestContext.authorizer.lambda.<key>',
    ours: 'surfaces credentials.authorizer verbatim (provider returns { authorizer: { lambda } })',
    reason:
      'provider authoring contract differs; net handler-visible surface is the same',
  },

  // --- Schedule (G5) ---
  {
    surface: 'schedule',
    field: 'account',
    category: 'B',
    plugin: 'sets account to a random UUID',
    ours: 'sets account to a synthesized account-style value (no real account offline)',
    reason: 'AWS sets account to the 12-digit AWS account ID; cosmetic offline',
  },
  {
    surface: 'schedule',
    field: 'resources',
    category: 'A',
    plugin: 'emits resources: []',
    ours: 'emits resources: [] (no synthesized rule ARN offline)',
    reason: 'AWS emits the EventBridge rule ARN; not synthesized offline',
  },

  // --- Lambda invoke (G5) ---
  {
    surface: 'invoke',
    field: 'headers.x-amz-executed-version',
    category: 'B',
    plugin:
      'omits the X-Amz-Executed-Version header on a successful sync invoke',
    ours: 'sets X-Amz-Executed-Version: $LATEST',
    reason: 'AWS returns X-Amz-Executed-Version on a successful sync invoke',
  },
  {
    surface: 'invoke',
    field: 'dryRunStatus',
    category: 'B',
    plugin: 'rejects DryRun with a 400 InvalidParameterValueException',
    ours: 'returns 204 with no body',
    reason: 'AWS validates a DryRun invoke and returns 204',
  },

  // --- Runtimes (G6) ---
  {
    surface: 'runtimes',
    field: 'pythonInterpreterVersion',
    category: 'A',
    plugin: 'host child-process runner uses whatever python3 is on PATH',
    ours: 'host child-process runner uses whatever python3 is on PATH',
    reason:
      'host-runner scope: faithful host execution, not a version-managed sandbox',
  },
  {
    surface: 'runtimes',
    field: 'rubyInterpreterVersion',
    category: 'A',
    plugin: 'host child-process runner uses whatever ruby is on PATH',
    ours: 'host child-process runner uses whatever ruby is on PATH',
    reason:
      'host-runner scope: faithful host execution, not a version-managed sandbox',
  },

  // --- Layers (G6) ---
  {
    surface: 'layers',
    field: 'localPathLayers',
    category: 'A',
    plugin: 'mounts locally-defined layers from disk',
    ours: 'mounts only published-ARN layers (downloaded), Docker functions only; local layers skipped with a notice',
    reason:
      'scope cut — published-ARN download is the only supported layer source offline',
  },

  // --- Compat-milestone scope cuts (config surface) ---
  {
    surface: 'config',
    field: 'emulatedServices',
    category: 'A',
    plugin: 'optionally emulates local services via companion plugins',
    ours: 'no local emulation of SQS/SNS/S3/EventBridge — handler SDK calls hit real AWS',
    reason:
      'scope cut — Offline emulates the API edge + Lambda, not other AWS services',
  },
  {
    surface: 'config',
    field: 'websocketPort',
    category: 'A',
    plugin: 'binds a separate websocketPort',
    ours: 'accepts but ignores websocketPort (WebSocket shares the app port)',
    reason: 'scope cut — one app port serves HTTP/REST/ALB/WebSocket',
  },
  {
    surface: 'config',
    field: 'albPort',
    category: 'A',
    plugin: 'binds a separate albPort',
    ours: 'accepts but ignores albPort (ALB shares the app port)',
    reason: 'scope cut — one app port serves HTTP/REST/ALB/WebSocket',
  },
  {
    surface: 'config',
    field: 'hotReloadDefault',
    category: 'A',
    plugin: 'hot reload defaults on',
    ours: 'hot reload defaults OFF (enable with --watch / --reloadHandler)',
    reason: 'scope choice — opt-in hot reload',
  },
  {
    surface: 'config',
    field: 'noSponsor',
    category: 'A',
    plugin: 'honors noSponsor',
    ours: 'accepts and silently ignores noSponsor',
    reason: 'scope cut — no sponsor banner to suppress',
  },
]

const ALLOWED = new Set(DIVERGENCES.map((d) => `${d.surface} ${d.field}`))

/**
 * Whether a {surface, field} pair matches a recorded divergence, so the
 * differential runner can filter out expected diffs.
 *
 * @param {{ surface: string, field: string }} key
 * @returns {boolean}
 */
export function isAllowed({ surface, field }) {
  return ALLOWED.has(`${surface} ${field}`)
}
