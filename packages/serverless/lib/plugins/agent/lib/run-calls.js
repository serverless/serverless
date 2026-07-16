// The call runner: given a registry entry (see lib/registry/index.js) plus a
// resource's identifier, executes the entry's declared `calls` and returns the
// merged raw SDK responses keyed by each call's `key`. This is the mechanical
// engine behind `serverless agent inspect`.
//
// KEY DESIGN DECISION -- the injected invoker:
//   The runner does NOT construct AWS clients. It takes an async `invoke`:
//
//     invoke(awsService, commandName, input) => Promise<sdkResponse>
//
//   * awsService  -- the entry's `awsService` string (e.g. 'lambda', 'iam').
//                    build-clients.js's factory maps this to the engine client.
//   * commandName -- the SDK command name WITHOUT the 'Command' suffix
//                    (e.g. 'GetFunction'); matches a callSpec's `method`.
//   * input       -- the fully-built SDK input params object.
//   * resolves to the raw SDK response object (including `$metadata`).
//   * rejects with the SDK error on failure. The invoker is expected to own
//     the retry strategy (429/throttling retried transparently); a 429 that
//     still escapes is captured by the runner as a resource error.
//
//   This cleanly decouples this runner from build-clients.js's client factory:
//   unit tests supply a mock invoke; build-clients.js supplies a real one.
//   This signature IS the contract build-clients.js implements.
//
// PAGINATION DESIGN:
//   `paginate: true` is handled entirely inside the runner -- it invokes the
//   same command repeatedly, threading the SDK's next-page token back in as an
//   input param, until no token remains, then concatenates the list members of
//   each page. The token idiom differs by service, so the runner recognizes
//   all of the AWS v3 forms (NextToken, Marker/IsTruncated, nextToken,
//   position) generically. The invoker stays a single-shot request/response --
//   it does not need to know about pagination. Pagination tokens are stripped
//   from the merged result so output stays byte-stable.

// ---------------------------------------------------------------------------
// Concurrency lanes (per AWS service).
// ---------------------------------------------------------------------------

// Caps concurrent *resources* per lane. apigateway + apigatewayv2 share a
// lane capped at 2 => at most 2 concurrent `GetResources` calls, so the
// tightest quota (GetResources 5 req / 2s, account-wide) is respected; a
// multi-call REST entry can still issue more combined control-plane calls
// than the cap, and the looser combined ~10 rps quota deliberately leans on
// the invoker's retry strategy for residual 429s. Every other
// service uses DEFAULT_LANE_CAP. Kept as a documented constant map so
// adding/tuning a lane is a one-line change.
const DEFAULT_LANE_CAP = 15

const CONCURRENCY_LANES = {
  apigateway: 2,
  apigatewayv2: 2,
}

// apigateway + apigatewayv2 draw from ONE shared pool (the quota is per
// account across both services), so they map to the same lane key.
const SHARED_LANE_KEYS = {
  apigateway: 'apigateway',
  apigatewayv2: 'apigateway',
}

function laneKeyFor(awsService) {
  return SHARED_LANE_KEYS[awsService] || awsService
}

function laneCapFor(awsService) {
  return CONCURRENCY_LANES[awsService] || DEFAULT_LANE_CAP
}

// ---------------------------------------------------------------------------
// Sanctioned transforms (mechanical, deterministic -- the only deviations
// from byte-for-byte raw SDK output the runner is allowed to make).
// ---------------------------------------------------------------------------

// Fields whose values are URL-encoded JSON policy documents (IAM). Decode,
// then JSON.parse. On any failure, leave the original string.
const URL_ENCODED_DOC_FIELDS = new Set([
  'AssumeRolePolicyDocument',
  'PolicyDocument',
  'Document',
])

// Fields whose values are stringified JSON (not URL-encoded). JSON.parse; on
// failure leave the original string.
const JSON_STRING_FIELDS = new Set([
  'Policy', // Lambda GetPolicy.Policy, SQS Attributes.Policy, S3 GetBucketPolicy.Policy, SNS policy attr
  'RedrivePolicy', // SQS Attributes.RedrivePolicy
  'DashboardBody', // CloudWatch GetDashboard.DashboardBody
])

