/**
 * The result every finite Dev Mode command returns, and its one JSON form: with `--json` the
 * envelope is the only thing on stdout; human text always goes to stderr. `status` sets the exit
 * code: ok 0, error 1 (3 for an incomplete restore or attach), action_required 1 (a person must
 * act: agents must not run `next` then), timeout 124. `reason` is a code from the registry the
 * docs publish; the CLI error codes Dev Mode throws map to it here.
 */
import { jsonFlagOn } from '@serverless/util/src/cli/json-flag.js'
import { cliCommand, commandFor, shellWord, shownPath } from './cli-names.js'
import { withConfig } from '../../lib/cli-command.js'

/** CLI error codes → reasons. A code missing here becomes reason 'error' with its message. */
export const REASONS = Object.freeze({
  DEV_MODE_APPROVE_NEEDS_TERMINAL: 'approval_needs_terminal',
  DEV_MODE_AWS_CREDENTIALS_INVALID: 'credentials_expired',
  DEV_MODE_AWS_IDENTITY_UNKNOWN: 'aws_credentials_missing',
  DEV_MODE_AWS_UNREACHABLE: 'network_blocked',
  DEV_MODE_BROKER_BOUNDARY_INVALID: 'error',
  DEV_MODE_BROKER_CREATE_DENIED: 'permission_denied',
  DEV_MODE_BROKER_FOREIGN: 'error',
  DEV_MODE_BROKER_MODIFIED: 'error',
  // iam:GetRole on the broker role was denied; UNAVAILABLE is the role created by someone else
  // at the same moment.
  DEV_MODE_BROKER_READ_DENIED: 'permission_denied',
  DEV_MODE_BROKER_UNAVAILABLE: 'error',
  DEV_MODE_CONFIG_FILE_UNREADABLE: 'error',
  DEV_MODE_IDENTITY_ACCESS_DENIED: 'permission_denied',
  DEV_MODE_IOT_ACCESS_DENIED: 'permission_denied',
  DEV_MODE_IOT_CONNECT_DENIED: 'permission_denied',
  DEV_MODE_IOT_UNREACHABLE: 'network_blocked',
  DEV_MODE_LAYER_ACCESS_DENIED: 'permission_denied',
  DEV_MODE_LAYER_MISSING: 'layers_missing',
  DEV_MODE_LOCAL_RUNTIME_FAILED: 'error',
  DEV_MODE_NOTHING_TO_ATTACH: 'nothing_to_attach',
  DEV_MODE_REGION_NO_BROKER: 'region_no_broker',
  DEV_MODE_STACK_ACCESS_DENIED: 'permission_denied',
  DEV_MODE_STAGE_PROTECTED: 'stage_protected',
  DEV_MODE_UNKNOWN_FUNCTION: 'error',
  DEV_MODE_UPDATE_TIMEOUT: 'error',
  DEV_RESTORE_ACCESS_DENIED: 'permission_denied',
  DEV_SETUP_ACCESS_DENIED: 'permission_denied',
  DEV_SETUP_AWS_CREDENTIALS_MISSING: 'aws_credentials_missing',
  DEV_SETUP_CONCURRENT: 'error',
  DEV_SETUP_INVALID_PATH: 'error',
  DEV_SETUP_PATH_MISMATCH: 'error',
  // Added with the session record and the finite commands.
  DEV_MODE_SESSION_RUNNING: 'session_running',
  DEV_MODE_CONTROL_UNAVAILABLE: 'control_unavailable',
  // A --detach session that could not write its record: the launcher answers detach_failed.
  DEV_MODE_RECORD_UNAVAILABLE: 'error',
  DEV_MODE_INVALID_OPTION_COMBINATION: 'invalid_option_combination',
  // An option value that is malformed or out of range (a duration, --for, --limit).
  DEV_MODE_INVALID_DURATION: 'invalid_option_value',
  DEV_MODE_INVALID_WAIT_FOR: 'invalid_option_value',
  DEV_MODE_INVALID_LIMIT: 'invalid_option_value',
  // A replay of a web request whose web app does not run on this machine in the session.
  DEV_MODE_WEB_APP_NOT_LOCAL: 'web_app_not_local',
  // Web apps. The role's trust cannot be widened for them, or their web functions cannot be read:
  // a person grants the permission. A revision or endpoint AWS Lambda could not make active (or
  // not in time), and the other web app errors, are errors whose message says what to do.
  DEV_MODE_BROKER_UPDATE_DENIED: 'permission_denied',
  DEV_MODE_WEB_ACCESS_DENIED: 'permission_denied',
  DEV_MODE_UNKNOWN_WEB_APP: 'error',
  DEV_MODE_OPTION_CONFLICT: 'invalid_option_combination',
  DEV_MODE_REVISION_FAILED: 'error',
  DEV_MODE_REVISION_TIMEOUT: 'error',
  DEV_MODE_REVISION_NOT_FOUND: 'error',
  DEV_MODE_ENDPOINT_FAILED: 'error',
  DEV_MODE_ENDPOINT_TIMEOUT: 'error',
  DEV_MODE_ENDPOINT_NOT_FOUND: 'error',
  DEV_MODE_ENDPOINT_DELETING: 'error',
  DEV_MODE_WEB_APP_ENVIRONMENT_TOO_LARGE: 'error',
  DEV_MODE_WEB_REVISION_NOT_FOUND: 'error',
  DEV_MODE_WEB_APP_STILL_ATTACHED: 'error',
  DEV_MODE_WEB_RESTORE_REVISION_GONE: 'error',
  DEV_MODE_WEB_BRIDGE_MISSING: 'error',
  // Option values and the CLI's own errors that reach a Dev Mode command.
  INVALID_DEV_MODE_OPTION: 'error',
  INVALID_DEV_ON_EXIT_OPTION: 'error',
  AUTH_REQUIRED: 'signin_required',
  AWS_CREDENTIALS_MISSING: 'aws_credentials_missing',
  AWS_CREDENTIALS_NOT_FOUND: 'aws_credentials_missing',
  AWS_CREDENTIALS_EXPIRED: 'credentials_expired',
})

