/**
 * `serverless dev replay <requestId>`: runs a recorded invocation again on this machine through
 * the running session (its handler processes, and the credentials of the function's role), and
 * prints the result. No caller receives it. The id is a full request id, or a unique prefix of at
 * least 8 characters, as `serverless dev requests` lists them.
 */
import fs from 'fs'
import { connectToSession } from '../control/client.js'
import { replayTimeoutMs } from '../local/replay.js'
import { REQUEST_ID_PREFIX_MIN, devDirOf } from '../state/paths.js'
import { findInvocation } from '../state/read.js'
import { envelope, errorResult, scopeFlags } from './envelope.js'
import { cliCommand, shellWord, shownPath } from './cli-names.js'

const LIST = Object.freeze({
  get command() {
    return cliCommand('dev requests')
  },
  when: 'to list the recorded request ids',
})
// Reasons whose fix is to pick another id from the list.
const PICK_ANOTHER = new Set([
  'invalid_option_value',
  'ambiguous_request_id',
  'invocation_not_found',
])
const isAbort = (error) =>
  error?.name === 'AbortError' || error?.code === 'ABORT_ERR'

/**
 * The replay's result as a person reads it, as `[level, text]` pairs: the outcome and an error at
 * notice level, the file and the notes in the logger's aside style.
 */
export const replayLines = (fields) => {
  const lines = [
    [
      'notice',
      `Replayed ${fields.replay_of.slice(0, 8)} on ${fields.function} as ${fields.request_id.slice(0, 8)} (no caller received it): ${fields.outcome}${fields.status_code ? ` · ${fields.status_code}` : ''} · ${fields.duration_ms} ms`,
    ],
  ]
  if (fields.error) {
    lines.push(['notice', `${fields.error.type}: ${fields.error.message}`])
  }
  lines.push(['aside', fields.file])
  if (fields.response_omitted) {
    lines.push([
      'aside',
      'The response is larger than 64 KiB; it is in the file above.',
    ])
  }
  if (fields.note === 'replayed_redacted_event') {
    lines.push([
      'aside',
      'The original event was no longer in memory, so the redacted copy from its file was replayed: headers such as Authorization were sent as "[redacted]".',
    ])
  }
  return lines
}

/** A `{ status, body }` answer of the session as the reason it carries. */
const refusalOf = ({ status, body }) => {
  if (status === 404) {
    return { reason: 'invocation_not_found', message: body?.message }
  }
  if (status === 409) {
    return { reason: body?.reason ?? 'error', message: body?.message }
  }
  return {
    reason: 'error',
    message: `The Dev Mode session could not run the replay (HTTP ${status}).`,
  }
}

export const runDevReplay = async ({ serviceDir, options = {}, deps = {} }) => {
  const {
    fs: fsRef = fs,
    find = findInvocation,
    connect = connectToSession,
  } = deps
  const done = (fields, human = fields.message) => ({
    result: envelope(fields),
    human,
  })
  const failed = (error, fields = {}) =>
    done(
      errorResult(error, {
        ...(PICK_ANOTHER.has(error?.reason ?? '') && { next: [LIST] }),
        ...fields,
      }),
    )
  try {
    const id =
      options.requestId === undefined ? '' : String(options.requestId).trim()
    if (!id) {
      return failed(
        Object.assign(
          new Error(
            `Give the request id, or at least its first ${REQUEST_ID_PREFIX_MIN} characters, as "${cliCommand('dev requests')}" lists them.`,
          ),
          { reason: 'invalid_option_value' },
        ),
      )
    }
    // An exact id of any length first, else a prefix of at least 8 characters (the reader's rule).
    let record
    try {
      ;({ record } = await find({
        dir: devDirOf(serviceDir),
        idOrPrefix: id,
        fs: fsRef,
      }))
    } catch (error) {
      return failed(error)
    }
    const client = await connect({ serviceDir, fs: fsRef })
    if (!client) {
      return done({
        status: 'error',
        reason: 'session_not_running',
        message:
          'Dev Mode is not running in this directory, and a replay runs through a running session.',
        next: [
          { command: cliCommand('dev --detach'), when: 'to start a session' },
        ],
      })
    }
    // An invocation of another stage would run with this stage's configuration and role.
    const recordedStage = record.stage
    const sessionStage = client.record?.stage
    if (recordedStage && sessionStage && recordedStage !== sessionStage) {
      // One session per directory: this one stops before one of the recorded stage starts. The
      // region and profile stay the session's.
      const session = client.record
      const there = { ...session, stage: recordedStage }
      const scoped = (words, scope) =>
        cliCommand([words, ...scopeFlags(scope)].join(' '))
      return done({
        status: 'error',
        reason: 'stage_mismatch',
        message: `Request ${String(record.request_id).slice(0, 8)} ran on stage "${recordedStage}", and the Dev Mode session here runs stage "${sessionStage}": a replay would run it with the other stage's configuration and role. Stop this session, then start one of stage "${recordedStage}" and replay it there once ${record.function} has been invoked through AWS on that stage: a new session gets its role's credentials only from a real invocation.`,
        next: [
          {
            command: scoped('dev stop', session),
            when: 'to stop this session first',
          },
          {
            command: scoped('dev --detach', there),
            when: `then to start a session of stage "${recordedStage}"`,
          },
          {
            command: scoped(
              `dev replay ${shellWord(record.request_id)}`,
              there,
            ),
            // No step invokes the function: that has real effects, which only a person decides on.
            when: `then, once ${record.function} has been invoked through AWS on stage "${recordedStage}" (a new session gets its role's credentials only from a real invocation), to replay the request there`,
          },
        ],
      })
    }
    let answer
    try {
      answer = await client.replay(record.request_id, {
        timeoutMs: replayTimeoutMs(record),
      })
    } catch (error) {
      if (!isAbort(error)) throw error
      return done({
        status: 'timeout',
        reason: 'timeout',
        message: `The replay of ${record.request_id} on ${record.function} is still running; its result will be in ${shownPath('.serverless/dev/invocations')}.`,
        replay_of: record.request_id,
        function: record.function,
        next: [
          {
            command: cliCommand(`dev requests --function ${record.function}`),
            when: 'to find its result once it ends',
          },
        ],
      })
    }
    if (answer.status !== 200) {
      const { reason, message } = refusalOf(answer)
      return failed(Object.assign(new Error(message ?? reason), { reason }))
    }
    // The file as it is reached from where the CLI runs, in the result and its line.
    const fields = answer.body?.file
      ? { ...answer.body, file: shownPath(answer.body.file) }
      : answer.body
    return done({ status: 'ok', ...fields }, replayLines(fields))
  } catch (error) {
    return failed(error)
  }
}
