import { isDeepStrictEqual } from 'node:util'
import { ServerlessError } from '@serverless/util'
// The same expression the api-gateway compiler and the analytics reader use to
// recognize a Cognito pool ARN, so "is this a user pool" means one thing across
// the three of them.
import awsArnRegExs from '../../utils/arn-regular-expressions.js'

const MINIMUM_NODE_MAJOR = 20
const DEFAULT_RUNTIME = 'nodejs24.x'
const DEFAULT_TIMEOUT = 60

// Names that cannot be server names, each with why. The API Gateway resource
// logical id normalization folds case, so the lookup below is case-insensitive.
const RESERVED_SERVER_NAMES = new Map([
  [
    'well-known',
    'it would collide with the ".well-known" path that oauthDiscovery documents are served from',
  ],
  [
    '__proto__',
    'assigning it onto "functions" would hit the JavaScript prototype setter instead of defining a function',
  ],
])

// A bring-your-own state key is read at runtime with `ssm:GetParameter` or
// `secretsmanager:GetSecretValue`, so only those two services can back it. The
// schema's ARN definition accepts any ARN, hence the check here.
//
// The partition is `[^:]+` rather than `[^:]*` to match `stateIamStatement`,
// which reads the partition back out of the ARN to pick the action: an
// empty-partition ARN accepted here would be built into a statement for the
// wrong service. Region and account stay optional - SSM and Secrets Manager
// ARNs always carry both, but neither is what the action is derived from.
const STATE_ARN_PATTERNS = [
  /^arn:[^:]+:ssm:[^:]*:[^:]*:parameter\/.+/,
  /^arn:[^:]+:secretsmanager:[^:]*:[^:]*:secret:.+/,
]

// The provider schema guarantees the `nodejsNN.x` shape, so an unparsable
// `nodejs*` value is treated as a non-Node runtime rather than a hard error.
const nodeMajorOf = (providerRuntime) => {
  if (typeof providerRuntime !== 'string') return undefined
  const major = providerRuntime.match(/^nodejs(\d+)/)?.[1]
  return major === undefined ? undefined : Number(major)
}

// Mirrors the `type` values of the http event's `authorizerSchema`
// (aws/package/compile/events/api-gateway/index.js), which matches them
// case-insensitively. The MCP route compiles into the same API Gateway
// authorizer, so the two sets have to stay identical: anything an http event
// accepts must be accepted here, and nothing more.
const AUTHORIZER_TYPES = [
  'token',
  'cognito_user_pools',
  'request',
  'aws_iam',
  'custom',
]
const IAM_AUTHORIZER_TYPE = 'aws_iam'

// The three keys API Gateway can identify an authorizer by. A blank string
// names nothing, so it does not count as one of them.
const AUTHORIZER_IDENTIFIER_KEYS = ['name', 'arn', 'authorizerId']
const isPresentIdentifier = (value) =>
  value !== undefined && (typeof value !== 'string' || value.trim() !== '')

// API Gateway's own vocabulary is uppercase, and the seam forwards `type` into
// the compiled template in two places that do not fold its case
// (`../../package/compile/events/api-gateway/lib/method/authorization.js` and
// `.../lib/authorizers.js`). Which uppercase word is correct depends on which
// of the two the type is about, so the two sets are spelled out separately:
//
//  - attaching an EXISTING authorizer by id writes the method's
//    `AuthorizationType`, whose custom-authorizer member is `CUSTOM` - there is
//    no `TOKEN` or `REQUEST` at the method;
//  - a GENERATED `AWS::ApiGateway::Authorizer` carries a `Type` of exactly
//    `TOKEN`, `REQUEST` or `COGNITO_USER_POOLS` - `CUSTOM` is not one of them,
//    and `custom` is the http event's alias for the default of the three.
const CANONICAL_ATTACHED_TYPES = {
  token: 'CUSTOM',
  request: 'CUSTOM',
  custom: 'CUSTOM',
  cognito_user_pools: 'COGNITO_USER_POOLS',
}
const CANONICAL_GENERATED_TYPES = {
  token: 'TOKEN',
  request: 'REQUEST',
  custom: 'TOKEN',
  cognito_user_pools: 'COGNITO_USER_POOLS',
}

// The branch order of the seam's `getAuthorizer`: a `type` beside an
// `authorizerId` attaches an authorizer that already exists, whatever else is
// written next to them.
const attachesExistingAuthorizer = (authorizer, type) =>
  type !== undefined && isPresentIdentifier(authorizer.authorizerId)

