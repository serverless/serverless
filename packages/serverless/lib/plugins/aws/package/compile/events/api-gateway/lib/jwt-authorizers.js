import { ServerlessError } from '@serverless/util'

/**
 * JWT authorizers of a REST API, defined once under
 * `provider.apiGateway.authorizers` and referenced by name from `http` events.
 *
 * Every rule is enforced here rather than only in the config schema: schema
 * violations only warn under the default `configValidationMode`, and the
 * schema's `regexp` keyword is not applied.
 */

const INVALID = 'API_GATEWAY_JWT_AUTHORIZER_INVALID'
const NAME_CONFLICT = 'API_GATEWAY_AUTHORIZER_NAME_CONFLICT'

const DEFAULT_IDENTITY_SOURCE = 'method.request.header.Authorization'
const IDENTITY_SOURCE_PATTERN = /^method\.request\.header\.[^,\s]+$/
// Keys become CloudFormation logical IDs, which are alphanumeric once the
// Framework has normalized "-" and "_".
const AUTHORIZER_KEY_PATTERN = /^[A-Za-z0-9_-]+$/
// https, a host right after the scheme, and no whitespace anywhere.
const ISSUER_URL_SHAPE = /^https:\/\/[^/?#@\s][^\s]*$/
const ALGORITHMS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512']
const RESERVED_CLAIMS = ['iss', 'aud', 'exp', 'nbf', 'iat', 'scope', 'scp']
const MAX_ISSUERS = 10
const MAX_AUDIENCES = 100
const MAX_CLAIMS = 10
// CloudFormation's limit on the length of a logical ID.
const MAX_LOGICAL_ID_LENGTH = 255

const DEFINITION_KEYS = [
  'type',
  'name',
  'identitySource',
  'algorithms',
  'issuerUrl',
  'audience',
  'additionalClaims',
  'issuers',
]
const ISSUER_ENTRY_KEYS = ['issuerUrl', 'audience', 'additionalClaims']

// Keys of an http event's `authorizer` that have no meaning for a JWT
// authorizer, each with the advice that ends its error message.
const UNSUPPORTED_EVENT_KEYS = {
  resultTtlInSeconds: () =>
    `JWT authorizers don't cache results: remove "resultTtlInSeconds".`,
  identitySource: (isDefined) =>
    isDefined
      ? `Set it on the authorizer in "provider.apiGateway.authorizers" instead.`
      : `The attached authorizer reads its own identity source: remove "identitySource".`,
  identityValidationExpression: () =>
    `JWT authorizers don't use a validation expression: remove "identityValidationExpression".`,
  claims: () =>
    `JWT claims reach your function in requestContext.authorizer.claims: remove "claims".`,
  arn: () => `A JWT authorizer runs no function: remove "arn".`,
  managedExternally: () =>
    `A JWT authorizer has no function permission to manage: remove "managedExternally".`,
}

/**
 * A CloudFormation intrinsic function: an object with a single key that is
 * `Ref` or starts with `Fn::`. Values given this way get structure checks only.
 */
const isIntrinsic = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && (keys[0] === 'Ref' || keys[0].startsWith('Fn::'))
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isNonEmptyString = (value) => typeof value === 'string' && value !== ''

const show = (value) =>
  typeof value === 'string' ? `"${value}"` : JSON.stringify(value)

const invalid = (message) =>
  new ServerlessError(message, INVALID, { stack: false })

/**
 * Rejects keys a definition doesn't know. The schema only warns about them
 * under the default `configValidationMode`, and a misspelled key such as
 * "additionalClaim" would otherwise compile to an authorizer without the
 * rules it was meant to hold.
 */
const assertKnownKeys = (key, path, value, known) => {
  for (const name of Object.keys(value)) {
    if (known.includes(name)) continue
    const lowerName = name.toLowerCase()
    const closest = known.find(
      (candidate) =>
        candidate.toLowerCase() === lowerName ||
        candidate.toLowerCase() === `${lowerName}s` ||
        `${candidate.toLowerCase()}s` === lowerName,
    )
    throw invalid(
      `API Gateway authorizer "${key}" sets "${path}${name}", which a JWT authorizer doesn't use.${
        closest ? ` Did you mean "${closest}"?` : ''
      } Use only ${known.map((candidate) => `"${candidate}"`).join(', ')}${
        path ? ` in each entry of "issuers"` : ''
      }.`,
    )
  }
}

/** An issuer URL as shown in an error, without any user info it carries. */
const showIssuerUrl = (issuerUrl) =>
  typeof issuerUrl === 'string'
    ? show(
        issuerUrl.replace(
          /^(\s*(?:[a-z][a-z0-9+.-]*:\/\/)?)[^/?#]*@/i,
          '$1***@',
        ),
      )
    : show(issuerUrl)

/**
 * Whether a literal issuer URL is one API Gateway accepts: https, with a host,
 * and no user info, query or fragment. The value itself is never rewritten.
 */
const isValidIssuerUrl = (issuerUrl) => {
  if (!ISSUER_URL_SHAPE.test(issuerUrl)) return false
  if (issuerUrl.includes('?') || issuerUrl.includes('#')) return false
  let url
  try {
    url = new URL(issuerUrl)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    Boolean(url.hostname) &&
    !url.username &&
    !url.password &&
    !/^https:\/\/[^/]*@/i.test(issuerUrl)
  )
}

/** The https form of a rejected issuer URL, used as the example in its error. */
const suggestIssuerUrl = (issuerUrl) => {
  const withoutScheme = issuerUrl
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[?#]/)[0]
  const slash = withoutScheme.indexOf('/')
  const authority = slash === -1 ? withoutScheme : withoutScheme.slice(0, slash)
  const rest = slash === -1 ? '' : withoutScheme.slice(slash)
  const host = authority.slice(authority.lastIndexOf('@') + 1)
  return host ? `https://${host}${rest}` : 'https://idp.example.com'
}

const normalizeAlgorithms = (key, algorithms) => {
  const missing =
    algorithms == null || (Array.isArray(algorithms) && !algorithms.length)
  if (missing) {
    throw invalid(
      `API Gateway authorizer "${key}" has no "algorithms". List the signing algorithms your issuer uses, for example "algorithms: [RS256]" (allowed: ${ALGORITHMS.join(', ')}). The issuer's discovery document lists them under "id_token_signing_alg_values_supported".`,
    )
  }
  if (isIntrinsic(algorithms)) return algorithms
  if (!Array.isArray(algorithms)) {
    throw invalid(
      `API Gateway authorizer "${key}" sets algorithms to ${show(algorithms)}. Set "algorithms" to a list, for example "algorithms: [RS256]" (allowed: ${ALGORITHMS.join(', ')}).`,
    )
  }
  if (algorithms.length > ALGORITHMS.length) {
    throw invalid(
      `API Gateway authorizer "${key}" lists ${algorithms.length} algorithms. A JWT authorizer allows 1 to ${ALGORITHMS.length} algorithms: list each of ${ALGORITHMS.join(', ')} at most once in "algorithms".`,
    )
  }
  const seen = new Set()
  return algorithms.map((algorithm) => {
    if (isIntrinsic(algorithm)) return algorithm
    const normalized =
      typeof algorithm === 'string' ? algorithm.toUpperCase() : undefined
    if (!ALGORITHMS.includes(normalized)) {
      throw invalid(
        `API Gateway authorizer "${key}" lists algorithm ${show(algorithm)}. A JWT authorizer accepts ${ALGORITHMS.join(', ')}: use the names your issuer's discovery document lists under "id_token_signing_alg_values_supported".`,
      )
    }
    if (seen.has(normalized)) {
      throw invalid(
        `API Gateway authorizer "${key}" lists algorithm "${normalized}" twice in "algorithms". List each algorithm once.`,
      )
    }
    seen.add(normalized)
    return normalized
  })
}

const normalizeIdentitySource = (key, identitySource) => {
  if (identitySource === undefined) return DEFAULT_IDENTITY_SOURCE
  if (isIntrinsic(identitySource)) return identitySource
  if (
    typeof identitySource !== 'string' ||
    !IDENTITY_SOURCE_PATTERN.test(identitySource)
  ) {
    throw invalid(
      `API Gateway authorizer "${key}" sets identitySource to ${show(identitySource)}. A JWT authorizer reads one request header: use "method.request.header.<Name>", or leave it out to read the Authorization header.`,
    )
  }
  return identitySource
}

const normalizeIssuerUrl = (key, path, issuerUrl) => {
  if (issuerUrl === undefined) {
    throw invalid(
      `API Gateway authorizer "${key}" has no "${path}". Set it to the https URL in your tokens' "iss" claim, for example "https://idp.example.com".`,
    )
  }
  if (isIntrinsic(issuerUrl)) return issuerUrl
  if (typeof issuerUrl !== 'string' || !isValidIssuerUrl(issuerUrl)) {
    const example =
      typeof issuerUrl === 'string'
        ? suggestIssuerUrl(issuerUrl)
        : 'https://idp.example.com'
    throw invalid(
      `API Gateway authorizer "${key}" sets ${path} to ${showIssuerUrl(issuerUrl)}. Set it to the https URL in your tokens' "iss" claim, with no query or fragment, for example "${example}".`,
    )
  }
  return issuerUrl
}

const normalizeAudience = (key, path, audience) => {
  if (audience === undefined) {
    throw invalid(
      `API Gateway authorizer "${key}" has no "${path}". Set it to the value of your tokens' "aud" claim, or a list of 1 to ${MAX_AUDIENCES} of them.`,
    )
  }
  const audiences = Array.isArray(audience) ? audience : [audience]
  if (!audiences.length || audiences.length > MAX_AUDIENCES) {
    throw invalid(
      `API Gateway authorizer "${key}" lists ${audiences.length} audiences in "${path}". A JWT issuer accepts 1 to ${MAX_AUDIENCES} audiences: ${
        audiences.length ? 'split them across two authorizers' : 'add one'
      }.`,
    )
  }
  const seen = new Set()
  for (const item of audiences) {
    if (!isNonEmptyString(item) && !isIntrinsic(item)) {
      throw invalid(
        `API Gateway authorizer "${key}" lists audience ${show(item)} in "${path}". Each audience is a non-empty string or a CloudFormation intrinsic function.`,
      )
    }
    if (typeof item !== 'string') continue
    if (seen.has(item)) {
      throw invalid(
        `API Gateway authorizer "${key}" lists audience "${item}" twice. List each audience once.`,
      )
    }
    seen.add(item)
  }
  return audiences
}

const CLAIM_FORMS = `A claim rule is a non-empty string (the claim must have that value), true (the claim must be present), or { value, required } (the claim must have that value; with "required: false", only when present).`

const normalizeClaim = (key, path, claimName, rule) => {
  const claim = { ClaimName: claimName, Format: 'SINGLE_STRING' }
  if (isNonEmptyString(rule)) {
    return { ...claim, Required: true, ExpectedValues: [rule] }
  }
  if (rule === true) return { ...claim, Required: true }
  if (
    isPlainObject(rule) &&
    !isIntrinsic(rule) &&
    isNonEmptyString(rule.value) &&
    (rule.required === undefined || typeof rule.required === 'boolean') &&
    Object.keys(rule).every((name) => name === 'value' || name === 'required')
  ) {
    return {
      ...claim,
      Required: rule.required ?? true,
      ExpectedValues: [rule.value],
    }
  }
  throw invalid(
    `API Gateway authorizer "${key}" sets ${path}.${claimName} to ${show(rule)}. ${CLAIM_FORMS}`,
  )
}

const normalizeAdditionalClaims = (key, path, additionalClaims) => {
  if (additionalClaims === undefined) return undefined
  if (!isPlainObject(additionalClaims) || isIntrinsic(additionalClaims)) {
    throw invalid(
      `API Gateway authorizer "${key}" sets ${path} to ${show(additionalClaims)}. Set "${path}" to a map of claim names to claim rules. ${CLAIM_FORMS}`,
    )
  }
  const entries = Object.entries(additionalClaims)
  if (entries.length > MAX_CLAIMS) {
    throw invalid(
      `API Gateway authorizer "${key}" lists ${entries.length} claims in "${path}". A JWT issuer checks at most ${MAX_CLAIMS} additional claims: keep the ${MAX_CLAIMS} that matter most, and check the rest in your function.`,
    )
  }
  if (!entries.length) return undefined
  return entries.map(([claimName, rule]) => {
    if (RESERVED_CLAIMS.includes(claimName)) {
      throw invalid(
        `API Gateway authorizer "${key}" lists claim "${claimName}" in "${path}". API Gateway checks ${RESERVED_CLAIMS.join(', ')} itself: remove "${claimName}" from "${path}" (use "scopes" on the http event for scope checks).`,
      )
    }
    return normalizeClaim(key, path, claimName, rule)
  })
}

const normalizeIssuer = (key, prefix, issuer) => ({
  Issuer: normalizeIssuerUrl(key, `${prefix}issuerUrl`, issuer.issuerUrl),
  Audiences: normalizeAudience(key, `${prefix}audience`, issuer.audience),
  AdditionalClaims: normalizeAdditionalClaims(
    key,
    `${prefix}additionalClaims`,
    issuer.additionalClaims,
  ),
})

const SINGLE_ISSUER_KEYS = ['issuerUrl', 'audience', 'additionalClaims']

const normalizeIssuers = (key, definition) => {
  const singleKeys = SINGLE_ISSUER_KEYS.filter(
    (name) => definition[name] !== undefined,
  )
  if (definition.issuers === undefined) {
    return [normalizeIssuer(key, '', definition)]
  }
  if (singleKeys.length) {
    throw invalid(
      `API Gateway authorizer "${key}" sets both "issuers" and "${singleKeys[0]}". Set "issuerUrl", "audience" and "additionalClaims" either at the top of the authorizer (one issuer) or on each entry of "issuers", not both.`,
    )
  }
  const { issuers } = definition
  if (!Array.isArray(issuers)) {
    throw invalid(
      `API Gateway authorizer "${key}" sets issuers to ${show(issuers)}. Set "issuers" to a list of { issuerUrl, audience, additionalClaims } entries.`,
    )
  }
  if (!issuers.length || issuers.length > MAX_ISSUERS) {
    throw invalid(
      `API Gateway authorizer "${key}" lists ${issuers.length} issuers. A JWT authorizer trusts 1 to ${MAX_ISSUERS} issuers: ${
        issuers.length
          ? 'split them across two authorizers in "provider.apiGateway.authorizers"'
          : 'add one to "issuers"'
      }.`,
    )
  }
  const normalized = issuers.map((issuer, index) => {
    if (!isPlainObject(issuer)) {
      throw invalid(
        `API Gateway authorizer "${key}" sets issuers[${index}] to ${show(issuer)}. Each entry of "issuers" is an object with "issuerUrl", "audience" and optional "additionalClaims".`,
      )
    }
    assertKnownKeys(key, `issuers[${index}].`, issuer, ISSUER_ENTRY_KEYS)
    return normalizeIssuer(key, `issuers[${index}].`, issuer)
  })
  // Intrinsics are compared as written: two identical ones resolve to one
  // issuer.
  const seen = new Set()
  for (const { Issuer } of normalized) {
    const id = typeof Issuer === 'string' ? Issuer : JSON.stringify(Issuer)
    if (seen.has(id)) {
      throw invalid(
        `API Gateway authorizer "${key}" lists issuer ${show(Issuer)} twice. A JWT authorizer lists each issuer once: merge their audiences and claims into one entry of "issuers".`,
      )
    }
    seen.add(id)
  }
  return normalized
}

export default {
  /**
   * Normalizes and validates `provider.apiGateway.authorizers`.
   *
   * @returns {Map<string, object>} the definitions by key, each holding the
   *   logical ID and the `AWS::ApiGateway::Authorizer` properties it compiles to
   *   (without `RestApiId`)
   */
  getJwtAuthorizers() {
    const definitions = this.serverless.service.provider.apiGateway?.authorizers
    const authorizers = new Map()
    if (definitions == null) return authorizers

    for (const [key, definition] of Object.entries(definitions)) {
      if (!AUTHORIZER_KEY_PATTERN.test(key)) {
        throw invalid(
          `API Gateway authorizer "${key}" has a name CloudFormation can't use. Use letters, digits, "-" and "_" only in the keys of "provider.apiGateway.authorizers"; set "name" to give API Gateway a different name.`,
        )
      }
      if (key.toLowerCase() === 'aws_iam') {
        throw invalid(
          `API Gateway authorizer "${key}" uses a reserved name: "authorizer: aws_iam" on an http event means IAM authorization. Rename the JWT authorizer.`,
        )
      }
      if (!isPlainObject(definition)) {
        throw invalid(
          `API Gateway authorizer "${key}" is set to ${show(definition)}. Define it as an object with "type: jwt", "algorithms", "issuerUrl" and "audience".`,
        )
      }
      if (definition.type === undefined) {
        throw invalid(
          `API Gateway authorizer "${key}" has no "type". Set "type: jwt": "provider.apiGateway.authorizers" defines JWT authorizers.`,
        )
      }
      if (
        typeof definition.type !== 'string' ||
        definition.type.toLowerCase() !== 'jwt'
      ) {
        throw invalid(
          `API Gateway authorizer "${key}" sets type to ${show(definition.type)}. "provider.apiGateway.authorizers" defines JWT authorizers: set "type: jwt", and attach Lambda or Cognito authorizers on the http event instead.`,
        )
      }
      assertKnownKeys(key, '', definition, DEFINITION_KEYS)
      if (definition.name !== undefined && !isNonEmptyString(definition.name)) {
        throw invalid(
          `API Gateway authorizer "${key}" sets name to ${show(definition.name)}. Set "name" to a non-empty string, or leave it out to use "${key}".`,
        )
      }

      const logicalId = this.provider.naming.getJwtAuthorizerLogicalId(key)
      if (logicalId.length > MAX_LOGICAL_ID_LENGTH) {
        throw invalid(
          `API Gateway authorizer "${key}" compiles to the CloudFormation resource name "${logicalId}", which is longer than the ${MAX_LOGICAL_ID_LENGTH} characters CloudFormation allows ("-" and "_" each count as several). Shorten the key, and set "name" to keep a longer name in API Gateway.`,
        )
      }

      const identitySource = normalizeIdentitySource(
        key,
        definition.identitySource,
      )
      const algorithms = normalizeAlgorithms(key, definition.algorithms)
      const issuers = normalizeIssuers(key, definition)

      authorizers.set(key, {
        key,
        name: definition.name ?? key,
        logicalId,
        identitySource,
        algorithms,
        issuers,
      })
    }

    // Keys are normalized into logical IDs ("orders" and "Orders" both become
    // "OrdersApiGatewayJwtAuthorizer"); two keys sharing one would compile to
    // one resource, and endpoints written against the first would trust the
    // second one's issuers.
    const keysByLogicalId = new Map()
    for (const { key, logicalId } of authorizers.values()) {
      const other = keysByLogicalId.get(logicalId)
      if (other !== undefined) {
        throw new ServerlessError(
          `JWT authorizers "${other}" and "${key}" in "provider.apiGateway.authorizers" both compile to the CloudFormation resource "${logicalId}". Rename one of them so their names differ by more than case or punctuation.`,
          NAME_CONFLICT,
          { stack: false },
        )
      }
      keysByLogicalId.set(logicalId, key)
    }

    const keysByName = new Map()
    for (const { key, name } of authorizers.values()) {
      const other = keysByName.get(name)
      if (other !== undefined) {
        throw new ServerlessError(
          `"${name}" names both JWT authorizers "${other}" and "${key}" in "provider.apiGateway.authorizers". Rename one of them: API Gateway needs authorizer names to be unique within a REST API.`,
          NAME_CONFLICT,
          { stack: false },
        )
      }
      keysByName.set(name, key)
    }

    return authorizers
  },

  /**
   * Resolves an http event's authorizer to a JWT authorizer, or returns
   * `undefined` when the event uses another kind of authorizer.
   *
   * Resolves `authorizer: <key>`, `{ name: <key> }` and `{ type: jwt, ... }`
   * against `provider.apiGateway.authorizers`, and `{ type: jwt, authorizerId }`
   * to an authorizer created elsewhere.
   */
  resolveJwtAuthorizer(http, functionName) {
    const authorizer = http.authorizer
    const authorizers = this.jwtAuthorizers ?? new Map()
    // Without a "type", a name could mean the JWT authorizer or a function used
    // as a Lambda authorizer (the meaning it has had so far), so a name that is
    // both is rejected rather than silently switched to the JWT authorizer.
    // The MCP plugin adds one function per server, named after the server.
    // Those never serve as Lambda authorizers, so they don't make a name
    // ambiguous.
    const mcpServers =
      this.serverless?.service?.mcp?.servers ??
      this.serverless?.configurationInput?.mcp?.servers
    const isFunction = (name) =>
      Object.hasOwn(Object(this.serverless?.service?.functions), name) &&
      !Object.hasOwn(Object(mcpServers), name)
    const assertNotAlsoFunction = (name) => {
      if (!isFunction(name)) return
      throw new ServerlessError(
        `"${name}" names both a JWT authorizer in "provider.apiGateway.authorizers" and a function in this service, so the http event of function "${functionName}" could mean either. Write "authorizer: { type: jwt, name: ${name} }" to use the JWT authorizer, or rename it.`,
        NAME_CONFLICT,
        { stack: false },
      )
    }
    // A name that matches neither a key nor a function, but a key in another
    // case, is almost certainly a typo for the JWT authorizer: say so rather
    // than report a missing function.
    const assertNotMiscased = (name) => {
      if (typeof name !== 'string' || authorizers.has(name) || isFunction(name))
        return
      const lowerName = name.toLowerCase()
      const key = [...authorizers.keys()].find(
        (candidate) => candidate.toLowerCase() === lowerName,
      )
      if (key === undefined) return
      throw new ServerlessError(
        `Function "${functionName}" references authorizer "${name}", which isn't defined. Did you mean JWT authorizer "${key}" from "provider.apiGateway.authorizers"? Names are case-sensitive.`,
        'UNRECOGNIZED_API_GATEWAY_AUTHORIZER',
        { stack: false },
      )
    }

    if (typeof authorizer === 'string') {
      const definition = authorizers.get(authorizer)
      if (!definition) {
        assertNotMiscased(authorizer)
        return undefined
      }
      assertNotAlsoFunction(authorizer)
      return {
        type: 'JWT',
        name: definition.key,
        jwtLogicalId: definition.logicalId,
      }
    }
    if (!isPlainObject(authorizer)) return undefined

    const type =
      typeof authorizer.type === 'string'
        ? authorizer.type.toUpperCase()
        : undefined
    const name = authorizer.name
    const isDefined = typeof name === 'string' && authorizers.has(name)

    // "authorizerId" attaches an authorizer created elsewhere, whatever its
    // type, so naming a JWT authorizer next to it says two different things.
    if (isDefined && authorizer.authorizerId) {
      throw new ServerlessError(
        `Function "${functionName}" sets both "authorizerId" and JWT authorizer "${name}" on an http event. Remove "authorizerId" to use the authorizer defined in "provider.apiGateway.authorizers", or remove "name" to attach the existing authorizer.`,
        'API_GATEWAY_JWT_AUTHORIZER_UNSUPPORTED_PROPERTY',
        { stack: false },
      )
    }

    if (type !== 'JWT') {
      if (type === undefined && !authorizer.arn && !authorizer.authorizerId) {
        assertNotMiscased(name)
      }
      // An explicit Lambda or Cognito type, or an "arn", says which authorizer
      // is meant, so the reference is left to the Lambda and Cognito rules.
      // validateJwtAuthorizers() then rejects it if its API Gateway name is
      // also a JWT authorizer's.
      if (!isDefined || type !== undefined || authorizer.arn) return undefined
      assertNotAlsoFunction(name)
    }

    const isAttached = type === 'JWT' && Boolean(authorizer.authorizerId)
    if (!isAttached && !isDefined) {
      assertNotMiscased(name)
      throw new ServerlessError(
        name === undefined
          ? `Function "${functionName}" uses a JWT authorizer without a "name". Set "name" to an authorizer defined under "provider.apiGateway.authorizers", or set "authorizerId" to attach an existing one.`
          : `Function "${functionName}" references JWT authorizer ${show(name)}, which isn't defined. Define it under "provider.apiGateway.authorizers", or set "authorizerId" to attach an existing one.`,
        'UNRECOGNIZED_API_GATEWAY_AUTHORIZER',
        { stack: false },
      )
    }

    for (const [property, advice] of Object.entries(UNSUPPORTED_EVENT_KEYS)) {
      if (authorizer[property] === undefined) continue
      const target = isAttached
        ? 'an existing JWT authorizer ("authorizerId")'
        : `JWT authorizer "${name}"`
      throw new ServerlessError(
        `Function "${functionName}" sets "${property}" on an http event that uses ${target}. ${advice(!isAttached)}`,
        'API_GATEWAY_JWT_AUTHORIZER_UNSUPPORTED_PROPERTY',
        { stack: false },
      )
    }

    const resolved = { type: 'JWT', scopes: authorizer.scopes }
    if (isAttached) {
      resolved.authorizerId = authorizer.authorizerId
    } else {
      resolved.name = name
      resolved.jwtLogicalId = authorizers.get(name).logicalId
    }
    return resolved
  },

  /**
   * Checks the JWT authorizers against the rest of the service once its http
   * events are resolved.
   */
  validateJwtAuthorizers(events) {
    const authorizers = this.jwtAuthorizers
    if (!authorizers || !authorizers.size) return

    // A Lambda or Cognito authorizer emitted by this service shares the REST
    // API's authorizer namespace with the JWT authorizers.
    // Only the AWS names can collide there: a key whose "name" differs is not
    // an API Gateway name (references to keys are checked when resolved).
    // JWT authorizers never carry an "arn", so only Lambda and Cognito ones
    // are compared.
    const jwtNames = new Map()
    for (const { key, name } of authorizers.values()) jwtNames.set(name, key)
    for (const { http } of events) {
      const authorizer = http.authorizer
      if (!authorizer || !authorizer.arn) continue
      const key = jwtNames.get(authorizer.name)
      if (key === undefined) continue
      throw new ServerlessError(
        `"${authorizer.name}" names both a JWT authorizer in "provider.apiGateway.authorizers"${
          key === authorizer.name ? '' : ` ("${key}")`
        } and a Lambda or Cognito authorizer. Rename the JWT authorizer: API Gateway needs authorizer names to be unique within a REST API.`,
        NAME_CONFLICT,
        { stack: false },
      )
    }

    if (
      events.length ||
      this.serverless.service.provider.apiGateway.restApiId
    ) {
      return
    }
    // Service proxies (`custom.apiGatewayServiceProxies`) create the REST API
    // without any http event, and can attach these authorizers by id.
    const serviceProxies =
      this.serverless.service.custom?.apiGatewayServiceProxies
    if (Array.isArray(serviceProxies) && serviceProxies.length) return

    throw new ServerlessError(
      `"provider.apiGateway.authorizers" defines authorizers, but this service has no REST API: add an http event, or set "provider.apiGateway.restApiId" and "provider.apiGateway.restApiRootResourceId" to the shared REST API.`,
      'API_GATEWAY_AUTHORIZERS_WITHOUT_REST_API',
      { stack: false },
    )
  },

  /**
   * Emits an `AWS::ApiGateway::Authorizer` of type `JWT` for every definition
   * in `provider.apiGateway.authorizers`, on the service's REST API or the one
   * in `provider.apiGateway.restApiId`.
   */
  compileJwtAuthorizers() {
    if (!this.jwtAuthorizers) return
    const resources =
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources
    for (const authorizer of this.jwtAuthorizers.values()) {
      resources[authorizer.logicalId] = {
        Type: 'AWS::ApiGateway::Authorizer',
        Properties: {
          RestApiId: this.provider.getApiGatewayRestApiId(),
          Name: authorizer.name,
          Type: 'JWT',
          IdentitySource: authorizer.identitySource,
          JwtConfiguration: {
            DefaultAlgorithms: authorizer.algorithms,
            Issuers: authorizer.issuers.map(
              ({ Issuer, Audiences, AdditionalClaims }) => ({
                Issuer,
                Audiences,
                ...(AdditionalClaims && { AdditionalClaims }),
              }),
            ),
          },
        },
      }
    }
  },
}
