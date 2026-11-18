/**
 * Every line Dev Mode prints about attach and restore. Function modes are only ever "dev",
 * "deployed" or "skipped"; the session is "on" or "off".
 */
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { listNames } from '../local/messages.js'
import {
  BROKER_POLICY_NAME,
  FALLBACK_ENDPOINT,
  LOCAL_ENDPOINT,
  layerName,
} from './naming.js'
import { ENV_UNREADABLE_WHY } from './undo-record.js'
import { parseIdleTimeout } from './session-idle.js'
import { restoreCommand } from '../commands/envelope.js'
import { cliCommand, commandFor, shownPath } from '../commands/cli-names.js'
import { withConfig } from '../../lib/cli-command.js'

export const functionsWord = (n) => `${n} function${n === 1 ? '' : 's'}`
export const webAppsWord = (n) => `${n} web app${n === 1 ? '' : 's'}`
/**
 * `3 functions`, `1 web app`, or `3 functions and 1 web app`: web apps only when there are some.
 */
export const countWord = ({ functions, webApps = 0 }) => {
  if (webApps === 0) return functionsWord(functions)
  if (functions === 0) return webAppsWord(webApps)
  return `${functionsWord(functions)} and ${webAppsWord(webApps)}`
}
/** How many of a restore's entries are web apps (their `webApp` is true). */
const webAppsIn = (entries) => entries.filter((entry) => entry.webApp).length

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

/** Why a web app runs on this machine only: `--local-only`. */
export const LOCAL_ONLY_WHY =
  'on its local URL only (--local-only); its real URL serves the deployed code'
/** The note of a `--local-only` web app whose server runs without the role's credentials. */
export const NO_ROLE_CREDENTIALS = 'no_role_credentials'
/**
 * What a web app's server and credentials say now, as row notes: its server on this machine is
 * not serving (`local_server_down`), or a `--local-only` web app may not get its role's credentials
 * (`no_role_credentials`). `state` is the session's for the web app (session-web.js
 * createWebRuntime): `{ port, note, credentials }`, none before its server starts.
 */
export const liveWebAppNotes = (state) => [
  ...(state?.note
    ? [
        {
          reason: state.note.reason,
          message: `its server on this machine is not listening on port ${state.port}; requests run the deployed code until it is`,
        },
      ]
    : []),
  ...(state?.credentials === 'denied'
    ? [
        {
          reason: NO_ROLE_CREDENTIALS,
          message:
            'runs without its role credentials: your AWS credentials may not call its endpoint sls-dev-local (lambda:InvokeWebFunctionEndpoint)',
        },
      ]
    : []),
]

/** A web app row with the notes of its server and credentials now (`liveWebAppNotes`). */
export const withLiveNotes = (row, state) => {
  const live = liveWebAppNotes(state)
  return live.length ? { ...row, notes: [...(row.notes ?? []), ...live] } : row
}

/** The why of a web app row: a `--local-only` one says so first. */
export const webAppWhy = (row) =>
  row.why ??
  [row.mode === 'local' && LOCAL_ONLY_WHY, ...messagesOf(row.notes)]
    .filter(Boolean)
    .join('; ')

/**
 * The function table, its header row in the logger's aside style. With web app rows
 * (`webRows`, web/eligibility.js), they follow the functions, each named "<key> (web app)", and
 * the first column is "Name"; without, the table is the functions' alone.
 */
