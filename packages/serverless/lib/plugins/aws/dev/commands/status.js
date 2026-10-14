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
  endpointLines,
  renderModeTable,
  timestampAgo,
} from '../attach/output.js'
import { shortId } from '../local/invocation-output.js'
import {
  errorResult,
  isRestoreNext,
  restoreLine,
  restoreNext,
} from './envelope.js'

const NO_INVOCATIONS = Object.freeze({ total: 0, errors: 0 })

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
 * the last invocation, each function's mode (the final table) and the endpoints: HTTP, then the
 * MCP servers (`mcp: true`). `endpoint_text`, the lines `deploy` and `info` print for them
 * (`endpointTextOf`), is for the text of `dev status` only; its `--json` result leaves it out.
 */
export const sessionStatusFields = ({
  record,
  rows = [],
  recorder,
  endpoints = [],
  endpointText,
  cursor,
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
  endpoints,
  endpoint_text: endpointText,
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
  // As `dev stop` and `dev wait` report the same end: the restore of what it left attached.
  const notRestored = Number(ended?.restore?.failed) || 0
  const notRestoredText = (subject) =>
    `${subject} could not restore ${plural(notRestored, 'function')}.`
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
      message:
        'Dev Mode is off here. The last session ended without restoring its functions.',
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
 * The human text of a status result as `[level, text]` pairs, a blank line between sections, with
 * the lines `deploy` and `info` print for its endpoints (`endpointText`), every one of them. The
 * last invocation's time is relative to `nowMs`. When no session runs, a restore in `next` is
 * printed too, as `dev stop` and `dev wait` print it.
 */
export const statusLines = (result, endpointText, nowMs = Date.now()) => {
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
  if (result.functions.length) {
    lines.push(blank, [
      'notice',
      renderModeTable(
        result.functions.map((fn) => ({
          function: fn.name,
          mode: fn.mode,
          why: fn.why ?? (fn.notes ?? []).join('; '),
        })),
      ),
    ])
  }
  const { total, errors } = result.invocations
  const last = result.last_invocation
  const when = last ? timestampAgo(last.ts, nowMs) : null
  const ago = when ? `, ${when}` : ''
  lines.push(blank, [
    'notice',
    `${plural(total, 'invocation')}${errors ? ` (${errors} not ok)` : ''}${last ? ` · last: ${last.function} ${shortId(last.request_id)} ${last.outcome}${ago}` : ''}`,
  ])
  const sections = endpointLines(endpointText, { limit: Infinity })
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
    let endpointText
    let answered
    const session = await connect({ serviceDir, fs, isAlive })
    if (session) {
      try {
        const answer = await session.status()
        if (answer.status === 200 && answer.body) {
          const { endpoint_text: text, ...body } = answer.body
          result = { status: 'ok', ...body }
          endpointText = text
        } else {
          answered = answer.status
        }
      } catch {
        // Ended meanwhile: read what it left.
      }
    }
    result ??= quietResult({ dir, fs, isAlive, answered })
    return { result, human: statusLines(result, endpointText, now()) }
  } catch (error) {
    const result = errorResult(error)
    return { result, human: [['error', result.message]] }
  }
}
