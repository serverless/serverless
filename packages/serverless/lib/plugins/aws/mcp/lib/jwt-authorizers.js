// The api-gateway compiler's own JWT authorizer logic, read from here rather
// than mirrored: an MCP route compiles into the same API Gateway method as an
// http event, so "is this authorizer reference a JWT authorizer" has to mean
// one thing in both places. The compiler's methods are written against its
// plugin instance (`this`), so each call below hands them the few fields they
// read and nothing else.
import compilerJwtAuthorizers from '../../package/compile/events/api-gateway/lib/jwt-authorizers.js'

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The keys of `provider.apiGateway.authorizers`, each with the logical id the
 * compiler gives it - the one part of a definition the reference resolution
 * reads. Definitions are not validated here: a malformed one is reported by
 * the compiler, against its own path.
 */
const referenceTargetsOf = (definitions, naming) =>
  new Map(
    (isPlainObject(definitions) ? Object.keys(definitions) : []).map((key) => [
      key,
      { key, logicalId: naming?.getJwtAuthorizerLogicalId(key) },
    ]),
  )

/**
 * Resolves an authorizer reference exactly as an http event's is resolved:
 * `{ type: 'JWT', name, jwtLogicalId }` for a provider JWT authorizer,
 * `{ type: 'JWT', authorizerId }` for an existing one attached by id, or
 * `undefined` for any other kind of authorizer.
 *
 * Throws the compiler's own errors for a reference it would refuse, worded
 * against `functionName`, which for an MCP route is the server name.
 * `functions` is the service's `functions`: a name that is both a JWT
 * authorizer and a function is refused, as it is on an http event.
 */
export const resolveJwtReference = ({
  authorizer,
  functionName,
  definitions,
  naming,
  functions,
}) =>
  compilerJwtAuthorizers.resolveJwtAuthorizer.call(
    {
      jwtAuthorizers: referenceTargetsOf(definitions, naming),
      serverless: { service: { functions: functions ?? {} } },
    },
    { authorizer },
    functionName,
  )

/**
 * The same resolution as a yes/no question that never throws, for readers
 * that classify configuration rather than validate it.
 */
export const isJwtReference = (authorizer, definitions) => {
  try {
    return (
      resolveJwtReference({ authorizer, functionName: '', definitions }) !==
      undefined
    )
  } catch {
    return false
  }
}

/**
 * One provider JWT authorizer, normalized and validated by the compiler:
 * `{ key, name, issuers: [{ Issuer, Audiences, AdditionalClaims }], ... }`.
 *
 * Every definition is validated, not only the one asked for, because that is
 * what the compiler does with them; an invalid one raises the compiler's own
 * error here, earlier than it otherwise would.
 */
export const normalizedJwtAuthorizer = ({ key, definitions, naming }) =>
  compilerJwtAuthorizers.getJwtAuthorizers
    .call({
      serverless: {
        service: { provider: { apiGateway: { authorizers: definitions } } },
      },
      provider: { naming },
    })
    .get(key)