// An https URL whose authority is written out. The literal-authority test is
// not redundant with `hostname`: WHATWG parsing collapses the extra slash in
// "https:///path" into the host "path", which would publish a discovery
// document pointing at a host the user never wrote.
const HTTPS_WITH_AUTHORITY = /^https:\/\/[^/?#]/
const isHttpsUrl = (value) => {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!HTTPS_WITH_AUTHORITY.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' && url.hostname !== ''
  } catch {
    return false
  }
}

const validateAuthorizer = (name, authorizer) => {
  const invalid = (reason) =>
    new ServerlessError(
      `MCP server "${name}" sets an authorizer that ${reason}. Set "mcp.servers.${name}.authorizer" to the name of an authorizer function in "functions", to "aws_iam", or to an http-event-style authorizer object naming one of "name", "arn" or "authorizerId".`,
      'MCP_AUTHORIZER_INVALID',
      { stack: false },
    )

  if (authorizer === undefined) return undefined
  if (typeof authorizer === 'string') {
    if (authorizer.trim() === '') throw invalid('is blank')
    // A string names an authorizer function - `route-descriptors.js` wraps it
    // into `{ name }` for exactly that reason. An http event reads a bare
    // string carrying a colon as an authorizer ARN instead, so pasting one here
    // is working http-event muscle memory that lands on
    // `Function "arn:aws:..." doesn't exist in this Service` - an error naming
    // `functions:` when the fix is the object form. The colon-string cannot
    // simply be passed through: a bare Cognito pool ARN would then compile to a
    // logical id derived from the pool id, which starts with a digit and dies
    // inside CloudFormation.
    if (
      authorizer.toLowerCase() !== IAM_AUTHORIZER_TYPE &&
      authorizer.includes(':')
    ) {
      throw new ServerlessError(
        `MCP server "${name}" sets "authorizer" to ${JSON.stringify(authorizer)}, which looks like an ARN. A string authorizer names an authorizer function in "functions"; an ARN goes in the object form. Set "mcp.servers.${name}.authorizer.arn" to it instead - and, if it is a Cognito user pool ARN, set "mcp.servers.${name}.authorizer.name" to a name of your own beside it, because the authorizer's CloudFormation logical id is built from that name.`,
        'MCP_AUTHORIZER_INVALID',
        { stack: false },
      )
    }
    return authorizer
  }
  if (
    authorizer === null ||
    typeof authorizer !== 'object' ||
    Array.isArray(authorizer)
  ) {
    throw invalid('is neither a string nor an object')
  }

  const { type } = authorizer
  if (
    type !== undefined &&
    (typeof type !== 'string' || !AUTHORIZER_TYPES.includes(type.toLowerCase()))
  ) {
    throw new ServerlessError(
      `MCP server "${name}" sets "authorizer.type" to ${JSON.stringify(type)}, which is not an API Gateway authorizer type. Set "mcp.servers.${name}.authorizer.type" to one of ${AUTHORIZER_TYPES.join(', ')} (matched case-insensitively), or leave it out to have the type inferred.`,
      'MCP_AUTHORIZER_INVALID',
      { stack: false },
    )
  }

  const lowerType = typeof type === 'string' ? type.toLowerCase() : undefined

  // `aws_iam` is the one type API Gateway resolves without an authorizer
  // resource of its own, so it is the one type that needs no identifier.
  if (lowerType === IAM_AUTHORIZER_TYPE) {
    // ...and therefore the one type with nothing for an `authorizerId` to
    // point at. The compiler resolves the contradiction by dropping the id
    // silently: the method compiles to `AWS_IAM` and the authorizer the id
    // names is simply never attached.
    if (isPresentIdentifier(authorizer.authorizerId)) {
      throw new ServerlessError(
        `MCP server "${name}" sets "authorizer.type" to "${type}" beside an "authorizer.authorizerId". "aws_iam" has API Gateway check the caller's IAM identity, with no authorizer resource to attach, so the id would be ignored. Remove "mcp.servers.${name}.authorizer.authorizerId" to authorize by IAM, or set "mcp.servers.${name}.authorizer.type" to the type of the authorizer that id belongs to.`,
        'MCP_AUTHORIZER_INVALID',
        { stack: false },
      )
    }
    return { ...authorizer, type: 'AWS_IAM' }
  }
  if (
    !AUTHORIZER_IDENTIFIER_KEYS.some((key) =>
      isPresentIdentifier(authorizer[key]),
    )
  ) {
    throw invalid('names no authorizer')
  }

  // `authorizerId` points at an authorizer resource that already exists, and
  // the api-gateway compiler reads it from exactly one branch of
  // `getAuthorizer`: the one guarded by `authorizer.type && authorizer.authorizerId`
  // (`../../package/compile/events/api-gateway/lib/validate.js`). An
  // `authorizerId` with nothing else beside it matches no branch and falls
  // through to `API_GATEWAY_MISSING_AUTHORIZER_NAME_OR_ARN` - raised much later,
  // against a `functions.<name>.events` path this user never wrote. Same
  // constraint, said here where the configuration is.
  //
  // Scoped to the shape that actually fails: an `authorizerId` alongside a
  // `name` or an `arn` compiles today (through those branches, with the id
  // unused), and an http event is not stopped from writing it either.
  //
  // An ARN with no `name` beside it is the next two. The authorizer's
  // CloudFormation logical id is built from its name, and a name that was not
  // given is derived from the ARN (`naming.js:extractAuthorizerNameFromArn`).
  // For a literal pool ARN that derivation yields the tail of the pool id,
  // always beginning with the region's trailing digit - and a logical id cannot
  // start with a digit, so the deploy dies inside CloudFormation against a
  // resource name the user never wrote. For an INTRINSIC ARN the derivation
  // never gets that far: it calls `.split(":")` on an object and packaging ends
  // on a TypeError. (The compiler's own
  // `API_GATEWAY_MISSING_AUTHORIZER_NAME` covers only the intrinsic ARN that
  // also carries `type: COGNITO_USER_POOLS`; the typeless one is the crash.)
  //
  // Both scoped to the shapes that actually die, and both only where the ARN is
  // what the authorizer is BUILT from: with a `type` beside an `authorizerId`
  // the compiler attaches an authorizer that already exists and never reads the
  // ARN at all. A literal NON-Cognito ARN is a Lambda authorizer, whose derived
  // name is a function-name tail and perfectly legal.
  const attachesExisting = attachesExistingAuthorizer(authorizer, lowerType)
  if (!attachesExisting && !isPresentIdentifier(authorizer.name)) {
    if (
      typeof authorizer.arn === 'string' &&
      awsArnRegExs.cognitoIdpArnExpr.test(authorizer.arn)
    ) {
      throw new ServerlessError(
        `MCP server "${name}" sets "authorizer.arn" to a Cognito user pool ARN without an "authorizer.name". The authorizer's CloudFormation logical id is built from its name, and a name that is not given is derived from the ARN's last dash-separated segment - for a pool id like "us-east-1_aBcDe12Fg" that is "1_aBcDe12Fg", which starts with a digit and cannot be a logical id, so the deploy fails inside CloudFormation. Set "mcp.servers.${name}.authorizer.name" to a name of your own (for example "${name}Pool") alongside the ARN.`,
        'MCP_AUTHORIZER_INVALID',
        { stack: false },
      )
    }
    // An intrinsic ARN is the same requirement for a harder reason: the name
    // derivation calls `.split(":")` on whatever the ARN is, and an intrinsic
    // is an object - so packaging ends on a TypeError rather than on anything a
    // user can act on. Same-stack pools are named by an intrinsic, so this is
    // the shape a user reaches for first.
    if (authorizer.arn !== undefined && typeof authorizer.arn !== 'string') {
      throw new ServerlessError(
        `MCP server "${name}" sets "authorizer.arn" to a CloudFormation intrinsic without an "authorizer.name". The authorizer's CloudFormation logical id is built from its name, and a name that is not given is derived from the ARN itself - which cannot be read out of an intrinsic, because the ARN does not exist until the stack is created. Set "mcp.servers.${name}.authorizer.name" to a name of your own (for example "${name}Pool") alongside the intrinsic.`,
        'MCP_AUTHORIZER_INVALID',
        { stack: false },
      )
    }
  }

  if (
    isPresentIdentifier(authorizer.authorizerId) &&
    type === undefined &&
    !isPresentIdentifier(authorizer.name) &&
    !isPresentIdentifier(authorizer.arn)
  ) {
    throw new ServerlessError(
      `MCP server "${name}" sets "authorizer.authorizerId" without "authorizer.type". API Gateway needs both to attach an existing authorizer: set "mcp.servers.${name}.authorizer.type" to the type of the authorizer that id belongs to (one of ${AUTHORIZER_TYPES.join(', ')}, matched case-insensitively), or identify the authorizer by "name" or "arn" instead.`,
      'MCP_AUTHORIZER_INVALID',
      { stack: false },
    )
  }

  // The type is accepted in any case and forwarded verbatim into the template
  // by the seam, so the one spelling API Gateway accepts is settled here.
  if (lowerType === undefined) return authorizer
  return {
    ...authorizer,
    type: attachesExisting
      ? CANONICAL_ATTACHED_TYPES[lowerType]
      : CANONICAL_GENERATED_TYPES[lowerType],
  }
}