// Non-deterministic + credential-leaking fields to DROP from output entirely.
// Keyed by the PARENT key under which the field appears, so the drop is
// targeted (never a blanket key-name strip). Currently: Lambda GetFunction's
// `Code.Location` -- a freshly presigned S3 URL minted on every call (unique
// X-Amz-Signature / X-Amz-Security-Token / X-Amz-Date each time). Keeping it
// would (a) break the byte-stability contract (two identical inspects differ)
// and (b) leak a short-lived credentialed download URL into inspect output.
// The sibling fields (RepositoryType, ResolvedImageUri, ...) are stable and
// are preserved.
const DROP_FIELDS_UNDER_PARENT = {
  Code: new Set(['Location']),
}

function tryParseJson(str) {
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}

function tryUrlDecodeThenParse(str) {
  let decoded
  try {
    decoded = decodeURIComponent(str)
  } catch {
    // Malformed percent-encoding -- fall back to parsing the raw string.
    decoded = str
  }
  return tryParseJson(decoded)
}

// Recursively walk a response value applying the sanctioned transforms:
//   * Date -> ISO-8601 string
//   * URL-encoded IAM doc fields -> decoded + parsed object
//   * stringified JSON fields -> parsed object
// Returns a transformed copy; never mutates the input.
function transformValue(value, keyName) {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string') {
    if (URL_ENCODED_DOC_FIELDS.has(keyName)) {
      return tryUrlDecodeThenParse(value)
    }
    if (JSON_STRING_FIELDS.has(keyName)) {
      return tryParseJson(value)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformValue(item, undefined))
  }
  if (value && typeof value === 'object') {
    // Drop the sanctioned non-deterministic/credential-leaking fields that live
    // directly under this object's key (e.g. Lambda GetFunction's Code.Location).
    const dropped = DROP_FIELDS_UNDER_PARENT[keyName]
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (dropped && dropped.has(k)) continue
      out[k] = transformValue(v, k)
    }
    return out
  }
  return value
}

/**
 * Applies the sanctioned transforms to a single raw SDK response: strips
 * `$metadata`, converts Dates to ISO-8601, URL-decodes+parses IAM policy docs,
 * and JSON.parses stringified policy/JSON docs (parse failure -> original
 * string kept). The transforms are field-name-driven, not command-driven.
 */
function applyTransforms(response) {
  if (!response || typeof response !== 'object') return response
  const { $metadata, ...rest } = response
  return transformValue(rest, undefined)
}

// ---------------------------------------------------------------------------
// Error classification.
// ---------------------------------------------------------------------------

function statusOf(err) {
  return err && err.$metadata && err.$metadata.httpStatusCode
}

function nameOf(err) {
  return (err && (err.name || err.Code || err.code)) || ''
}

function isNotFound(err) {
  const name = nameOf(err)
  return statusOf(err) === 404 || /NotFound|NoSuch/i.test(name)
}

function isAccessDenied(err) {
  const name = nameOf(err)
  return (
    statusOf(err) === 403 ||
    /AccessDenied|Forbidden|UnauthorizedOperation/i.test(name)
  )
}

function isThrottling(err) {
  const name = nameOf(err)
  return (
    statusOf(err) === 429 ||
    /Throttl|TooManyRequests|Rate ?Exceeded/i.test(name)
  )
}

// A human-readable, class-distinguishable error string for a resource entry.
function describeError(err, { method } = {}) {
  const name = nameOf(err) || 'Error'
  const msg = (err && err.message) || String(err)
  const where = method ? ` calling ${method}` : ''
  if (isThrottling(err)) return `Throttling error${where}: ${name} (${msg})`
  if (isNotFound(err)) return `NotFound error${where}: ${name} (${msg})`
  if (isAccessDenied(err)) return `AccessDenied error${where}: ${name} (${msg})`
  return `Error${where}: ${name} (${msg})`
}

// ---------------------------------------------------------------------------
// Pagination.
// ---------------------------------------------------------------------------

// Recognized (inputToken, outputToken) idioms across AWS SDK v3 clients.
// `truncatedFlag`, when present, must be truthy for another page to be
// fetched (IAM's Marker/IsTruncated idiom).
const PAGINATION_IDIOMS = [
  { input: 'NextToken', output: 'NextToken' },
  { input: 'nextToken', output: 'nextToken' },
  { input: 'Marker', output: 'Marker', truncatedFlag: 'IsTruncated' },
  { input: 'position', output: 'position' },
]

