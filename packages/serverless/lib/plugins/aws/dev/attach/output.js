/**
 * Every line Dev Mode prints about attach and restore. Function modes are only ever "dev",
 * "deployed" or "skipped"; the session is "on" or "off".
 */
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { formatServiceOutputs } from '../../../../cli/write-service-outputs.js'
import { listNames } from '../local/messages.js'
import { BROKER_POLICY_NAME, layerName } from './naming.js'
import { ENV_UNREADABLE_WHY } from './undo-record.js'
import { parseIdleTimeout } from './session-idle.js'
import { restoreCommand } from '../commands/envelope.js'
import { cliCommand, commandFor, shownPath } from '../commands/cli-names.js'
import { withConfig } from '../../lib/cli-command.js'

export const functionsWord = (n) => `${n} function${n === 1 ? '' : 's'}`

/**
 * How long ago a time in seconds was. Under a minute it reads "less than a minute ago", or with
 * `seconds` the seconds themselves ("12 s ago").
 */
export const formatAgo = (
  atSeconds,
  nowMs,
  { seconds: exact = false } = {},
) => {
  if (!atSeconds) return 'at an unknown time'
  const seconds = Math.max(0, Math.floor(nowMs / 1000 - atSeconds))
  if (seconds < 60) return exact ? `${seconds} s ago` : 'less than a minute ago'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86400)} d ago`
}

/** How long ago an ISO timestamp was, to the second ("12 s ago"); null when it reads as no time. */
export const timestampAgo = (ts, nowMs) => {
  const ms = Date.parse(ts ?? '')
  return Number.isFinite(ms)
    ? formatAgo(ms / 1000, nowMs, { seconds: true })
    : null
}

/** `seconds` in the outcome lines' form, `(4.1s)`, in the logger's aside style. */
export const asideSeconds = (seconds) => style.aside(`(${seconds.toFixed(1)}s)`)

const messagesOf = (notes) => (notes ?? []).map((note) => note.message)
const whyOf = (row) => row.why ?? messagesOf(row.notes).join('; ')

/** The function table, its header row in the logger's aside style. */
export const renderModeTable = (rows) => {
  const lines = [
    ['Function', 'Mode', 'Why'],
    ...rows.map((row) => [row.function, row.mode, whyOf(row)]),
  ]
  const nameWidth = Math.max(...lines.map(([name]) => name.length))
  const modeWidth = Math.max(...lines.map(([, mode]) => mode.length))
  return lines
    .map(([name, mode, why]) =>
      `${name.padEnd(nameWidth)}  ${mode.padEnd(modeWidth)}  ${why}`.trimEnd(),
    )
    .map((line, index) => (index === 0 ? style.aside(line) : line))
    .join('\n')
}

/**
 * Whether the function table says something the ready line does not: a function that does not
 * run here, or one that runs here with a note (taken over, a VPC). Picking up its own earlier
 * session's functions is not one: that goes to the debug log.
 */
export const tableWorthShowing = (rows) =>
  rows.some(
    (row) =>
      row.mode !== 'dev' ||
      (row.notes ?? []).some((note) => note.reason !== 'reattached'),
  )

/** The account setup step for an existing broker, by `brokerPolicyState`; none when in place. */
const BROKER_POLICY_STEPS = {
  missing: 'repair_broker_policy',
  outdated: 'update_broker_policy',
}

export const buildPlan = ({
  stage,
  deployFirst,
  brokerName,
  brokerExists,
  brokerPolicy = 'present',
  missingLayers,
  devRows,
}) => ({
  stage,
  deployFirst,
  accountSetup: [
    ...(brokerExists
      ? []
      : [{ action: 'create_broker_role', name: brokerName }]),
    ...(brokerExists && BROKER_POLICY_STEPS[brokerPolicy]
      ? [{ action: BROKER_POLICY_STEPS[brokerPolicy], name: brokerName }]
      : []),
    ...missingLayers.map((name) => ({ action: 'publish_layer', name })),
  ],
  changes: devRows.map((row) => ({
    function: row.function,
    action: 'attach',
    fields: [
      `Layers +${layerName(row.arch)}`,
      'Environment +AWS_LAMBDA_EXEC_WRAPPER, SLS_DEV_*',
    ],
  })),
  restore:
    'on exit, or on the next serverless dev, deploy, remove or dev restore; until then invocations run the deployed code',
  cloudformation: deployFirst,
})

const ACCOUNT_SETUP_LINES = {
  create_broker_role: (name) =>
    `  • create IAM role ${name} (lets attached functions reach AWS IoT Core)`,
  repair_broker_policy: (name) =>
    `  • put back the permission policy ${BROKER_POLICY_NAME} of IAM role ${name} (it is missing)`,
  update_broker_policy: (name) =>
    `  • update the permission policy ${BROKER_POLICY_NAME} of IAM role ${name} (it differs from the one this version of Dev Mode writes)`,
  publish_layer: (name) => `  • publish Lambda layer ${name}`,
}

export const renderPlan = ({ plan, region }) => {
  const lines = []
  if (plan.deployFirst) {
    lines.push(
      `Stage "${plan.stage}" is not deployed yet. Dev Mode deploys it first: a normal deployment of your code.`,
    )
  }
  if (plan.accountSetup.length) {
    // A repair or update alone creates nothing in the account, so it is not a first-time setup.
    const creates = plan.accountSetup.some(
      (step) => !Object.values(BROKER_POLICY_STEPS).includes(step.action),
    )
    lines.push(
      creates
        ? `Account setup (first time in ${region}):`
        : `Account setup in ${region}:`,
    )
    for (const step of plan.accountSetup) {
      lines.push(ACCOUNT_SETUP_LINES[step.action](step.name))
    }
  }
  if (plan.changes.length) {
    lines.push(
      `These changes will be made to ${functionsWord(plan.changes.length)} (configuration only, no CloudFormation deploy):`,
    )
    lines.push(
      '  • add the Dev Mode layer and set AWS_LAMBDA_EXEC_WRAPPER to the Dev Mode wrapper',
    )
    lines.push(
      '  • add Dev Mode variables (SLS_DEV_*); timeouts, code and IAM roles are not changed',
    )
    lines.push(
      `  Functions: ${plan.changes.map((change) => change.function).join(', ')}`,
    )
    lines.push(
      'They are restored when you exit, or by the next serverless dev, deploy, remove or dev restore.',
    )
  }
  return lines.join('\n')
}

/** A session on a stage that was never deployed, before its deployment. */
export const deployFirstLine = (stage) =>
  `Stage "${stage}" is not deployed yet: deploying it first.`

/**
 * What the account setup did, once it is done: `{ region, createdRole, repairedRole, usedRole,
 * nowMs, layers }` (the role's name when it was created or repaired, the layers published). Null
 * when it did nothing. `usedRole`, `{ name, createdAt }`: a role an earlier run created moments
 * ago, named with its age at `nowMs`, since it may not work everywhere yet.
 */
export const accountSetupDoneLine = ({
  region,
  createdRole,
  repairedRole,
  usedRole,
  nowMs = Date.now(),
  layers = [],
}) => {
  const age = usedRole
    ? ` (created ${formatAgo(usedRole.createdAt.getTime() / 1000, nowMs)})`
    : ''
  const done = [
    createdRole && `created IAM role ${createdRole}`,
    repairedRole && `repaired IAM role ${repairedRole}${age}`,
    !repairedRole && usedRole && `using IAM role ${usedRole.name}${age}`,
    ...layers.map((name) => `published layer ${name}`),
  ].filter(Boolean)
  return done.length ? `Set up Dev Mode in ${region}: ${done.join(', ')}` : null
}

/**
 * The row a function ends up with once its attach outcome is known. A `deployed` row always has
 * a why, even for an outcome that carries no message.
 */
export const finalRow = (row, outcome) => {
  if (!outcome) return row
  if (outcome.status === 'attached') return outcome.row ?? row
  const base = { function: row.function, mode: 'deployed', notes: [] }
  if (outcome.status === 'skipped') {
    return (
      outcome.row ?? {
        ...base,
        mode: 'skipped',
        reason: 'not_attached',
        why: 'not attached',
      }
    )
  }
  if (outcome.status === 'rejected') {
    return {
      ...base,
      reason: outcome.reason || 'attach_rejected',
      why: outcome.why || outcome.reason || 'attach rejected',
    }
  }
  if (outcome.status === 'not_started') {
    return {
      ...base,
      reason: 'not_attached',
      why: 'not attached (session stopped)',
    }
  }
  return {
    ...base,
    reason: 'attach_failed',
    why: outcome.message
      ? `attach failed: ${outcome.message}`
      : 'attach failed',
  }
}

/** The ready line, a success line: `✔ Dev Mode on · 3 of 3 functions (8.3s)`. */
export const startupSummary = ({ devCount, total, seconds }) =>
  `Dev Mode on · ${devCount} of ${functionsWord(total)} ${asideSeconds(seconds)}`

/** How many endpoints the start-up lists before "... and N more". */
const LISTED_ENDPOINTS = 10

/**
 * The service's endpoints in the sections `deploy` and `info` print (`formatServiceOutputs`),
 * from `endpointTextOf` (`../control/endpoints.js`): `endpoint:` for one, `endpoints:` for more
 * (the first `limit`, then how many more), then `mcp:`. One string per section; none when there
 * is nothing to name.
 */
export const endpointLines = (
  { endpoints = [], mcp = [] } = {},
  { limit = LISTED_ENDPOINTS } = {},
) => {
  const sections = []
  if (endpoints.length === 1) sections.push(['endpoint', endpoints[0]])
  if (endpoints.length > 1) {
    sections.push([
      'endpoints',
      [
        ...endpoints.slice(0, limit),
        ...(endpoints.length > limit
          ? [`... and ${endpoints.length - limit} more`]
          : []),
      ],
    ])
  }
  if (mcp.length === 1) sections.push(['mcp', mcp[0]])
  if (mcp.length > 1) sections.push(['mcp', mcp])
  return formatServiceOutputs(sections)
}

export const STOP_HINT = 'Press Ctrl+C to restore your functions and exit.'
/**
 * The first line of a foreground `serverless dev` under an AI agent (printed by the CLI runner,
 * before Dev Mode runs): `service` is the Compose service the command named, and `config` the
 * --config it was given, if any.
 */
export const agentHint = (service, config) => {
  const dev = (rest) => withConfig(commandFor(service, `dev ${rest}`), config)
  return `Running under an AI agent: start with "${dev('--detach')}", then use "${dev('wait')}" and "${dev('stop')}" (which restores your functions).`
}
export const AGENT_HINT = agentHint()
/** A second start of the same scope in this directory: it returns, the session goes on. */
export const alreadyRunningLine = (record) =>
  `Dev Mode is already on here (session ${record.session_id}, pid ${record.pid}, stage ${record.stage}).`

/**
 * When a start finds its session already running (`record`) and was given settings that apply
 * only when a session starts: the line that says the running one keeps its own, or null. An
 * `--idle-timeout`, `--take-over` or `--on-exit` equal to the running session's is no change; a
 * record that does not say how its session started (`take_over`, `on_exit`) gets them named.
 */
export const keptSettingsLine = ({ record, options = {} }) => {
  const given = []
  const idle = options['idle-timeout']
  if (idle !== undefined) {
    let seconds = null
    try {
      seconds = parseIdleTimeout(idle) / 1000 || null
    } catch {
      // Refused before any start; named as given.
    }
    if (seconds !== (record?.idle_timeout_s ?? null)) {
      given.push(`--idle-timeout ${idle}`)
    }
  }
  if (options['take-over'] && record?.take_over !== true) {
    given.push('--take-over')
  }
  const onExit = options['on-exit']
  if (onExit !== undefined && onExit !== record?.on_exit) {
    given.push(`--on-exit ${onExit}`)
  }
  if (!given.length) return null
  return `The running session keeps the settings it started with: ${listNames(given)} ${given.length === 1 ? 'applies' : 'apply'} only to a new one. Run "${cliCommand('dev stop')}", then start again to use them.`
}
/**
 * The session of the same scope found in this directory, as its state says: "already on" once it
 * is on, starting or stopping; a state the session file does not define is named as it is.
 */
export const sessionHereLine = (record) => {
  if (record.state === 'on') return alreadyRunningLine(record)
  const where = `(session ${record.session_id}, pid ${record.pid}, stage ${record.stage})`
  return ['starting', 'stopping'].includes(record.state)
    ? `Dev Mode is ${record.state} here ${where}.`
    : `A Dev Mode session is here ${where}; its session file says "${record.state}".`
}
/** A session here whose control endpoint could not open: nothing but its own terminal reaches it. */
export const sessionUnreachableLine = (record) =>
  `The Dev Mode session here (session ${record.session_id}, pid ${record.pid}, stage ${record.stage}) could not open its control endpoint, so no command can reach it. Stop it with Ctrl+C in its terminal, then run "${restoreCommand(record)}" if it left functions in Dev Mode. If that process is not a Dev Mode session any more, delete ${shownPath('.serverless/dev/session.json')}.`
/** `dev restore` while a session of its stage runs in this directory. */
export const restoreRefusedLine = (record) =>
  `A Dev Mode session of this stage is running here (session ${record.session_id}, pid ${record.pid}); it restores its functions when it stops. Stop it first with "${cliCommand('dev stop')}".`
/** A start while the session of the same scope in this directory is stopping. */
export const sessionStoppingLine = (record) =>
  `The Dev Mode session here (session ${record.session_id}, pid ${record.pid}, stage ${record.stage}) is stopping. Run the command again once it has ended.`
export const SESSION_STOPPING_NEXT = Object.freeze({
  get command() {
    return cliCommand('dev wait --for ended')
  },
  when: 'to wait until it has ended',
})
/** A start while a session of another stage, region or selection runs in this directory. */
export const sessionRunningLine = (record) =>
  `Another Dev Mode session is running here (stage ${record.stage}, pid ${record.pid}). Stop it first with "${cliCommand('dev stop')}".`
export const SESSION_RUNNING_NEXT = Object.freeze({
  get command() {
    return cliCommand('dev stop')
  },
  when: 'to end the running session',
})
export const recordUnavailableLine = (error) =>
  `Dev Mode could not write its session record in ${shownPath('.serverless/dev')} (${error?.message ?? error}); "${cliCommand('dev status')}" and "${cliCommand('dev stop')}" cannot reach this session.`
export const detachedRecordUnavailableMessage = (error) =>
  `Dev Mode could not write its session record in ${shownPath('.serverless/dev')} (${error?.message ?? error}). A session started with --detach is reached only through it, so it did not start, and nothing was changed. Run "${cliCommand('dev')}" in a terminal, or let this process write to ${shownPath('.serverless/dev')}.`
export const detachedControlUnavailableMessage = (error) =>
  `Dev Mode could not open its local control endpoint (${error?.message ?? error}). A session started with --detach is reached only through it, so it did not start, and nothing was changed. Run "${cliCommand('dev')}" in a terminal, or let this process listen on 127.0.0.1.`
export const controlUnavailableLine = (error) =>
  `Dev Mode could not open its local control endpoint (${error?.message ?? error}); "${cliCommand('dev status')}" and "${cliCommand('dev stop')}" cannot reach this session.`

export const leftoverLine = (rows, nowMs) => {
  const oldest = Math.min(
    ...rows.map((row) => row.attachment?.attachedAt ?? Infinity),
  )
  const pronoun = rows.length === 1 ? 'it' : 'them'
  return `${functionsWord(rows.length)} still had Dev Mode configuration from an earlier session of yours (${formatAgo(Number.isFinite(oldest) ? oldest : undefined, nowMs)}); attached ${pronoun} to this session.`
}

export const protectedStageMessage = (stage) =>
  `Dev Mode does not run on stage "${stage}": it changes the live configuration of deployed functions. Use a personal or development stage, for example "${cliCommand('dev --stage <your-name>')}".`

const AGAIN_TO_EXIT = 'press Ctrl+C again to exit without waiting'
/**
 * The spinner's text from the first stop on: `{ deploying, keep, count }` say whether the first
 * deployment is running (it is left to end, nothing is attached), whether the functions stay in
 * Dev Mode, and how many functions the stop restores.
 */
export const stoppingProgress = ({
  deploying = false,
  keep = false,
  count = 0,
}) => {
  if (deploying) return `Stopping after the deployment · ${AGAIN_TO_EXIT}`
  if (!keep && count > 0) {
    return `Restoring ${functionsWord(count)} · ${AGAIN_TO_EXIT}`
  }
  return `Stopping · ${AGAIN_TO_EXIT}`
}
/** The spinner's text while a restore runs; `stopping` adds how to exit without waiting. */
export const restoringProgress = ({ done, total, stopping = false }) =>
  `Restoring ${functionsWord(total)} (${done}/${total})${stopping ? ` · ${AGAIN_TO_EXIT}` : ''}`
export const forceExitDuringDeployLine = (stage) =>
  `Exiting without waiting. The deployment of stage "${stage}" may continue in AWS CloudFormation; no function was attached.`
/** The line a stop ends with; without `seconds` (a stop `dev stop` asked for) no time is given. */
export const restoredLine = ({ count, seconds }) =>
  count === 0
    ? 'Dev Mode off · nothing to restore'
    : `Dev Mode off · ${functionsWord(count)} restored${seconds === undefined ? '' : ` ${asideSeconds(seconds)}`}`
/** Instead of the "Dev Mode off" line when some function could not be restored. */
export const restoreIncompleteLine = ({ count, total, seconds }) =>
  `Restore incomplete · ${count} of ${functionsWord(total)} restored ${asideSeconds(seconds)}`

/**
 * One indented line per note a restore outcome carries (an exec wrapper that was not put back,
 * variables that could not be read), printed under the restored line. Takes the entries of
 * `restoreFunctions` results: `{ name, notes? }`; `nameOf` turns a deployed name into the one
 * shown.
 */
export const restoreNoteLines = (outcomes, nameOf = (name) => name) =>
  outcomes.flatMap(({ name, notes }) =>
    messagesOf(notes).map((message) => `  ${nameOf(name)}: ${message}`),
  )

const UNTIL_NEXT =
  'until the next serverless dev, deploy, remove or dev restore.'
const runsDeployed = (n) =>
  `${n === 1 ? 'It runs' : 'They run'} the deployed code`
const failureOf = (f) =>
  String(f.message || 'restore failed').replace(/\.$/, '')
const SAME = (name) => name

/** The functions a restore could not restore, each with why (`dev restore --json`'s message too). */
export const notRestoredLine = (failed, nameOf = SAME) =>
  `${functionsWord(failed.length)} not restored: ${failed.map((f) => `${nameOf(f.name)} (${failureOf(f)})`).join(', ')}.`

/**
 * The restore that retries only the functions in `failed`, one `--function` each by its key
 * (`keyOf` turns a deployed name into it), in `scope`: never more than the restore that failed.
 */
export const retryRestoreCommand = (failed, { keyOf = SAME, scope } = {}) =>
  restoreCommand(scope, { functionKeys: failed.map(({ name }) => keyOf(name)) })

/**
 * `[level, text]` pairs: the functions not restored, what they run, how to restore them. `nameOf`
 * turns a deployed name into the one shown; `keyOf` into its key in serverless.yml, which the
 * suggested restore names (by default the name shown); `scope` is the stage, region and
 * --aws-profile the restore ran for, which the suggested restore names too.
 */
export const notRestoredLines = (
  failed,
  { nameOf = SAME, keyOf = nameOf, scope } = {},
) => [
  ['warning', notRestoredLine(failed, nameOf)],
  [
    'warning',
    `${runsDeployed(failed.length)} until restored: run "${retryRestoreCommand(failed, { keyOf, scope })}".`,
  ],
  [
    'debug',
    'The Dev Mode bridge passes invocations through to the deployed code when no session is connected.',
  ],
]
export const takenOverLine = (skipped, nameOf = SAME) =>
  `${listNames(skipped.map((s) => nameOf(s.name)))} ${skipped.length === 1 ? 'was' : 'were'} taken over by another session and left with it.`
export const forceExitLines = (names) =>
  names.length
    ? [
        `Exiting without waiting. Not restored: ${names.join(', ')}.`,
        `${runsDeployed(names.length)} ${UNTIL_NEXT}`,
      ]
    : ['Exiting.']
export const restoreTimeoutLines = (names, timeoutMs) => [
  `Restoring did not finish within ${Math.round(timeoutMs / 60_000)} min. Not restored: ${names.join(', ')}.`,
  `${runsDeployed(names.length)} ${UNTIL_NEXT}`,
]

/**
 * Functions a restore really changed back. Functions that were already restored (`unchanged`) or
 * deleted (`missing`) are not counted: the line must not claim work that did not happen.
 */
export const restoredCount = (result) => result.restored.length

/**
 * What a finished restore prints, as `[level, text]` pairs in order: the outcome line (`✔ Dev Mode
 * off`, or `✖ Restore incomplete` when a function failed; `outcome` replaces the success one), the
 * notes of each function, the functions already restored (debug), what another session took over,
 * and what could not be restored. Takes the result of `restoreFunctions`; `nameOf` turns a
 * deployed name into the one shown (the function's key), `keyOf` into the key a suggested
 * restore names (by default the name shown); `scope` is the stage, region and --aws-profile it
 * ran for, which a suggested restore names too.
 */
export const restoreReportLines = ({
  result,
  seconds,
  nameOf = SAME,
  keyOf = nameOf,
  outcome,
  scope,
}) => {
  const count = restoredCount(result)
  return [
    result.failed.length
      ? [
          'error',
          restoreIncompleteLine({
            count,
            total: count + result.failed.length,
            seconds,
          }),
        ]
      : (outcome ?? ['success', restoredLine({ count, seconds })]),
    ...restoreNoteLines([...result.restored, ...result.unchanged], nameOf).map(
      (line) => ['aside', line],
    ),
    // Restored in the meantime by a deploy, remove or dev restore: not counted above.
    ...(result.unchanged.length
      ? [
          [
            'debug',
            `Already on the deployed configuration: ${result.unchanged.map((f) => nameOf(f.name)).join(', ')}.`,
          ],
        ]
      : []),
    ...(result.skipped.length
      ? [['notice', takenOverLine(result.skipped, nameOf)]]
      : []),
    ...(result.failed.length
      ? notRestoredLines(result.failed, { nameOf, keyOf, scope })
      : []),
  ]
}

/**
 * The spinner's text while `deploy`, `remove` or `rollback` restores the functions of the stage
 * that still have Dev Mode configuration.
 */
export const restoringBeforeCommandProgress = (count) =>
  `Restoring ${functionsWord(count)} from Dev Mode`

/**
 * The line `deploy`, `remove` and `rollback` print once they restored the functions of the stage
 * that still had Dev Mode configuration: who attached them and when, in the logger's aside style.
 */
export const restoredBeforeCommandLine = ({ found, count, nowMs }) => {
  const owners = [
    ...new Set(found.map((f) => f.attachment?.owner).filter(Boolean)),
  ]
  const oldest = Math.min(
    ...found.map((f) => f.attachment?.attachedAt ?? Infinity),
  )
  const detail = owners.length
    ? ` ${style.aside(`(${owners.join(', ')}, ${formatAgo(Number.isFinite(oldest) ? oldest : undefined, nowMs)})`)}`
    : ''
  return `Restored ${functionsWord(count)} from Dev Mode${detail}`
}

/**
 * The command wins over a session that may still be running: it takes the functions back. Usually
 * the session was killed, so this is said as a condition, not as a fact. A debug line: the running
 * session says in its own terminal that it lost them.
 */
export const runningSessionLine = ({ verb, count }) =>
  `If a "serverless dev" session is still running on this stage, it no longer has ${count === 1 ? 'this function' : 'these functions'}: ${verb === 'removal' ? 'stop it' : `start it again after the ${verb}`}.`

/** The heading `serverless dev restore` prints above the functions it restores. */
export const restoringStageLine = ({ stage }) =>
  `Functions with Dev Mode configuration on stage "${stage}":`

/** One function `serverless dev restore` is about to restore, with who attached it and when. */
export const restoreCandidateLine = (
  { name, attachment, unreadable },
  nowMs,
) => {
  let detail = 'incomplete Dev Mode configuration'
  if (unreadable) detail = `Dev Mode layer attached; ${ENV_UNREADABLE_WHY}`
  else if (attachment) {
    detail = `${attachment.owner}, attached ${formatAgo(attachment.attachedAt, nowMs)}`
  }
  return `  ${name}  (${detail})`
}

export const nothingToRestoreLine = ({ stage, only = [] }) => {
  if (only.length === 0) {
    return `No function on stage "${stage}" has Dev Mode configuration.`
  }
  const [word, has] =
    only.length === 1 ? ['Function', 'has'] : ['Functions', 'have']
  return `${word} ${only.join(', ')} on stage "${stage}" ${has} no Dev Mode configuration.`
}

const LEFT_DEV_MODE = {
  wrapper_replaced: ({ name }) =>
    `${name} left Dev Mode: something else changed its AWS_LAMBDA_EXEC_WRAPPER (for example Dashboard instrumentation); it runs the deployed code.`,
  detached: ({ name }) =>
    `${name} left Dev Mode: its Dev Mode configuration was removed elsewhere (serverless deploy, dev restore or another tool).`,
  taken_over: ({ name, owner }) =>
    `${name} left Dev Mode: ${owner} took it over with --take-over.`,
  taken_over_by_you: ({ name }) =>
    `${name} left Dev Mode: another Dev Mode session of yours attached it.`,
  layer_missing: ({ name }, scope) =>
    `${name} lost the Dev Mode layer but still points at its wrapper (AWS_LAMBDA_EXEC_WRAPPER); it cannot start until it is restored (${restoreCommand(scope)}).`,
  function_deleted: ({ name }) =>
    `${name} left Dev Mode: the function no longer exists.`,
  // Not a departure: Dev Mode cannot tell, and does not write what it cannot read.
  env_unreadable: ({ name }) =>
    `${name} can no longer be checked: ${ENV_UNREADABLE_WHY}; restoring it on exit needs that access back.`,
}
/**
 * What a running session prints once about a function the check found changed: the states of
 * checkAttachments, plus `taken_over_by_you` for a take-over by another session of the same owner.
 * `scope`: the session's stage and region, which a suggested restore names.
 */
export const leftDevModeLine = (change, scope) =>
  LEFT_DEV_MODE[change.state](change, scope)

const LOST_WHY = {
  taken_over: ({ owner }) => `taken over by ${owner} (--take-over)`,
  taken_over_by_you: () => 'taken over by another session of yours',
  wrapper_replaced: () =>
    'left Dev Mode: something else changed its AWS_LAMBDA_EXEC_WRAPPER',
  detached: () =>
    'left Dev Mode: its Dev Mode configuration was removed elsewhere',
  function_deleted: () => 'the function no longer exists',
  layer_missing: () =>
    'lost the Dev Mode layer; cannot start until it is restored',
  env_unreadable: () => `can no longer be checked: ${ENV_UNREADABLE_WHY}`,
}
/** The function table's why for a function the session lost (see leftDevModeLine). */
export const lostWhy = (change) => LOST_WHY[change.state](change)

/** Printed once per session when the attachment checks keep failing; later failures are debug lines. */
/**
 * An error as it reads inside the parentheses of a longer line (`inside`), and the sentence that
 * goes once after that part of the line (`after`, '' when none): rejected AWS credentials
 * (`advice` on Dev Mode's error) show AWS's own short message, so the advice is not repeated
 * inside the parentheses. Any other error, or a plain text, is shown as it is.
 */
export const parenthesized = (error) => {
  const message = String(error?.message ?? error)
  const advice =
    error?.code === 'DEV_MODE_AWS_CREDENTIALS_INVALID' && error.advice
      ? error.advice
      : ''
  if (!advice) return { inside: message, after: '' }
  const inside =
    error.originalMessage ??
    message.slice(0, message.lastIndexOf(advice)).trim().replace(/\.$/, '')
  return { inside, after: advice }
}

/**
 * A stop that failed before restoring: the failure and how to restore the session's stage and
 * region (`scope`).
 */
export const stopFailedLine = (error, scope) => {
  const { inside, after } = parenthesized(error)
  return `Dev Mode could not stop cleanly (${inside}).${after ? ` ${after}` : ''} Run "${restoreCommand(scope)}" to restore your functions.`
}

/** `error` is the last failure, an error or a text. */
export const watchFailingLine = ({ count, error }) => {
  const { inside, after } = parenthesized(error)
  return `Dev Mode could not check the attached functions the last ${count} times (${inside.replace(/\.$/, '')}).${after ? ` ${after}` : ''} It keeps trying; later failures show with --debug only.`
}

export const keptLine = (n) =>
  `Left ${functionsWord(n)} in Dev Mode (--on-exit keep). ${runsDeployed(n)} ${UNTIL_NEXT}`
export const removalSkippedLine = () =>
  `Removal skipped: there is no terminal to confirm it. Your functions were restored; run "${cliCommand('remove')}" to remove the service.`