/**
 * The name the authorizer's own CloudFormation resource is keyed by, or
 * `undefined` when the shape builds no resource of this stack's own.
 *
 * Mirrors the name resolution in the seam's `getAuthorizer`
 * (`../../package/compile/events/api-gateway/lib/validate.js`), because that is
 * what `compileAuthorizers` turns into a logical id - and two authorizers
 * landing on one logical id are merged into one resource, last definition
 * winning.
 */
const authorizerResourceNameOf = (authorizer, naming) => {
  if (authorizer === null || authorizer === undefined) return undefined
  if (typeof authorizer === 'string') {
    if (authorizer.toLowerCase() === IAM_AUTHORIZER_TYPE) return undefined
    // The seam's string branch: a colon makes it an ARN, and the name is
    // derived from it. Unreachable for an MCP server (a colon-bearing string
    // is refused above), but an http event is read through here too.
    return authorizer.includes(':')
      ? naming.extractAuthorizerNameFromArn(authorizer)
      : authorizer
  }
  if (typeof authorizer !== 'object' || Array.isArray(authorizer)) {
    return undefined
  }

  const lowerType =
    typeof authorizer.type === 'string'
      ? authorizer.type.toLowerCase()
      : undefined
  // Neither builds an authorizer resource: IAM is resolved by API Gateway
  // itself, and an id names one that already exists.
  if (lowerType === IAM_AUTHORIZER_TYPE) return undefined
  if (attachesExistingAuthorizer(authorizer, lowerType)) return undefined

  // `typeof name === 'string'`, not "is present": that is the seam's own test,
  // and it is what decides whether the name is taken as written or derived
  // from the ARN. A non-string `name` only warns at the schema, so it arrives
  // here - and it is not something a logical id can be built from.
  if (authorizer.arn) {
    if (typeof authorizer.name === 'string') return authorizer.name || undefined
    return typeof authorizer.arn === 'string'
      ? naming.extractAuthorizerNameFromArn(authorizer.arn)
      : undefined
  }
  if (typeof authorizer.name === 'string' && authorizer.name.trim() !== '') {
    return authorizer.name
  }
  return undefined
}