const PAGINATION_TOKEN_KEYS = new Set(
  PAGINATION_IDIOMS.flatMap((i) => [i.input, i.output, i.truncatedFlag]).filter(
    Boolean,
  ),
)

// Given a page response, returns { input, token } for the next page, or null
// when there are no more pages.
function nextPageToken(page) {
  for (const idiom of PAGINATION_IDIOMS) {
    const token = page[idiom.output]
    if (token === undefined || token === null || token === '') continue
    if (idiom.truncatedFlag && !page[idiom.truncatedFlag]) continue
    return { input: idiom.input, token }
  }
  return null
}

// Merge a follow-up page into the accumulated response. List-valued fields are
// concatenated; scalar fields take the latest page's value. Pagination token
// keys are dropped from the merged result.
function mergePage(acc, page) {
  for (const [k, v] of Object.entries(page)) {
    if (PAGINATION_TOKEN_KEYS.has(k)) continue
    if (Array.isArray(v) && Array.isArray(acc[k])) {
      acc[k] = acc[k].concat(v)
    } else {
      acc[k] = v
    }
  }
  return acc
}

// Runs a command with pagination, invoking repeatedly and merging pages.
// Returns the merged RAW response (transforms applied by the caller).
async function invokePaginated(invoke, awsService, method, baseInput) {
  let input = { ...baseInput }
  let acc = null
  // Bound the loop defensively against a misbehaving token that never clears.
  for (let guard = 0; guard < 10000; guard += 1) {
    const page = await invoke(awsService, method, input)
    if (acc === null) {
      acc = {}
      mergePage(acc, page)
    } else {
      mergePage(acc, page)
    }
    const next = nextPageToken(page)
    if (!next) break
    input = { ...baseInput, [next.input]: next.token }
  }
  return acc
}

// ---------------------------------------------------------------------------
// Input building.
// ---------------------------------------------------------------------------