/** An error's reason: its own `reason`, else its code's, else 'error'. */
export const reasonOf = (error) =>
  (typeof error?.reason === 'string' && error.reason) ||
  REASONS[error?.code] ||
  'error'

export const ENVELOPE_VERSION = 1

/** Reasons a person has to act on (sign in, refresh credentials, grant a permission, confirm). */
export const ACTION_REQUIRED = Object.freeze([
  'approval_needs_terminal',
  'signin_required',
  'aws_credentials_missing',
  'credentials_expired',
  'permission_denied',
  'network_blocked',
  'broker_missing',
])

/** Whether `reason` is one a person has to act on (status `action_required`). */
export const isActionRequired = (reason) => ACTION_REQUIRED.includes(reason)

/** The foreground session has no one result to print; its events are in the event log. */
export const jsonNeedsFinite = () =>
  `--json works with --detach or --dry-run; a running session writes its events to ${shownPath('.serverless/dev/session.ndjson')}.`

// A profile name read from a record on disk counts only as a non-empty string: anything else
// (a hand-edited or corrupt record) is left out rather than failing the command that reads it.
const isProfileName = (value) => typeof value === 'string' && value !== ''

/**
 * The options that name a session's scope (`scope`: its session file, its `session.starting`
 * record, or `{ stage, region, aws_profile }` named as those records name them): `--stage`,
 * `--region` and the `--aws-profile` it was started with, each only when the scope names it.
 */
export const scopeFlags = (scope) => [
  ...(scope?.stage ? [`--stage ${shellWord(String(scope.stage))}`] : []),
  ...(scope?.region ? [`--region ${shellWord(String(scope.region))}`] : []),
  ...(isProfileName(scope?.aws_profile)
    ? [`--aws-profile ${shellWord(scope.aws_profile)}`]
    : []),
]

/**
 * `serverless dev restore` for the scope of a session (see `scopeFlags`), and one `--function`
 * for `functionKey` or each of `functionKeys` when given, one `--web-app` for each of `webAppKeys`:
 * without a scope `dev restore` restores the service's default stage, with the default credentials.
 * A scope that names none of them gives the plain command.
 */
