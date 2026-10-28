/**
 * `serverless dev status [--json]`: whether Dev Mode is on in this service directory, read from the
 * session file and the running session's control endpoint only. When no session runs it reports
 * state "off" (or "failed" when the last start failed) and exits 0.
 */
import nodeFs from 'fs'
import { devDirOf } from '../state/paths.js'
import { isStartingRecord, readSession } from '../state/session-file.js'
import { readRecords } from '../state/read.js'
import { formatCursor } from '../state/cursor.js'
import { connectToSession } from '../control/client.js'
import { processAlive } from '../local/leftovers.js'
import {
  attachedKindsOf,
  countWord,
  endpointLines,
  renderModeTable,
  restoresWhat,
  timestampAgo,
  webAppWhy,
  withLiveNotes,
} from '../attach/output.js'
import { shortId } from '../local/invocation-output.js'
import {
  errorResult,
  isRestoreNext,
  restoreLine,
  restoreNext,
} from './envelope.js'

const NO_INVOCATIONS = Object.freeze({ total: 0, errors: 0 })
const NO_REQUESTS = Object.freeze({ total: 0, failed: 0 })

/**
 * The function table of a status result's `functions`, a function's reason codes standing in for
 * its why. `serverless dev status` and the s key both show it.
 */
export const statusModeTable = (functions, webApps = []) =>
  renderModeTable(
    functions.map((fn) => ({
      function: fn.name,
      mode: fn.mode,
      why: fn.why ?? (fn.notes ?? []).join('; '),
    })),
    webApps.map((webApp) => ({
      webApp: webApp.name,
      mode: webApp.mode,
      why: webApp.why ?? (webApp.notes ?? []).join('; '),
    })),
  )

/**
 * Whether the function table of a status result's `functions` says something its summary does
 * not: a function that does not run here, or one that runs here with a reason (one the session
 * lost that still points at Dev Mode). The s key and `serverless dev --detach` show it only then.
 */
export const statusTableWorthShowing = (functions, webApps = []) =>
  functions.some((fn) => fn.mode !== 'dev' || fn.reason) ||
  webApps.some(
    (webApp) =>
      webApp.mode !== 'dev' ||
      webApp.reason ||
      (webApp.notes ?? []).some((note) => note !== 'reattached'),
  )

/**
 * A web app as a status result lists it: its row (web/eligibility.js) with what its server and
 * credentials say now (`state`, session-web.js createWebRuntime's), its real URL (`url`) and its
 * URL on this machine (`local_url`, while it runs here). `why` is the table's text, notes are
 * codes.
 */
export const webAppStatusOf = ({ row, state, url }) => {
  const shown = withLiveNotes(row, state)
  return {
    name: row.webApp,
    mode: row.mode,
    reason: row.reason,
    why: webAppWhy(shown) || undefined,
    notes: shown.notes?.length
      ? shown.notes.map((note) => note.reason)
      : undefined,
    url: url ?? undefined,
    local_url: state?.localUrl ?? undefined,
  }
}

/** The session fields of a status result, from a session record. */
const sessionFieldsOf = (record) => ({
  session_id: record.session_id,
  pid: record.pid,
  owner: record.owner,
  service: record.service,
  stage: record.stage,
  region: record.region,
  detached: record.detached,
  started_at: record.started_at,
  ready_at: record.ready_at ?? undefined,
  idle_timeout_s: record.idle_timeout_s ?? undefined,
})

/**
 * What the running session answers on GET /v1/status: its record's fields, the invocation counts,
 * the last invocation, each function's mode (the final table), for a service with web apps each
 * web app's (`web_apps`, see webAppStatusOf; `webApps`: `{ rows, state, urlOf }`) with the
 * request counts and the last request (`requests`, `last_request`; `requestRecorder`), and the
 * endpoints: HTTP, then the MCP servers (`mcp: true`). For the text of `dev status` only (its
 * `--json` result leaves them out): `endpoint_rows`, the endpoints labelled for the lines this CLI
 * prints, and `endpoint_text`, the lines `deploy` and `info` print, which earlier CLI versions
 * read in this shape (both from `endpointListsOf`).
 */