/**
 * One authorizer in the shape two of them are compared in.
 *
 * A string and the `{ name }` object are two spellings of one authorizer, and
 * an unwritten `type` IS the default the compiler applies - so both are
 * resolved here, and two authorizers that compile to the same resource compare
 * equal however they were written.
 */
// What the compiler defaults an unspecified type to: a literal pool ARN is read
// as a user pool whether or not the type says so, everything else builds a
// TOKEN authorizer.
const defaultGeneratedTypeOf = (shape) =>
  typeof shape.arn === 'string' &&
  awsArnRegExs.cognitoIdpArnExpr.test(shape.arn)
    ? 'COGNITO_USER_POOLS'
    : 'TOKEN'

const objectFormOf = (authorizer) => {
  if (typeof authorizer !== 'string') return { ...authorizer }
  // The seam reads a colon-bearing string as an ARN, not a name.
  return authorizer.includes(':') ? { arn: authorizer } : { name: authorizer }
}

const comparableAuthorizer = (authorizer) => {
  const shape = objectFormOf(authorizer)
  const lowerType =
    typeof shape.type === 'string' ? shape.type.toLowerCase() : undefined
  shape.type =
    lowerType === undefined
      ? defaultGeneratedTypeOf(shape)
      : (CANONICAL_GENERATED_TYPES[lowerType] ?? shape.type)
  return shape
}

/**
 * Every authorizer the http events in this service contribute to the shared
 * REST API, as `logicalId -> { describe, shape }`.
 *
 * `compileAuthorizers` merges by logical id over EVERY validated event, so an
 * http event's authorizer collapses with an MCP server's exactly as two MCP
 * servers' do. Read defensively: under the default configValidationMode a
 * function or an event can be in any shape here, and reading one may not throw.
 */
const httpAuthorizersByLogicalId = (functions, naming) => {
  const byLogicalId = new Map()
  for (const [functionName, fn] of Object.entries(functions ?? {})) {
    if (!Array.isArray(fn?.events)) continue
    for (const event of fn.events) {
      const http = event?.http
      if (http === null || typeof http !== 'object' || Array.isArray(http)) {
        continue
      }
      const { authorizer } = http
      if (authorizer === undefined) continue

      const resourceName = authorizerResourceNameOf(authorizer, naming)
      if (typeof resourceName !== 'string' || resourceName === '') continue
      const logicalId = naming.getAuthorizerLogicalId(resourceName)
      if (byLogicalId.has(logicalId)) continue

      const route = [http.method, http.path].filter(Boolean).join(' ')
      byLogicalId.set(logicalId, {
        describe: `the http event${route === '' ? '' : ` "${route}"`} on function "${functionName}"`,
        shape: comparableAuthorizer(authorizer),
      })
    }
  }
  return byLogicalId
}

