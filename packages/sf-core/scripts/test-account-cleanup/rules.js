// Which resources in the shared test accounts are leftovers of integration-test
// runs. A run removes what it deploys, but a cancelled or failed run can't, so
// a scheduled job finds what is left. Only names the suites produce in CI
// match; everything else in the accounts is never selected.

// Nothing younger than this is a leftover: far longer than any test run.
export const CLEANUP_MIN_AGE_MS = 24 * 60 * 60 * 1000

// `<service>-<stage>`, where CI builds the stage from `pr-<login>` or
// `mr-<actor>` (tests/utils/testStageName.js), cut to 5 characters, then `t`
// and a 9-character run id; before that, cut to 10 characters, then `t` and 4
// digits. Some suites derive another stage from it: `p` in front, or `s`, `p`,
// `x` or `fr` at the end.
const CI_STAGE_STACK =
  /^[a-z][a-z0-9-]*-p?(?:pr|mr)-(?:[a-z0-9-]{0,2}t[0-9a-z]{9}|[a-z0-9-]{0,7}t\d{4})(?:s|p|x|fr)?$/

// Stacks the SAM and CloudFormation suites name themselves, followed by a run
// id: four digits in older runs, nine base36 characters today.
export const SAM_STACK_PREFIXES = [
  'cfn-integration-test',
  'sam-existing-integration-test',
  'sam-info-integration-test',
  'sam-integration-test',
  'sam-integration-tests-cloudformation-compose',
  'sam-integration-tests-sam-compose-framework',
  'sam-integration-tests-sam-compose-sam',
  'sam-integration-tests-sam-compose-state-framework',
  'sam-integration-tests-sam-compose-state-sam',
  'sam-tests-run-service-framework',
  'sam-tests-run-service-sam',
  'sam-todo-integration-test',
]
const RUN_ID = /^(?:\d{4}|[0-9a-z]{9})$/

export const isTestStack = (name) => {
  if (CI_STAGE_STACK.test(name)) return true
  return SAM_STACK_PREFIXES.some(
    (prefix) =>
      name.startsWith(`${prefix}-`) &&
      RUN_ID.test(name.slice(prefix.length + 1)),
  )
}

// Statuses a stack can be deleted from; stacks mid-operation are left alone.
const SETTLED_STATUSES = new Set([
  'CREATE_COMPLETE',
  'CREATE_FAILED',
  'DELETE_FAILED',
  'IMPORT_COMPLETE',
  'IMPORT_ROLLBACK_COMPLETE',
  'IMPORT_ROLLBACK_FAILED',
  'ROLLBACK_COMPLETE',
  'ROLLBACK_FAILED',
  'UPDATE_COMPLETE',
  'UPDATE_FAILED',
  'UPDATE_ROLLBACK_COMPLETE',
  'UPDATE_ROLLBACK_FAILED',
])

const isOldEnough = (date, now) =>
  now.getTime() - new Date(date).getTime() >= CLEANUP_MIN_AGE_MS

// Stack summaries (ListStacks) of test stacks untouched for the minimum age.
export const staleStacks = (stacks, now) =>
  stacks.filter(
    (stack) =>
      isTestStack(stack.StackName) &&
      SETTLED_STATUSES.has(stack.StackStatus) &&
      isOldEnough(stack.LastUpdatedTime ?? stack.CreationTime, now),
  )

// State keys are `services/<type>/<stack id>/state/state.json`, with the `/`
// in the stack id replaced by `_` (packages/util/src/state).
const STATE_KEY =
  /^services\/[a-z]+\/(arn:aws:cloudformation:[a-z0-9-]+:\d{12}:stack)_([A-Za-z][A-Za-z0-9-]*)_([0-9a-f-]{36})\/state\/state\.json$/

export const stackIdFromStateKey = (key) => {
  const match = STATE_KEY.exec(key)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : undefined
}

// The region of a stack id, which is an ARN.
export const stackIdRegion = (stackId) => stackId.split(':')[3]

// The status of each state key's stack, from the stack summaries (ListStacks,
// deleted stacks included) of each region listed. One state bucket holds the
// keys of stacks in every region, so each stack is looked up in its own. A
// stack its region's listing lacks maps to null: it was deleted more than 90
// days ago. A stack in a region not listed is left out, so its key is kept.
export const stateStackStatuses = (objects, stacksByRegion) => {
  const statusById = new Map()
  for (const { Key } of objects) {
    const stackId = stackIdFromStateKey(Key)
    if (!stackId || !stacksByRegion.has(stackIdRegion(stackId))) continue
    statusById.set(stackId, null)
  }
  for (const stacks of stacksByRegion.values()) {
    for (const { StackId, StackStatus } of stacks) {
      if (statusById.has(StackId)) statusById.set(StackId, StackStatus)
    }
  }
  return statusById
}