export const sessionStatusFields = ({
  record,
  rows = [],
  recorder,
  requestRecorder,
  endpoints = [],
  endpointText,
  endpointRows,
  cursor,
  webApps,
}) => ({
  // A session that could not write its record (see runDevSession) has none to read.
  state: record?.state,
  ...(record ? sessionFieldsOf(record) : {}),
  invocations: recorder?.counts() ?? { ...NO_INVOCATIONS },
  last_invocation: recorder?.lastInvocation() ?? undefined,
  functions: rows.map((row) => ({
    name: row.function,
    mode: row.mode,
    reason: row.reason,
    why: row.why,
    notes: row.notes?.length ? row.notes.map((note) => note.reason) : undefined,
  })),
  ...(webApps?.rows?.length && {
    web_apps: webApps.rows.map((row) =>
      webAppStatusOf({
        row,
        state: webApps.state?.get(row.webApp),
        url: webApps.urlOf?.(row.webApp),
      }),
    ),
    requests: requestRecorder?.counts() ?? { ...NO_REQUESTS },
    last_request: requestRecorder?.lastRequest?.() ?? undefined,
  }),
  endpoints,
  endpoint_text: endpointText,
  endpoint_rows: endpointRows,
  cursor: cursor ?? undefined,
})

/**
 * The result when no session answers: from the session file and the last session's log.
 * `answered` is the status code of a session that answered without its status (say 500), if any.
 */