// Builds the SDK input object for a callSpec from the resource identifier:
//   * `params(identifier)` -> use its return value verbatim (custom/account-wide);
//   * `input` name + string/number identifier -> { [input]: identifier };
//   * object identifier (multi-input, no `input`) -> spread the object.
function buildInput(callSpec, identifier) {
  if (typeof callSpec.params === 'function') {
    return callSpec.params(identifier)
  }
  if (callSpec.input) {
    return { [callSpec.input]: identifier }
  }
  if (identifier && typeof identifier === 'object') {
    return { ...identifier }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Fan-out.
// ---------------------------------------------------------------------------

function getDottedPath(obj, path) {
  return path
    .split('.')
    .reduce((acc, seg) => (acc == null ? acc : acc[seg]), obj)
}

// Executes one callSpec's `fanOut`: iterate the list response's items and
// perform the per-item follow-up call(s), returning an array of per-item
// (transformed) results.
//
// SOURCE OF THE ITEMS -- two shapes:
//   * DEFAULT: the items come from THIS call's OWN list response (`listResponse`
//     built from the parent method, e.g. IAM ListRolePolicies, Cognito
//     ListUserPoolClients).
//   * `fanOut.overKey`: the items come from a SIBLING call's already-fetched
//     result stored under that key (e.g. apigatewayv2 `routeResponses` fans out
//     over the `routes` call's Items). In this case the callSpec has no parent
//     method of its own -- `listResponse` is the sibling's result, threaded in
//     by the caller (`runResource`), which runs overKey calls AFTER their
//     source siblings have resolved. `listResultKey` reads the list field off
//     that sibling result (e.g. `Items`).
//
// `identifier` is the resource identifier; for a single-hop fan-out whose
// `itemField` is omitted (IAM inline policies), the list item itself is the
// value for `fanOut.itemInput`, AND any identifier-derived params (the outer
// call's `input`) are reused so e.g. RoleName still accompanies PolicyName.
//
// `fanOut.extraInput(identifier)`, when present, is an explicit escape hatch
// for the case `itemField` alone can't express: a first-hop call that needs
// BOTH a per-item field AND a constant param derived from the outer
// identifier (Cognito's ListUserPoolClients -> DescribeUserPoolClient{
// UserPoolId, ClientId } -- ClientId comes from the item, UserPoolId is the
// resource identifier, unlike the implicit `carriedFromIdentifier` reuse
// below which only fires when `itemField` is ABSENT). Return value is merged
// into the first-hop input; keys here win over the item value on collision
// (not expected to collide with `itemInput` in practice).
//
// All-or-nothing: this Promise.all rejects as a whole if ANY item's
// follow-up call rejects, losing the other items' results too; the parent
// callSpec then throws and the resource is marked errored (see `runCall`).
// Per-item error capture (partial fan-out results on partial failure) is a
// deferred enhancement, not current behavior.
async function runFanOut({
  invoke,
  awsService,
  callSpec,
  identifier,
  listResponse,
}) {
  const { fanOut } = callSpec
  const items = listResponse[fanOut.listResultKey] || []

  // The per-item method: `fanOut.method` when the fan-out has its own parent
  // list method, or the callSpec's `method` for an overKey call (which has no
  // parent list call of its own -- the callSpec's method IS the per-item one).
  const fanOutMethod = fanOut.method || callSpec.method

  // Params carried over from the outer identifier (reused on the 1st hop when
  // the fan-out does not read a field off the item, e.g. RoleName+PolicyName).
  const carriedFromIdentifier =
    !fanOut.itemField && callSpec.input ? { [callSpec.input]: identifier } : {}

  // Explicit constant params for the 1st hop (see extraInput doc above) --
  // used instead of/alongside carriedFromIdentifier when the fan-out DOES
  // read a field off the item but still needs an outer constant too.
  const extraInput =
    typeof fanOut.extraInput === 'function' ? fanOut.extraInput(identifier) : {}

  return Promise.all(
    items.map(async (item) => {
      const itemValue = fanOut.itemField ? item[fanOut.itemField] : item
      const firstInput = {
        ...carriedFromIdentifier,
        ...extraInput,
        [fanOut.itemInput]: itemValue,
      }
      const firstRaw = await invoke(awsService, fanOutMethod, firstInput)
      let merged = applyTransforms(firstRaw)

      if (fanOut.then) {
        const { then } = fanOut
        const resolved = getDottedPath(firstRaw, then.fromResult.resultField)
        const thenInput = {
          [then.itemInput]: itemValue,
          [then.fromResult.input]: resolved,
        }
        const thenRaw = await invoke(awsService, then.method, thenInput)
        const thenTransformed = applyTransforms(thenRaw)
        merged = { ...merged, ...thenTransformed }
      }
      return merged
    }),
  )
}

// ---------------------------------------------------------------------------
// Single callSpec.
// ---------------------------------------------------------------------------

// Runs one callSpec. Returns { key, value } to store, or { key, omit: true }
// when an optional call 404s. Throws on a non-optional failure (the caller
// captures it as the resource error).
//
// `siblingResults` (key -> already-stored value) is consulted only for a
// `fanOut.overKey` call, whose items come from a SIBLING call's result rather
// than a list method of its own; the caller guarantees the source sibling has
// already resolved before this runs (see runResource's two-phase ordering).
async function runCall({
  invoke,
  awsService,
  callSpec,
  identifier,
  siblingResults = {},
}) {
  try {
    // A `fanOut.overKey` call has no parent method of its own: its "list
    // response" is the sibling call's already-fetched result. Everything else
    // invokes its own `method` (paginated or single-shot) to get the list.
    let listResponse
    if (callSpec.fanOut && callSpec.fanOut.overKey) {
      listResponse = siblingResults[callSpec.fanOut.overKey] || {}
    } else {
      const input = buildInput(callSpec, identifier)
      if (callSpec.paginate) {
        listResponse = await invokePaginated(
          invoke,
          awsService,
          callSpec.method,
          input,
        )
      } else {
        listResponse = await invoke(awsService, callSpec.method, input)
      }
    }

    // Fan-out: `fanOut` describes the per-item follow-up. The list response
    // (this call's own, or a sibling's for `overKey`) is consumed to drive the
    // fan-out; the stored value is the assembled array of per-item results.
    if (callSpec.fanOut) {
      const value = await runFanOut({
        invoke,
        awsService,
        callSpec,
        identifier,
        listResponse,
      })
      return { key: callSpec.key, value }
    }

    return { key: callSpec.key, value: applyTransforms(listResponse) }
  } catch (err) {
    if (callSpec.optional && isNotFound(err)) {
      return { key: callSpec.key, omit: true }
    }
    throw Object.assign(err, { __method: callSpec.method })
  }
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Runs every callSpec in a registry entry for one resource, concurrently, and
 * returns the merged result keyed by each call's `key`. Sanctioned transforms
 * are applied to every response. `optional` 404s omit their key. A non-optional
 * failure (404 for a deleted resource, AccessDenied, residual 429) is captured
 * on the returned object as `{ error }` -- the batch is never aborted -- while
 * any calls that DID succeed keep their data.
 *
 * @param {object}   args
 * @param {object}   args.entry       registry entry (awsService + calls[]).
 * @param {*}        args.identifier   resource identifier (string | number |
 *                                     multi-input object) from entry.identifier.
 * @param {function} args.invoke       invoke(awsService, commandName, input) =>
 *                                      Promise<sdkResponse>.
 * @returns {Promise<object>} merged { [key]: data, error? }.
 */
async function runResource({ entry, identifier, invoke }) {
  const result = {}
  let firstError = null

  // A `fanOut.overKey` call depends on a SIBLING call's result (it fans out
  // over that sibling's items), so it must run AFTER its source. We run in two
  // phases: independent calls first (concurrently), then overKey calls reading
  // from the collected results. Phase 1 is the common case (every non-overKey
  // call); phase 2 fires only when an entry declares an overKey fan-out (today
  // just apigatewayv2's route responses).
  const independentCalls = entry.calls.filter(
    (callSpec) => !(callSpec.fanOut && callSpec.fanOut.overKey),
  )
  const overKeyCalls = entry.calls.filter(
    (callSpec) => callSpec.fanOut && callSpec.fanOut.overKey,
  )

  const collect = (outcome) => {
    if (outcome.error) {
      if (!firstError) firstError = outcome.error
      return
    }
    if (outcome.omit) return
    result[outcome.key] = outcome.value
  }

  const runCallSafely = async (callSpec) => {
    try {
      return await runCall({
        invoke,
        awsService: entry.awsService,
        callSpec,
        identifier,
        siblingResults: result,
      })
    } catch (err) {
      return { error: err }
    }
  }

  const settledIndependent = await Promise.all(
    independentCalls.map(runCallSafely),
  )
  for (const outcome of settledIndependent) collect(outcome)

  // Phase 2: overKey calls, now that their source siblings are in `result`.
  if (overKeyCalls.length) {
    const settledOverKey = await Promise.all(overKeyCalls.map(runCallSafely))
    for (const outcome of settledOverKey) collect(outcome)
  }

  if (firstError) {
    result.error = describeError(firstError, { method: firstError.__method })
  }
  return result
}

// A minimal concurrency limiter: caps the number of in-flight tasks. Preserves
// input order in the returned results array.
async function runWithCap(items, cap, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function pump() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  const runners = []
  const workers = Math.min(cap, items.length)
  for (let i = 0; i < workers; i += 1) runners.push(pump())
  await Promise.all(runners)
  return results
}

/**
 * Describes many resources concurrently, respecting per-AWS-service
 * concurrency lanes (CONCURRENCY_LANES; apigateway + apigatewayv2 share one
 * small paced lane, everything else uses DEFAULT_LANE_CAP). Resources are
 * grouped into lanes by their entry's `awsService`; each lane runs its members
 * capped, and lanes run in parallel with each other. Results are returned
 * positionally aligned with the input `resources` array. A per-resource
 * failure is captured on that resource's result and never aborts the batch.
 *
 * @param {object}   args
 * @param {Array<{entry, identifier}>} args.resources
 * @param {function} args.invoke  invoke(awsService, commandName, input).
 * @returns {Promise<Array<object>>} per-resource merged results (same order).
 */
async function runMany({ resources, invoke }) {
  const results = new Array(resources.length)

  // Group resource indices by lane key.
  const lanes = new Map()
  resources.forEach((resource, index) => {
    const laneKey = laneKeyFor(resource.entry.awsService)
    if (!lanes.has(laneKey)) lanes.set(laneKey, [])
    lanes.get(laneKey).push(index)
  })

  await Promise.all(
    [...lanes.entries()].map(async ([, indices]) => {
      // Cap is determined by the (shared) lane's smallest member cap; for the
      // apigateway lane both services carry cap 2.
      const cap = Math.min(
        ...indices.map((i) => laneCapFor(resources[i].entry.awsService)),
      )
      await runWithCap(indices, cap, async (index) => {
        const { entry, identifier } = resources[index]
        results[index] = await runResource({ entry, identifier, invoke })
      })
    }),
  )

  return results
}

// ---------------------------------------------------------------------------
// IAM-inline dedup.
// ---------------------------------------------------------------------------

/**
 * Derives an IAM role NAME from its ARN. Partition-agnostic (works for
 * arn:aws, arn:aws-cn, arn:aws-us-gov, or any other partition token) since it
 * only relies on the ARN's `/`-delimited resource path, not the partition
 * segment: the role name is always the LAST path segment after `role/` (a
 * role can carry a path, e.g. `role/some/path/my-role`).
 */
function roleNameFromArn(arn) {
  const afterRole = arn.split(':role/')[1] || ''
  const segments = afterRole.split('/')
  return segments[segments.length - 1]
}

/**
 * The IAM-inline dedup step: given the already-expanded `resources` payload
 * (category -> logicalId -> data, as produced by runMany + the inspect
 * plugin's bucketing), reads each function's execution role ARN off its raw
 * GetFunction result (`configuration.Configuration.Role`), describes that
 * role via the IAM registry entry's own `calls` (reusing runResource so the
 * inline/attached policy fan-out logic is never duplicated), and attaches
 * the described role under `resources.functions.<logicalId>.role`. Mutates
 * `resources` in place (the function entries gain a `role` key) and also
 * returns it for convenience.
 *
 * Shared-role caching: multiple functions commonly point at the same
 * execution role (e.g. the default IamRoleLambdaExecution). Each UNIQUE role
 * name is described only ONCE; every function using it gets a reference to
 * the same described-role result object.
 *
 * Error handling: a role-describe failure (AccessDenied, NoSuchEntity -- an
 * imported/external role, etc.) attaches `{ error }` under that function's
 * `.role`; the function entry itself is untouched otherwise, and other
 * functions are unaffected. A function whose result has no resolvable
 * `Configuration.Role` (e.g. its own GetFunction call errored) is skipped --
 * no `.role` key is added.
 *
 * @param {object}   args
 * @param {object}   args.resources  the expand-mode resources payload
 *                                   (category -> logicalId -> data).
 * @param {function} args.invoke     invoke(awsService, commandName, input) =>
 *                                   Promise<sdkResponse>, forwarded to
 *                                   runResource for the role describe.
 * @param {object}   args.iamEntry   the registry entry for AWS::IAM::Role
 *                                   (its `awsService` + `calls` are reused
 *                                   verbatim -- see registry/iam.js).
 * @returns {Promise<object>} `resources` (mutated in place).
 */
async function inlineFunctionRoles({ resources, invoke, iamEntry }) {
  const functions = resources.functions
  if (!functions) return resources

  const roleNameByLogicalId = new Map()
  for (const [logicalId, data] of Object.entries(functions)) {
    const roleArn =
      data && data.configuration && data.configuration.Configuration
        ? data.configuration.Configuration.Role
        : undefined
    if (!roleArn) continue
    roleNameByLogicalId.set(logicalId, roleNameFromArn(roleArn))
  }

  const uniqueRoleNames = [...new Set(roleNameByLogicalId.values())]
  const describedByRoleName = new Map(
    await Promise.all(
      uniqueRoleNames.map(async (roleName) => [
        roleName,
        await runResource({ entry: iamEntry, identifier: roleName, invoke }),
      ]),
    ),
  )

  for (const [logicalId, roleName] of roleNameByLogicalId) {
    functions[logicalId].role = describedByRoleName.get(roleName)
  }

  return resources
}

export {
  runResource,
  runMany,
  applyTransforms,
  inlineFunctionRoles,
  roleNameFromArn,
  CONCURRENCY_LANES,
  DEFAULT_LANE_CAP,
}