// State objects (ListObjectsV2) whose test stack is gone. `statusById` maps a
// stack id to its status, or to null when CloudFormation no longer knows it.
export const staleStateKeys = (objects, statusById, now) =>
  objects
    .filter(({ Key, LastModified }) => {
      const stackId = stackIdFromStateKey(Key)
      if (!stackId || !isTestStack(stackId.split('/')[1])) return false
      if (!isOldEnough(LastModified, now)) return false
      const status = statusById.get(stackId)
      return status === null || status === 'DELETE_COMPLETE'
    })
    .map(({ Key }) => Key)

// Dev Mode's account-level resources carry a suffix only in live tests (SLS_DEV_TEST_SUFFIX; the
// rule is `testSuffix` in packages/serverless/lib/plugins/aws/dev/attach/naming.js): the broker
// role `serverless-dev-broker-<region>-<suffix>` and the layers `serverless-dev-<arch>-<suffix>`.
// The unsuffixed names belong to real use of Dev Mode in the account and never match.
const DEV_MODE_TEST_SUFFIX = '[a-z0-9]{1,12}'
const AWS_REGION_NAME = '[a-z]{2}(?:-[a-z]+)+-\\d+'
const DEV_MODE_TEST_BROKER_ROLE = new RegExp(
  `^serverless-dev-broker-${AWS_REGION_NAME}-${DEV_MODE_TEST_SUFFIX}$`,
)
const DEV_MODE_TEST_LAYER = new RegExp(
  `^serverless-dev-(?:x86_64|arm64)-${DEV_MODE_TEST_SUFFIX}$`,
)

export const isDevModeTestBrokerRole = (name) =>
  DEV_MODE_TEST_BROKER_ROLE.test(name)
export const isDevModeTestLayer = (name) => DEV_MODE_TEST_LAYER.test(name)

// Roles (ListRoles) of Dev Mode tests created at least the minimum age ago.
export const staleDevModeRoles = (roles, now) =>
  roles.filter(
    ({ RoleName, CreateDate }) =>
      isDevModeTestBrokerRole(RoleName) && isOldEnough(CreateDate, now),
  )

// Layers (ListLayers) of Dev Mode tests whose latest version is at least the minimum age.
export const staleDevModeLayers = (layers, now) =>
  layers.filter(
    ({ LayerName, LatestMatchingVersion }) =>
      isDevModeTestLayer(LayerName) &&
      Boolean(LatestMatchingVersion?.CreatedDate) &&
      isOldEnough(LatestMatchingVersion.CreatedDate, now),
  )

// The relay's payload objects: `serverless-dev-mode/<service>/<stage>/<session>/<object>` in the
// region's deployment bucket. A session deletes what it reads and sweeps its prefix as it stops;
// a killed one cannot, so objects older than the minimum age are leftovers, whoever left them.
export const DEV_MODE_PREFIX = 'serverless-dev-mode/'

export const isDeploymentBucket = (name, region) =>
  name.startsWith(`serverless-framework-deployments-${region}-`)

// A listing the account's role may not make (iam:ListRoles, lambda:ListLayers, s3:ListAllMyBuckets,
// s3:ListBucketVersions): the report says so in that section instead of failing the run.
const ACCESS_DENIED = new Set([
  'AccessDenied',
  'AccessDeniedException',
  'UnauthorizedOperation',
])
export const isAccessDenied = (error) =>
  ACCESS_DENIED.has(error?.name) || error?.$metadata?.httpStatusCode === 403

// Versions and delete markers (ListObjectVersions) under the prefix, at least the minimum age:
// how many, and the `<service>-<stage>` of those a test stack name matches. Other services' names
// are never returned: the report is public.
export const staleDevModeObjects = (entries, now) => {
  const stale = entries.filter(
    ({ Key, LastModified }) =>
      Key?.startsWith(DEV_MODE_PREFIX) && isOldEnough(LastModified, now),
  )
  const testStages = new Set()
  for (const { Key } of stale) {
    const [service, stage] = Key.slice(DEV_MODE_PREFIX.length).split('/')
    if (service && stage && isTestStack(`${service}-${stage}`)) {
      testStages.add(`${service}-${stage}`)
    }
  }
  return { count: stale.length, testStages: [...testStages].sort() }
}