export const quietResult = ({
  dir,
  fs = nodeFs,
  isAlive = processAlive,
  answered,
}) => {
  const records = readRecords({ dir, fs })
  const last = records.at(-1)
  const cursor = last ? formatCursor(last.session_id, last.seq) : undefined
  const empty = {
    invocations: { ...NO_INVOCATIONS },
    functions: [],
    endpoints: [],
    cursor,
  }
  const record = readSession({ dir, fs })
  // A record without an endpoint names a session only while it is starting.
  if (
    record &&
    isAlive(Number(record.pid)) &&
    (record.control?.url ||
      record.control_unavailable === true ||
      isStartingRecord(record))
  ) {
    return {
      status: 'ok',
      state: record.state,
      ...sessionFieldsOf(record),
      ...empty,
      message:
        record.state === 'starting' && !record.control
          ? 'Dev Mode is starting here.'
          : answered
            ? 'The Dev Mode session here could not give its status; this is what its session file says.'
            : 'The Dev Mode session here did not answer; this is what its session file says.',
    }
  }
  // The restore names the last session's stage and region, from its start record.
  const restoreLastSession = () =>
    restoreNext(
      records.find(
        (item) =>
          item.type === 'session.starting' &&
          item.session_id === last.session_id,
      ),
    )
  const ended = records.find((item) => item.type === 'session.ended')
  // As `dev stop` and `dev wait` report the same end: the restore of what it left attached, the
  // web apps named apart from the functions.
  const notRestored = Number(ended?.restore?.failed) || 0
  const webNotRestored = Number(ended?.web_apps?.failed) || 0
  const notRestoredText = (subject) =>
    `${subject} could not restore ${countWord({ functions: notRestored - webNotRestored, webApps: webNotRestored })}.`
  const attached = attachedKindsOf(
    records.filter((item) => item.session_id === last?.session_id),
  )
  const failed = records.find((item) => item.type === 'session.failed')
  if (failed) {
    const message = `Dev Mode is off here: the last start failed (${failed.reason}): ${failed.message}`
    return {
      status: 'ok',
      state: 'failed',
      session_id: failed.session_id,
      ...empty,
      ...(notRestored
        ? {
            message: `${message.replace(/\.+$/, '')}. ${notRestoredText('It')}`,
            next: [restoreLastSession()],
          }
        : { message }),
    }
  }
  if (last && !ended) {
    return {
      status: 'ok',
      state: 'off',
      session_id: last.session_id,
      ...empty,
      message: `Dev Mode is off here. The last session ended without restoring ${restoresWhat(attached, 'its')}.`,
      next: [restoreLastSession()],
    }
  }
  return {
    status: 'ok',
    state: 'off',
    session_id: last?.session_id,
    ...empty,
    ...(notRestored
      ? {
          message: `Dev Mode is off here. ${notRestoredText('The last session')}`,
          next: [restoreLastSession()],
        }
      : { message: 'Dev Mode is off here.' }),
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The endpoint rows of a session from an earlier CLI version, which answers only the lines
 * `deploy` and `info` print (`endpoint_text`: `{ endpoints, mcp }`, strings), for `endpointLines`:
 * a web app's lines (`<name>: <url>` for each web app in `webAppNames`, the bare URL of a lone one,
 * `lone`) become its `webAppUrls`, so it is listed once, under `web apps:`; an MCP server's line
 * (`<name> → <url>`) becomes its row; every other line is kept as it is.
 */
export const rowsOfEndpointText = (text, webAppNames = [], lone) => {
  const webAppUrls = []
  const endpoints = []
  for (const line of text?.endpoints ?? []) {
    const name = webAppNames.find((key) => line.startsWith(`${key}: `))
    if (name !== undefined) {
      webAppUrls.push({ name, url: line.slice(name.length + 2) })
    } else if (lone && line === lone.url) {
      webAppUrls.push({ name: lone.name, url: line })
    } else {
      endpoints.push(line)
    }
  }
  const mcp = (text?.mcp ?? []).map((line) => {
    const at = line.indexOf(' → ')
    return at > 0 ? { name: line.slice(0, at), url: line.slice(at + 3) } : line
  })
  return { endpoints, webAppUrls, mcp }
}

/**
 * The human text of a status result as `[level, text]` pairs, a blank line between sections, with
 * its endpoints (`rows`, every one of them, else `text` from a session of an earlier CLI version,
 * see rowsOfEndpointText) and the web apps that run here, as the start-up lists them
 * (`endpointLines`). The last invocation's time is relative to `nowMs`. When no session runs, a
 * restore in `next` is printed too, as `dev stop` and `dev wait` print it.
 */
export const statusLines = (
  result,
  { rows, text } = {},
  nowMs = Date.now(),
) => {
  if (
    !['starting', 'on', 'stopping'].includes(result.state) ||
    !result.session_id
  ) {
    const restore = result.next?.find(isRestoreNext)
    return [
      ['notice', result.message],
      ...(restore ? [['notice', restoreLine(restore.command)]] : []),
    ]
  }
  const blank = ['blankLine']
  const lines = [
    [
      'notice',
      `Dev Mode ${result.state} · session ${result.session_id} · pid ${result.pid} · stage ${result.stage} · ${result.region}${result.detached ? ' · detached' : ''}`,
    ],
  ]
  if (result.message) lines.push(['notice', result.message])
  const webApps = result.web_apps ?? []
  if (result.functions.length || webApps.length) {
    lines.push(blank, ['notice', statusModeTable(result.functions, webApps)])
  }
  const { total, errors } = result.invocations
  const last = result.last_invocation
  const agoOf = (item) => {
    const when = item ? timestampAgo(item.ts, nowMs) : null
    return when ? `, ${when}` : ''
  }
  lines.push(blank)
  // A session of web apps alone has no invocation line.
  if (result.functions.length || !webApps.length) {
    lines.push([
      'notice',
      `${plural(total, 'invocation')}${errors ? ` (${errors} not ok)` : ''}${last ? ` · last: ${last.function} ${shortId(last.request_id)} ${last.outcome}${agoOf(last)}` : ''}`,
    ])
  }
  if (webApps.length) {
    const requests = result.requests ?? NO_REQUESTS
    const lastRequest = result.last_request
    lines.push([
      'notice',
      `${plural(requests.total, 'web request')}${requests.failed ? ` (${requests.failed} not ok)` : ''}${lastRequest ? ` · last: ${lastRequest.web_app} ${shortId(lastRequest.request_id)} ${lastRequest.outcome}${agoOf(lastRequest)}` : ''}`,
    ])
  }
  const webAppNames = webApps.map((webApp) => webApp.name)
  const endpointRows =
    rows ??
    rowsOfEndpointText(
      text,
      webAppNames,
      webApps.length === 1 && webApps[0].url
        ? { name: webApps[0].name, url: webApps[0].url }
        : undefined,
    )
  const sections = endpointLines(
    {
      ...endpointRows,
      webApps: webApps
        .filter((webApp) => webApp.mode === 'dev' || webApp.mode === 'local')
        .map((webApp) => ({
          name: webApp.name,
          mode: webApp.mode,
          localUrl: webApp.local_url,
          url: webApp.url,
        })),
    },
    { limit: Infinity },
  )
  if (sections.length) lines.push(blank)
  lines.push(...sections.map((section) => ['notice', section]))
  return lines
}

/**
 * Runs `dev status`: `{ result, human }` for the finite-command helper to print (exit 0 unless
 * something failed). Never throws: a failure is an error result.
 */
export const runDevStatus = async ({ serviceDir, deps = {} }) => {
  const {
    connect = connectToSession,
    fs = nodeFs,
    isAlive = processAlive,
    now = Date.now,
  } = deps
  try {
    const dir = devDirOf(serviceDir)
    let result = null
    let endpointLists
    let answered
    const session = await connect({ serviceDir, fs, isAlive })
    if (session) {
      try {
        const answer = await session.status()
        if (answer.status === 200 && answer.body) {
          const {
            endpoint_text: text,
            endpoint_rows: rows,
            ...body
          } = answer.body
          result = { status: 'ok', ...body }
          endpointLists = { rows, text }
        } else {
          answered = answer.status
        }
      } catch {
        // Ended meanwhile: read what it left.
      }
    }
    result ??= quietResult({ dir, fs, isAlive, answered })
    return { result, human: statusLines(result, endpointLists, now()) }
  } catch (error) {
    const result = errorResult(error)
    return { result, human: [['error', result.message]] }
  }
}