// The discovery document is published as an API Gateway MOCK response
// template, and API Gateway evaluates response templates as Velocity on every
// request: "$" opens a reference and "#" a directive, so either character in a
// URL that lands in the document changes what a client is told - silently, with
// a green deploy behind it. Neither belongs in these values anyway: an issuer
// identifier carries no fragment, and a public base URL has nothing to
// interpolate.
const VELOCITY_ACTIVE_CHARACTERS = /[$#]/
const velocityHazardOf = (value) => value.match(VELOCITY_ACTIVE_CHARACTERS)?.[0]

// A CloudFormation intrinsic, recognized structurally: exactly one key, and
// that key one the schema's `awsCfFunction` definition admits (`../provider.js`
// - the same set the `awsArn` definition rides). Anything else that happens to
// be an object is not an intrinsic and gets the same teaching error a number
// would: under the default configValidationMode the schema only warns, so a
// misspelled `Fn::` key arrives here rather than stopping at the schema.
const INTRINSIC_KEYS = new Set([
  'Ref',
  'Fn::Base64',
  'Fn::GetAtt',
  'Fn::ImportValue',
  'Fn::Join',
  'Fn::Sub',
  'Fn::ToJsonString',
])
const intrinsicKeyOf = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const keys = Object.keys(value)
  if (keys.length !== 1 || !INTRINSIC_KEYS.has(keys[0])) return undefined
  return keys[0]
}

// `${...}` inside an `Fn::Sub` template is CloudFormation's own substitution,
// resolved before the rendered string is ever written into the API Gateway
// method - so it is masked out before the Velocity guard and the https check
// run over what the user actually wrote literally.
//
// `${!Name}` is the one exception: it is CloudFormation's escape for the
// LITERAL text `${Name}`, not a substitution at all. Masking it away would hide
// a "$" that really does reach Velocity in the published document, so it is
// replaced by what CloudFormation will actually render - which the guard then
// sees and rejects.
const maskSubPlaceholders = (template) =>
  template.replace(/\$\{(!?)([^}]*)\}/g, (_match, escaped, inner) =>
    escaped === '' ? '' : `\${${inner}}`,
  )

const HTTPS_PREFIX = 'https://'

/**
 * The checks an `Fn::Sub` issuer written as a plain template string can still
 * be held to: its literal segments are exactly as visible here as a literal
 * issuer's are, so they are checked exactly the same way.
 *
 * Every other intrinsic - `Ref`, `Fn::GetAtt`, `Fn::ImportValue`, an `Fn::Sub`
 * in its list form - resolves to a value nothing here can see, so it passes
 * through: the trust boundary is the user's own stack.
 */
const validateIntrinsicIssuer = (name, issuer, intrinsicKey) => {
  if (intrinsicKey !== 'Fn::Sub') return
  const template = issuer['Fn::Sub']
  if (typeof template !== 'string') return

  const literal = maskSubPlaceholders(template)
  if (!literal.startsWith(HTTPS_PREFIX)) {
    throw new ServerlessError(
      `MCP server "${name}" sets "oauthDiscovery.issuer" to an "Fn::Sub" over ${JSON.stringify(template)}, whose literal text does not begin with "https://". Clients read the issuer out of the published metadata and fetch it directly, so it has to be an https URL however it is assembled. Write the scheme and "//" out around the substitutions in "mcp.servers.${name}.oauthDiscovery.issuer" (for example "https://cognito-idp.\${AWS::Region}.amazonaws.com/\${UserPool}") - or, when the whole URL comes from a single parameter, output or resource attribute, set it to a "Ref" or "Fn::GetAtt" naming that value directly rather than an "Fn::Sub" around it: an issuer that is entirely an intrinsic is passed through as written.`,
      'MCP_OAUTH_DISCOVERY_ISSUER_NOT_HTTPS',
      { stack: false },
    )
  }

  const hazard = velocityHazardOf(literal)
  if (hazard !== undefined) {
    throw new ServerlessError(
      `MCP server "${name}" sets "oauthDiscovery.issuer" to an "Fn::Sub" over ${JSON.stringify(template)}, whose literal text contains ${JSON.stringify(hazard)}. The discovery document is served straight from API Gateway as a Velocity template, where "$" starts a variable reference and "#" starts a directive - CloudFormation resolves "\${...}" long before that, but any other "$" and every "#" survive into the published metadata and change what a client reads. Remove it from "mcp.servers.${name}.oauthDiscovery.issuer".`,
      'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
      { stack: false },
    )
  }
}

