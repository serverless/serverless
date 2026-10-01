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