export const renderModeTable = (rows, webRows = []) => {
  const lines = [
    [webRows.length ? 'Name' : 'Function', 'Mode', 'Why'],
    ...rows.map((row) => [row.function, row.mode, whyOf(row)]),
    ...webRows.map((row) => [
      `${row.webApp} (web app)`,
      row.mode,
      webAppWhy(row),
    ]),
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
export const tableWorthShowing = (rows, webRows = []) =>
  [...rows, ...webRows].some(
    (row) =>
      row.mode !== 'dev' ||
      (row.notes ?? []).some((note) => note.reason !== 'reattached'),
  )

/** The account setup step for an existing broker, by `brokerPolicyState`; none when in place. */
const BROKER_POLICY_STEPS = {
  missing: 'repair_broker_policy',
  outdated: 'update_broker_policy',
}

/**
 * What an attach creates for a web app row that runs here (web/attach.js): a relayed one (`dev`)
 * gets a clone of the deployed revision and a dev revision, the endpoint `sls-dev-fallback` on the
 * clone, and `main` moved to the dev revision; a `--local-only` one (`local`) gets a dev revision
 * and the endpoint `sls-dev-local`, and `main` stays as it is.
 */
const webAppChangeOf = (row) =>
  row.mode === 'local'
    ? {
        webApp: row.webApp,
        mode: 'local',
        revisions: ['dev'],
        endpoints: [LOCAL_ENDPOINT],
        main: 'unchanged',
      }
    : {
        webApp: row.webApp,
        mode: 'dev',
        revisions: ['clone', 'dev'],
        endpoints: [FALLBACK_ENDPOINT],
        main: 'dev_revision',
      }

/**
 * The plan a session shows with --approve and `dev --dry-run`. `webRows` are the web app rows
 * (the changes of those that run here are `webChanges`, only when there are any), and
 * `widenBroker` says the broker role's trust is widened for them first.
 */
export const buildPlan = ({
  stage,
  deployFirst,
  brokerName,
  brokerExists,
  brokerPolicy = 'present',
  missingLayers,
  devRows,
  webRows = [],
  widenBroker = false,
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
    ...(brokerExists && widenBroker
      ? [{ action: 'widen_broker_trust', name: brokerName }]
      : []),
    ...missingLayers.map((name) => ({ action: 'publish_layer', name })),
  ],
  ...(webRows.some((row) => row.mode === 'dev' || row.mode === 'local') && {
    webChanges: webRows
      .filter((row) => row.mode === 'dev' || row.mode === 'local')
      .map(webAppChangeOf),
  }),
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
  widen_broker_trust: (name) =>
    `  • let web apps use IAM role ${name} (adds their web functions to its trust policy)`,
  publish_layer: (name) => `  • publish Lambda layer ${name}`,
}

const WEB_APP_CHANGE_LINES = {
  dev: (change) =>
    `  • ${change.webApp}: create revisions clone and dev, and the endpoint ${FALLBACK_ENDPOINT} on the clone; main sends its traffic to the dev revision`,
  local: (change) =>
    `  • ${change.webApp} (--local-only): create a dev revision and the endpoint ${LOCAL_ENDPOINT}; main is not changed`,
}

export const renderPlan = ({ plan, region }) => {
  const lines = []
  if (plan.deployFirst) {
    lines.push(
      `Stage "${plan.stage}" is not deployed yet. Dev Mode deploys it first: a normal deployment of your code.`,
    )
  }
  if (plan.accountSetup.length) {
    // A repair, update or widening alone creates nothing in the account: not a first-time setup.
    const creates = plan.accountSetup.some(
      (step) =>
        !Object.values(BROKER_POLICY_STEPS).includes(step.action) &&
        step.action !== 'widen_broker_trust',
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
  if (plan.webChanges?.length) {
    lines.push(
      `These changes will be made to ${webAppsWord(plan.webChanges.length)} (no CloudFormation deploy):`,
    )
    for (const change of plan.webChanges) {
      lines.push(WEB_APP_CHANGE_LINES[change.mode](change))
    }
    lines.push(
      'What Dev Mode creates is deleted and main is moved back when you exit, or by the next serverless dev, deploy, rollback or dev restore.',
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
 * A session without web apps whose credentials may not update the broker's permission policy, which
 * the previous version of Dev Mode wrote: that one serves functions.
 */
export const previousBrokerPolicyLine = ({ name, region }) =>
  `The IAM role ${name} has the permission policy of an earlier version of Dev Mode, which serves functions. An administrator can update it with "serverless dev setup --region ${region}".`

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

/**
 * The ready line, a success line: `✔ Dev Mode on · 3 of 3 functions (8.3s)`. With `webApps`
 * (`{ running, total }`: the web apps that run on this machine of those of the service), they are
 * named too: `3 of 3 functions and 1 of 2 web apps`, or `1 of 2 web apps` alone for a service
 * without functions.
 */
export const startupSummary = ({ devCount, total, seconds, webApps }) =>
  `Dev Mode on · ${runningCounts({ devCount, total, webApps })} ${asideSeconds(seconds)}`

/** `2 of 3 functions`, `1 of 2 web apps`, or both joined with "and" (see startupSummary). */
export const runningCounts = ({ devCount, total, webApps }) =>
  [
    ...(webApps && total === 0
      ? []
      : [`${devCount} of ${functionsWord(total)}`]),
    ...(webApps ? [`${webApps.running} of ${webAppsWord(webApps.total)}`] : []),
  ].join(' and ')

/** How many endpoints the start-up lists before "... and N more". */
const LISTED_ENDPOINTS = 10

/** What a `--local-only` web app's line says after its local URL. */
export const LOCAL_ONLY_HINT = '(local only)'

/**
 * A section of the start-up lines: its heading in the logger's aside style, then each row on its
 * own line, indented: `label  URL  hint` (the hint in the aside style), the labels padded to one
 * width so the URLs line up. A row given as text (the lines of a session of an earlier version)
 * is printed as it is.
 */
const sectionOf = (heading, rows) => {
  const width = Math.max(
    0,
    ...rows
      .filter((row) => typeof row !== 'string')
      .map(({ label }) => label.length),
  )
  return [
    style.aside(`${heading}:`),
    ...rows.map((row) =>
      typeof row === 'string'
        ? `  ${row}`
        : `  ${[
            row.label.padEnd(width),
            row.url,
            row.hint && style.aside(row.hint),
          ]
            .filter(Boolean)
            .join('  ')}`,
    ),
  ].join('\n')
}

/**
 * The rows of one web app that runs here: in `dev` mode, its real URLs (the endpoint's, then each
 * custom domain's), now served from this machine, then the URL on this machine (the local URL,
 * with hot reload); in `local` mode (`--local-only`), the local URL alone, marked `(local only)`.
 * Its name labels the first row.
 */
const webAppRowsOf = ({ name, mode, localUrl, urls }) => {
  const rows =
    mode === 'local'
      ? localUrl
        ? [{ url: localUrl, hint: LOCAL_ONLY_HINT }]
        : []
      : [...urls, ...(localUrl ? [localUrl] : [])].map((url) => ({ url }))
  return rows.map((row, index) => ({ ...row, label: index === 0 ? name : '' }))
}

/**
 * The start-up lines (and the `dev status` text) of the service's endpoints and the web apps that
 * run here, from `endpointTextOf` (`../control/endpoints.js`), one string per section, none when
 * there is nothing to name:
 *
 * - `endpoints:` each endpoint as `label  URL` (`METHOD /path` for a route, the function's name for
 *   a function URL), the first `limit`, then how many more;
 * - `web apps:` each web app in `webApps` (`[{ name, mode, localUrl, url }]`, those in `dev` or
 *   `local` mode) by `webAppRowsOf`, its real URLs from `webAppUrls` (`[{ name, url }]`), else
 *   its `url`;
 * - `mcp:` each MCP server as `name  URL`.
 */
export const endpointLines = (
  { endpoints = [], mcp = [], webAppUrls = [], webApps = [] } = {},
  { limit = LISTED_ENDPOINTS } = {},
) => {
  const sections = []
  if (endpoints.length) {
    sections.push(
      sectionOf('endpoints', [
        ...endpoints.slice(0, limit),
        ...(endpoints.length > limit
          ? [`... and ${endpoints.length - limit} more`]
          : []),
      ]),
    )
  }
  const webRows = webApps.flatMap((webApp) => {
    const urls = webAppUrls
      .filter((entry) => entry.name === webApp.name)
      .map((entry) => entry.url)
    return webAppRowsOf({
      ...webApp,
      urls: urls.length ? urls : [webApp.url].filter(Boolean),
    })
  })
  if (webRows.length) sections.push(sectionOf('web apps', webRows))
  if (mcp.length) {
    sections.push(
      sectionOf(
        'mcp',
        mcp.map((server) =>
          typeof server === 'string'
            ? server
            : { label: server.name, url: server.url },
        ),
      ),
    )
  }
  return sections
}

/**
 * What a session restores, as its hints name it: `your functions`, `your web apps` or both
 * (`whose`: `its` where the session, not the developer, is the subject).
 */
export const restoresWhat = (
  { functions = true, webApps = false } = {},
  whose = 'your',
) => {
  if (!webApps) return `${whose} functions`
  return functions ? `${whose} functions and web apps` : `${whose} web apps`
}

/**
 * What a session attached, from its records (`function.mode` in `dev`, `web_app.mode` in `dev` or
 * `local`), for restoresWhat: functions alone when the records do not say.
 */
export const attachedKindsOf = (records = []) => {
  const functions = records.some(
    (record) => record.type === 'function.mode' && record.mode === 'dev',
  )
  const webApps = records.some(
    (record) =>
      record.type === 'web_app.mode' &&
      (record.mode === 'dev' || record.mode === 'local'),
  )
  return functions || webApps
    ? { functions, webApps }
    : { functions: true, webApps: false }
}
export const STOP_HINT = 'Press Ctrl+C to restore your functions and exit.'
/** STOP_HINT for a session that also (or only) runs web apps. */
export const stopHint = (what) =>
  `Press Ctrl+C to restore ${restoresWhat(what)} and exit.`
/**
 * The first line of a foreground `serverless dev` under an AI agent (printed by the CLI runner,
 * before Dev Mode runs): `service` is the Compose service the command named, and `config` the
 * --config it was given, if any.
 */
export const agentHint = (service, config, what) => {
  const dev = (rest) => withConfig(commandFor(service, `dev ${rest}`), config)
  return `Running under an AI agent: start with "${dev('--detach')}", then use "${dev('wait')}" and "${dev('stop')}" (which restores ${restoresWhat(what)}).`
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
/**
 * `dev restore` while a session of its stage runs in this directory; `kinds` (restoresWhat's) say
 * whether the service has functions and web apps.
 */
export const restoreRefusedLine = (record, kinds) =>
  `A Dev Mode session of this stage is running here (session ${record.session_id}, pid ${record.pid}); it restores ${restoresWhat(kinds, 'its')} when it stops. Stop it first with "${cliCommand('dev stop')}".`
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
 * Dev Mode, and how many functions the stop restores (`count` counts the `webApps` too).
 */
export const stoppingProgress = ({
  deploying = false,
  keep = false,
  count = 0,
  webApps = 0,
}) => {
  if (deploying) return `Stopping after the deployment · ${AGAIN_TO_EXIT}`
  if (!keep && count > 0) {
    return `Restoring ${countWord({ functions: count - webApps, webApps })} · ${AGAIN_TO_EXIT}`
  }
  return `Stopping · ${AGAIN_TO_EXIT}`
}
/**
 * The spinner's text while a restore runs; `stopping` adds how to exit without waiting. `total`
 * counts `webApps` too.
 */
export const restoringProgress = ({
  done,
  total,
  stopping = false,
  webApps = 0,
}) =>
  `Restoring ${countWord({ functions: total - webApps, webApps })} (${done}/${total})${stopping ? ` · ${AGAIN_TO_EXIT}` : ''}`
export const forceExitDuringDeployLine = (stage) =>
  `Exiting without waiting. The deployment of stage "${stage}" may continue in AWS CloudFormation; no function was attached.`
/**
 * The line a stop ends with; without `seconds` (a stop `dev stop` asked for) no time is given.
 * `count` counts the `webApps` restored too.
 */
export const restoredLine = ({ count, seconds, webApps = 0 }) =>
  count === 0
    ? 'Dev Mode off · nothing to restore'
    : `Dev Mode off · ${countWord({ functions: count - webApps, webApps })} restored${seconds === undefined ? '' : ` ${asideSeconds(seconds)}`}`
/**
 * Instead of the "Dev Mode off" line when some function could not be restored. `total` counts the
 * `webApps` among them too; with both kinds, the line counts them together, and the lines after it
 * name what was not restored.
 */
export const restoreIncompleteLine = ({ count, total, seconds, webApps = 0 }) =>
  `Restore incomplete · ${count} of ${
    webApps > 0 && webApps < total
      ? `${total} functions and web apps`
      : countWord({ functions: total - webApps, webApps })
  } restored ${asideSeconds(seconds)}`

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
// A web app's entry is named by its key already; `nameOf` turns only a function's deployed name.
const shownBy = (nameOf) => (entry) =>
  entry.webApp ? entry.name : nameOf(entry.name)

/**
 * The functions and web apps a restore could not restore, each with why (`dev restore --json`'s
 * message too).
 */
export const notRestoredLine = (failed, nameOf = SAME) =>
  `${countWord({ functions: failed.length - webAppsIn(failed), webApps: webAppsIn(failed) })} not restored: ${failed.map((f) => `${shownBy(nameOf)(f)} (${failureOf(f)})`).join(', ')}.`

/**
 * The restore that retries only what is in `failed`: one `--function` per function by its key
 * (`keyOf` turns a deployed name into it), one `--web-app` per web app, in `scope`: never more
 * than the restore that failed.
 */
export const retryRestoreCommand = (failed, { keyOf = SAME, scope } = {}) =>
  restoreCommand(scope, {
    functionKeys: failed
      .filter((f) => !f.webApp)
      .map(({ name }) => keyOf(name)),
    webAppKeys: failed.filter((f) => f.webApp).map(({ name }) => name),
  })

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
/** A web app's key as the lines that list it beside functions name it. */
export const webAppName = (key) => `${key} (web app)`
/**
 * The lines of a forced exit, naming what is still in Dev Mode; with `keep` (`--on-exit keep` or
 * `dev stop --keep`) they were to stay there, so they are named as left, not as not restored.
 */
export const forceExitLines = (names, { keep = false } = {}) =>
  names.length
    ? [
        `Exiting without waiting. ${keep ? 'Left in Dev Mode' : 'Not restored'}: ${names.join(', ')}.`,
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
  const shown = shownBy(nameOf)
  return [
    result.failed.length
      ? [
          'error',
          restoreIncompleteLine({
            count,
            total: count + result.failed.length,
            seconds,
            webApps: webAppsIn([...result.restored, ...result.failed]),
          }),
        ]
      : (outcome ?? [
          'success',
          restoredLine({
            count,
            seconds,
            webApps: webAppsIn(result.restored),
          }),
        ]),
    ...restoreNoteLines([...result.restored, ...result.unchanged], nameOf).map(
      (line) => ['aside', line],
    ),
    // Restored in the meantime by a deploy, remove or dev restore: not counted above.
    ...(result.unchanged.length
      ? [
          [
            'debug',
            `Already on the deployed configuration: ${result.unchanged.map(shown).join(', ')}.`,
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
 * The spinner's text while `deploy`, `remove` or `rollback` restores the functions (and before
 * `deploy` and `rollback`, the `webApps`) of the stage that still have Dev Mode configuration.
 */
export const restoringBeforeCommandProgress = (count, webApps = 0) =>
  `Restoring ${countWord({ functions: count, webApps })} from Dev Mode`

/**
 * The line `deploy`, `remove` and `rollback` print once they restored the functions of the stage
 * that still had Dev Mode configuration: who attached them and when, in the logger's aside style.
 * `count` is the functions restored; `webApps` the web apps restored (`{ key, owner }`), named.
 */
export const restoredBeforeCommandLine = ({
  found,
  count,
  nowMs,
  webApps = [],
}) => {
  // A web app's owner is `unknown` when only a clone tells its session: it names nobody.
  const owners = [
    ...new Set([
      ...found.map((f) => f.attachment?.owner).filter(Boolean),
      ...webApps
        .map((w) => w.owner)
        .filter((owner) => owner && owner !== 'unknown'),
    ]),
  ]
  // Only a function's configuration says when it was attached.
  const oldest = Math.min(
    ...found.map((f) => f.attachment?.attachedAt ?? Infinity),
  )
  const ago =
    found.length > 0
      ? formatAgo(Number.isFinite(oldest) ? oldest : undefined, nowMs)
      : undefined
  let detail = ''
  if (owners.length) {
    detail = ` ${style.aside(`(${[owners.join(', '), ago].filter(Boolean).join(', ')})`)}`
  } else if (webApps.length && ago) {
    // Every owner left was a web app's `unknown`: when the functions were attached still tells.
    detail = ` ${style.aside(`(${ago})`)}`
  }
  const restored = [
    ...(count > 0 || webApps.length === 0 ? [functionsWord(count)] : []),
    ...(webApps.length
      ? [
          `the web app${webApps.length === 1 ? '' : 's'} ${listNames(webApps.map((w) => w.key))}`,
        ]
      : []),
  ].join(' and ')
  return `Restored ${restored} from Dev Mode${detail}`
}

/**
 * The command wins over a session that may still be running: it takes the functions (and web
 * apps) back. Usually the session was killed, so this is said as a condition, not as a fact. A
 * debug line: the running session says in its own terminal that it lost them.
 */
export const runningSessionLine = ({ verb, count, webApps = 0 }) => {
  let what = count === 1 ? 'this function' : 'these functions'
  if (webApps > 0) {
    what =
      count === 0
        ? `${webApps === 1 ? 'this web app' : 'these web apps'}`
        : 'these functions and web apps'
  }
  return `If a "serverless dev" session is still running on this stage, it no longer has ${what}: ${verb === 'removal' ? 'stop it' : `start it again after the ${verb}`}.`
}

/** The heading `serverless dev restore` prints above the functions and web apps it restores. */
export const restoringStageLine = ({
  stage,
  functions = true,
  webApps = false,
}) => {
  let what = 'Functions'
  if (webApps) what = functions ? 'Functions and web apps' : 'Web apps'
  return `${what} with Dev Mode configuration on stage "${stage}":`
}

/** One web app `serverless dev restore` is about to restore, with the owner of its session. */
export const webAppCandidateLine = ({ key, owner }) =>
  // An owner `unknown` (only a revision tells its session) names nobody.
  `  ${key}  (web app${owner && owner !== 'unknown' ? `, ${owner}` : ''})`

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

/**
 * `only` and `onlyWebApps` are the --function and --web-app selections; `hasWebApps`, whether the
 * service has web apps (only then are they named).
 */
export const nothingToRestoreLine = ({
  stage,
  only = [],
  onlyWebApps = [],
  hasWebApps = false,
}) => {
  if (only.length === 0 && onlyWebApps.length === 0) {
    return `No function${hasWebApps ? ' or web app' : ''} on stage "${stage}" has Dev Mode configuration.`
  }
  const named = [
    ...(only.length
      ? [`${only.length === 1 ? 'Function' : 'Functions'} ${only.join(', ')}`]
      : []),
    ...(onlyWebApps.length
      ? [
          `${only.length ? 'web' : 'Web'} app${onlyWebApps.length === 1 ? '' : 's'} ${onlyWebApps.join(', ')}`,
        ]
      : []),
  ].join(' and ')
  const has = only.length + onlyWebApps.length === 1 ? 'has' : 'have'
  return `${named} on stage "${stage}" ${has} no Dev Mode configuration.`
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
const LEFT_DEV_MODE_WEB_APP = {
  detached: ({ name, localOnly }) =>
    localOnly
      ? `The web app ${name} left Dev Mode: its endpoint ${LOCAL_ENDPOINT} was deleted or no longer serves this session's Dev Mode revision (dev restore or another tool).`
      : `The web app ${name} left Dev Mode: its endpoint main serves a revision Dev Mode did not create (serverless deploy, dev restore or another tool).`,
  taken_over: ({ name, owner, you }) => {
    if (owner === you) {
      return `The web app ${name} left Dev Mode: another Dev Mode session of yours attached it.`
    }
    return `The web app ${name} left Dev Mode: ${owner && owner !== 'unknown' ? owner : 'another Dev Mode session'} took it over with --take-over.`
  },
  taken_over_by_you: ({ name }) =>
    `The web app ${name} left Dev Mode: another Dev Mode session of yours attached it.`,
  function_deleted: ({ name }) =>
    `The web app ${name} left Dev Mode: its web function no longer exists.`,
}
/**
 * What a running session prints once about a function the check found changed: the states of
 * checkAttachments, plus `taken_over_by_you` for a take-over by another session of the same owner.
 * A web app (`webApp: true`, named by its key) has the states of checkWebAppAttachments, and `you`,
 * the session's owner, tells a take-over by another session of the same owner.
 * `scope`: the session's stage and region, which a suggested restore names.
 */
export const leftDevModeLine = (change, scope) =>
  change.webApp
    ? LEFT_DEV_MODE_WEB_APP[change.state](change)
    : LEFT_DEV_MODE[change.state](change, scope)

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

const LOST_WEB_APP_WHY = {
  taken_over: ({ owner, you }) => {
    if (owner === you) return 'taken over by another session of yours'
    return `taken over by ${owner && owner !== 'unknown' ? owner : 'another Dev Mode session'} (--take-over)`
  },
  taken_over_by_you: () => 'taken over by another session of yours',
  detached: () => 'left Dev Mode: its Dev Mode endpoint was changed elsewhere',
  function_deleted: () => 'its web function no longer exists',
}
/**
 * The table's why for a web app the session lost (see leftDevModeLine); `you`: the session's owner.
 */
export const lostWebAppWhy = (change) =>
  LOST_WEB_APP_WHY[change.state]?.(change) ?? change.state

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
 * region (`scope`); `what` says whether it has functions, web apps or both (restoresWhat).
 */
export const stopFailedLine = (error, scope, what) => {
  const { inside, after } = parenthesized(error)
  return `Dev Mode could not stop cleanly (${inside}).${after ? ` ${after}` : ''} Run "${restoreCommand(scope)}" to restore ${restoresWhat(what)}.`
}

/** `error` is the last failure, an error or a text; `what` what is attached (restoresWhat). */
export const watchFailingLine = ({ count, error, what }) => {
  const { inside, after } = parenthesized(error)
  return `Dev Mode could not check ${restoresWhat(what, 'the attached')} the last ${count} times (${inside.replace(/\.$/, '')}).${after ? ` ${after}` : ''} It keeps trying; later failures show with --debug only.`
}

export const keptLine = (n, webApps = 0) =>
  `Left ${countWord({ functions: n, webApps })} in Dev Mode (--on-exit keep). ${runsDeployed(n + webApps)} ${UNTIL_NEXT}`
export const removalSkippedLine = () =>
  `Removal skipped: there is no terminal to confirm it. Your functions were restored; run "${cliCommand('remove')}" to remove the service.`