export const restoreCommand = (
  scope,
  {
    functionKey,
    functionKeys = functionKey ? [functionKey] : [],
    webAppKeys = [],
  } = {},
) => {
  const command = [
    'dev restore',
    ...scopeFlags(scope),
    ...functionKeys.map((key) => `--function ${shellWord(String(key))}`),
    ...webAppKeys.map((key) => `--web-app ${shellWord(String(key))}`),
  ].join(' ')
  // Hooks of deploy, remove and rollback name the Compose service and the --config of their run;
  // Dev Mode's own commands, the ones they were started with.
  return scope && 'compose_service' in scope
    ? withConfig(commandFor(scope.compose_service, command), scope.config)
    : cliCommand(command)
}

/** The `--aws-profile` a command was run with (`options`), as a scope names it; none: undefined. */
export const awsProfileOf = (options) => {
  const profile = options?.['aws-profile']
  return typeof profile === 'string' && profile ? profile : undefined
}

const RESTORE_WHEN =
  'to restore the functions a session that did not stop cleanly may have left attached'
/** The next step after a session (`scope`, as `restoreCommand` takes it) that may have left functions attached. */
export const restoreNext = (scope) => ({
  command: restoreCommand(scope),
  when: RESTORE_WHEN,
})
/** Whether a `next` step is the one `restoreNext` gives. */
export const isRestoreNext = (step) => step?.when === RESTORE_WHEN
/** What a person reads when `serverless dev restore` (`command`) is the next step. */
export const restoreLine = (command) =>
  `Run "${command}" to restore any function it left in Dev Mode.`
/** For a session no command can reach (`control_unavailable`): the restore after Ctrl+C there. */
export const restoreAfterStopNext = (scope) => ({
  command: restoreCommand(scope),
  when: 'after stopping that session with Ctrl+C in its terminal',
})

const INCOMPLETE = new Set(['restore_incomplete', 'attach_incomplete'])
const TOP = ['reason', 'message', 'user_action_required', 'next', 'cursor']

/**
 * The result for an error: `{ status, reason, message, user_action_required?, next?, ...fields }`.
 * `fields` add the command's own fields; the status and the reason are always the error's.
 */
export const errorResult = (error, fields = {}) => {
  const reason = reasonOf(error)
  const actionRequired = isActionRequired(reason)
  const status = actionRequired ? 'action_required' : 'error'
  const result = {
    status,
    reason,
    message: String(error?.message ?? error),
    ...(actionRequired && { user_action_required: true }),
    ...(error?.next && { next: error.next }),
    ...fields,
  }
  // Set again after the fields: the keys keep their place, the values stay the error's.
  result.status = status
  result.reason = reason
  return result
}

/** `{ v, status, reason?, message?, user_action_required?, next?, cursor?, ...command fields }`. */
export const envelope = (fields = {}) => {
  const out = { v: ENVELOPE_VERSION, status: fields.status ?? 'ok' }
  for (const key of TOP) {
    const value =
      key === 'user_action_required' && out.status === 'action_required'
        ? true
        : fields[key]
    if (value !== undefined) out[key] = value
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && !(key in out) && key !== 'v') out[key] = value
  }
  return out
}

export const exitCodeOf = (result) => {
  switch (result?.status ?? 'ok') {
    case 'ok':
      return 0
    case 'timeout':
      return 124
    case 'error':
      return INCOMPLETE.has(result.reason) ? 3 : 1
    default:
      return 1
  }
}

/** Whether `--json` asks for the envelope: `--json`, `--json=1` or `--json=true`, not `--json=false`. */
export const jsonRequested = (options = {}) => jsonFlagOn(options.json)

const LEVELS = new Set([
  'notice',
  'success',
  'warning',
  'error',
  'aside',
  'blankLine',
])
/**
 * Human text as `[level, text]` pairs: a string is one notice; a list may mix both forms.
 * `['blankLine']` is a blank line between two sections.
 */
const humanLines = (human) =>
  []
    .concat(human ?? [])
    .map((line) =>
      Array.isArray(line) && LEVELS.has(line[0])
        ? line
        : ['notice', String(line)],
    )

/**
 * Prints a result: the human text through the logger (stderr), then with `json` the envelope as
 * one line on `stdout`. Returns the exit code.
 */
export const printResult = ({
  json,
  result,
  human,
  logger,
  stdout = process.stdout,
}) => {
  for (const [level, text] of humanLines(human)) logger[level](text)
  if (json) stdout.write(`${JSON.stringify(envelope(result))}\n`)
  return exitCodeOf(result)
}