const validateOauthDiscovery = (name, oauthDiscovery) => {
  if (oauthDiscovery === undefined) return undefined

  const issuer =
    oauthDiscovery !== null &&
    typeof oauthDiscovery === 'object' &&
    !Array.isArray(oauthDiscovery)
      ? oauthDiscovery.issuer
      : undefined
  const issuerIntrinsicKey = intrinsicKeyOf(issuer)
  if (issuerIntrinsicKey === undefined) {
    // An object that is not one of the accepted intrinsics is a written issuer
    // that cannot be read, not a missing one - so it is quoted back rather than
    // described as an omission. `Fn::Select`, `Fn::If` and `Fn::FindInMap` are
    // real CloudFormation functions and still land here: the schema's
    // `awsCfFunction` definition is the accepted set, and this mirrors it.
    if (
      issuer !== null &&
      typeof issuer === 'object' &&
      !Array.isArray(issuer)
    ) {
      throw new ServerlessError(
        `MCP server "${name}" sets "oauthDiscovery.issuer" to ${JSON.stringify(issuer)}, which is not a CloudFormation intrinsic this property accepts. Set "mcp.servers.${name}.oauthDiscovery.issuer" to the https URL of the authorization server, or to one of "Ref", "Fn::GetAtt", "Fn::ImportValue", "Fn::Sub", "Fn::Join", "Fn::Base64" or "Fn::ToJsonString" resolving to it.`,
        'MCP_OAUTH_DISCOVERY_ISSUER_REQUIRED',
        { stack: false },
      )
    }
    // A whitespace-only issuer would publish a discovery document advertising a
    // blank authorization server, which no client can log in against.
    if (typeof issuer !== 'string' || issuer.trim() === '') {
      throw new ServerlessError(
        `MCP server "${name}" enables "oauthDiscovery" without an issuer. Set "mcp.servers.${name}.oauthDiscovery.issuer" to the https URL of the authorization server that issues this server's tokens (for example "https://acme.auth0.com"), or to a CloudFormation intrinsic resolving to one when the authorization server is created by this same stack, or remove "oauthDiscovery".`,
        'MCP_OAUTH_DISCOVERY_ISSUER_REQUIRED',
        { stack: false },
      )
    }
  }
  if (issuerIntrinsicKey !== undefined) {
    validateIntrinsicIssuer(name, issuer, issuerIntrinsicKey)
  } else if (!isHttpsUrl(issuer)) {
    throw new ServerlessError(
      `MCP server "${name}" sets "oauthDiscovery.issuer" to ${JSON.stringify(issuer)}, which is not an https URL with a host. Set "mcp.servers.${name}.oauthDiscovery.issuer" to the full https URL of the authorization server (for example "https://acme.auth0.com"): clients read it out of the published metadata and fetch it directly.`,
      'MCP_OAUTH_DISCOVERY_ISSUER_NOT_HTTPS',
      { stack: false },
    )
  } else {
    const issuerHazard = velocityHazardOf(issuer)
    if (issuerHazard !== undefined) {
      throw new ServerlessError(
        `MCP server "${name}" sets "oauthDiscovery.issuer" to ${JSON.stringify(issuer)}, which contains ${JSON.stringify(issuerHazard)}. The discovery document is served straight from API Gateway as a Velocity template, where "$" starts a variable reference and "#" starts a directive, so neither character can survive into the published metadata. Set "mcp.servers.${name}.oauthDiscovery.issuer" to the plain https URL of the authorization server (for example "https://acme.auth0.com") - an issuer identifier carries no fragment, so "#" is not legal in one to begin with.`,
        'MCP_OAUTH_DISCOVERY_ISSUER_NOT_HTTPS',
        { stack: false },
      )
    }
  }

  const { publicUrl } = oauthDiscovery
  // The issuer may be an intrinsic; this may not. It names the front door in
  // front of this service - configured somewhere else by definition, never a
  // resource this stack creates - and the deploy prints it in the endpoint
  // summary, which has no CloudFormation behind it to render one.
  if (intrinsicKeyOf(publicUrl) !== undefined) {
    throw new ServerlessError(
      `MCP server "${name}" sets "oauthDiscovery.publicUrl" to a CloudFormation intrinsic. Only a literal https URL is supported: "publicUrl" names the public front door already in place in front of this service, and the deploy prints it in the endpoint summary, where an unresolved intrinsic has nothing to render it. Set "mcp.servers.${name}.oauthDiscovery.publicUrl" to the URL itself (for example "https://mcp.acme.com"), or remove it to have it derived from the deployed endpoint.`,
      'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
      { stack: false },
    )
  }
  if (publicUrl !== undefined && !isHttpsUrl(publicUrl)) {
    throw new ServerlessError(
      `MCP server "${name}" sets "oauthDiscovery.publicUrl" to ${JSON.stringify(publicUrl)}, which is not an https URL with a host. Set "mcp.servers.${name}.oauthDiscovery.publicUrl" to the public https URL clients use to reach this service, everything before "/${name}/mcp" (for example "https://mcp.acme.com"), or remove it to have it derived from the deployed endpoint.`,
      'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
      { stack: false },
    )
  }
  const publicUrlHazard =
    publicUrl === undefined ? undefined : velocityHazardOf(publicUrl)
  if (publicUrlHazard !== undefined) {
    throw new ServerlessError(
      `MCP server "${name}" sets "oauthDiscovery.publicUrl" to ${JSON.stringify(publicUrl)}, which contains ${JSON.stringify(publicUrlHazard)}. The discovery document is served straight from API Gateway as a Velocity template, where "$" starts a variable reference and "#" starts a directive, so neither character can survive into the published metadata. Set "mcp.servers.${name}.oauthDiscovery.publicUrl" to the plain https URL clients use to reach this service, everything before "/${name}/mcp" (for example "https://mcp.acme.com").`,
      'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
      { stack: false },
    )
  }

  // The server's route is appended to this base, so a query string would land
  // in the middle of the resource URL the document publishes
  // ("https://mcp.acme.com/base?tenant=acme/crm/mcp") - an address that reaches
  // nothing. A base URL carrying a query is not a front door in the first
  // place. A fragment is covered by the Velocity guard above, which rejects
  // "#" outright.
  if (publicUrl !== undefined && publicUrl.includes('?')) {
    throw new ServerlessError(
      `MCP server "${name}" sets "oauthDiscovery.publicUrl" to ${JSON.stringify(publicUrl)}, which carries a query string. The server's route is appended to this URL to publish where clients reach it, so a query in the middle of it ("${publicUrl.trim()}/${name}/mcp") would address nothing. Set "mcp.servers.${name}.oauthDiscovery.publicUrl" to the base URL alone (for example "https://mcp.acme.com").`,
      'MCP_OAUTH_DISCOVERY_PUBLIC_URL_NOT_HTTPS',
      { stack: false },
    )
  }

  return {
    // An intrinsic is handed on exactly as written - CloudFormation is the
    // only thing entitled to interpret it.
    issuer: issuerIntrinsicKey === undefined ? issuer.trim() : issuer,
    ...(publicUrl === undefined ? {} : { publicUrl: publicUrl.trim() }),
  }
}

export const validateMcp = ({ mcp, functions, providerRuntime, naming }) => {
  // The transformation the provider applies when turning a function key into
  // its `<Name>LambdaFunction` logical id: distinct identifiers can land on the
  // same one, which would silently overwrite a CloudFormation resource. Taken
  // from the caller's `provider.naming` rather than imported directly, because
  // naming methods are plugin-overridable - importing the module would let this
  // check diverge from the logical ids actually emitted.
  const normalizedNameOf = (name) => naming.getNormalizedFunctionName(name)

  const nodeMajor = nodeMajorOf(providerRuntime)
  if (nodeMajor !== undefined && nodeMajor < MINIMUM_NODE_MAJOR) {
    throw new ServerlessError(
      `MCP servers require a Node.js runtime of nodejs${MINIMUM_NODE_MAJOR}.x or newer (the MCP SDK requires Node.js >= ${MINIMUM_NODE_MAJOR}), but "provider.runtime" is "${providerRuntime}". Set "provider.runtime" to nodejs${MINIMUM_NODE_MAJOR}.x or newer, or remove it to use the default (${DEFAULT_RUNTIME}).`,
      'MCP_UNSUPPORTED_NODE_RUNTIME',
      { stack: false },
    )
  }
  const runtime = nodeMajor === undefined ? DEFAULT_RUNTIME : providerRuntime

  // Keyed by normalized name, so a server colliding with `foo-bar` is caught
  // whether the function is spelled `foo-bar` or `fooDashbar`.
  const functionsByNormalizedName = new Map(
    Object.keys(functions ?? {}).map((key) => [normalizedNameOf(key), key]),
  )
  const serversByNormalizedName = new Map()
  // Authorizer logical id -> who defined it and the shape they defined. Two
  // definitions may share one authorizer; two DIFFERENT authorizers landing on
  // one logical id are merged by `compileAuthorizers` into a single resource,
  // so one of them would silently end up guarded by the other's.
  //
  // Seeded with the http events' authorizers, because the merge is over every
  // validated event and not only the contributed ones. Two http events
  // colliding with each other is left alone: that is the compiler's own
  // long-standing behavior over configuration this plugin did not author, and
  // raising it from here would fail services for a reason that has nothing to
  // do with MCP. It is recorded as an upstream candidate instead.
  const authorizersByLogicalId = httpAuthorizersByLogicalId(functions, naming)

  const servers = Object.entries(mcp.servers).map(([name, config]) => {
    const reservedReason = RESERVED_SERVER_NAMES.get(name.toLowerCase())
    if (reservedReason) {
      throw new ServerlessError(
        `MCP server name "${name}" is reserved, because ${reservedReason}. Rename the server.`,
        'MCP_RESERVED_SERVER_NAME',
        { stack: false },
      )
    }
    const normalizedName = normalizedNameOf(name)
    const collidingFunction = functionsByNormalizedName.get(normalizedName)
    if (collidingFunction !== undefined) {
      throw new ServerlessError(
        `MCP server "${name}" collides with the function "${collidingFunction}" defined in "functions": both compile to the CloudFormation logical id "${normalizedName}LambdaFunction". Rename one of them.`,
        'MCP_FUNCTION_NAME_COLLISION',
        { stack: false },
      )
    }
    const collidingServer = serversByNormalizedName.get(normalizedName)
    if (collidingServer !== undefined) {
      throw new ServerlessError(
        `MCP servers "${collidingServer}" and "${name}" collide: both compile to the CloudFormation logical id "${normalizedName}LambdaFunction". Rename one of them.`,
        'MCP_FUNCTION_NAME_COLLISION',
        { stack: false },
      )
    }
    serversByNormalizedName.set(normalizedName, name)
    // Under configValidationMode "warn" (the default) schema violations do not
    // stop the run, so a server entry can arrive here in any shape. A user who
    // wrote a `servers` block means to use MCP servers - a malformed entry
    // gets a teaching error, never a TypeError.
    if (
      config === null ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      typeof config.server !== 'string' ||
      config.server === ''
    ) {
      throw new ServerlessError(
        `MCP server "${name}" needs "server": the path of the module that default-exports the MCP handler. Set "mcp.servers.${name}.server" to that path (for example "src/server.mjs").`,
        'MCP_SERVER_MODULE_REQUIRED',
        { stack: false },
      )
    }
    if (
      config.state !== undefined &&
      typeof config.state !== 'boolean' &&
      typeof config.state !== 'string'
    ) {
      throw new ServerlessError(
        `MCP server "${name}" sets "state" to a CloudFormation intrinsic. Only a literal ARN string is supported: the ARN's service decides whether the execution role is granted "ssm:GetParameter" or "secretsmanager:GetSecretValue", and an intrinsic hides it. Write the ARN out in full, or set "state: true" to have the Framework provision the key instead.`,
        'MCP_INVALID_STATE_ARN',
        { stack: false },
      )
    }
    if (
      typeof config.state === 'string' &&
      !STATE_ARN_PATTERNS.some((pattern) => pattern.test(config.state))
    ) {
      throw new ServerlessError(
        `MCP server "${name}" sets "state" to "${config.state}", which is not a supported state key ARN. A bring-your-own state key must be either an SSM Parameter Store parameter ("arn:<partition>:ssm:<region>:<account>:parameter/<name>") or a Secrets Manager secret ("arn:<partition>:secretsmanager:<region>:<account>:secret:<name>"). Set "state: true" to have the Framework provision the key instead.`,
        'MCP_INVALID_STATE_ARN',
        { stack: false },
      )
    }
    const authorizer = validateAuthorizer(name, config.authorizer)

    const authorizerName = authorizerResourceNameOf(authorizer, naming)
    if (authorizerName !== undefined) {
      const logicalId = naming.getAuthorizerLogicalId(authorizerName)
      const shape = comparableAuthorizer(authorizer)
      const previous = authorizersByLogicalId.get(logicalId)
      if (previous === undefined) {
        authorizersByLogicalId.set(logicalId, {
          describe: `MCP server "${name}"`,
          shape,
        })
      } else if (!isDeepStrictEqual(previous.shape, shape)) {
        throw new ServerlessError(
          `MCP server "${name}" and ${previous.describe} set different authorizers whose names both compile to the CloudFormation logical id "${logicalId}": only one authorizer resource is created, so one of the two would be guarded by the other's authorizer. Rename one of them to a name that normalizes to a different logical id - the normalization folds case and punctuation - or make the two definitions identical, so that they really are one authorizer.`,
          'MCP_AUTHORIZER_NAME_COLLISION',
          { stack: false },
        )
      }
    }

    return {
      name,
      server: config.server,
      // Handed to the http-event authorizer compiler, which is the only thing
      // that may interpret its shape - so the only change made to it is the
      // canonical spelling of `type`, which that compiler forwards into the
      // template without folding its case.
      authorizer,
      oauthDiscovery: validateOauthDiscovery(name, config.oauthDiscovery),
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      memorySize: config.memorySize,
      environment: config.environment,
      state: config.state,
      runtime,
    }
  })

  return { servers }
}
