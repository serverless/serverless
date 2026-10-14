/**
 * Replays a recorded invocation on this machine, for `serverless dev replay`. It runs the same
 * function with the event as it arrived: the latest invocations' event bytes are kept in memory,
 * and otherwise the redacted copy from the invocation file is used, which the result notes. It
 * gets a new request id and deadline and the latest credentials of the function's role this
 * session received; of the original Lambda-Runtime headers only those that describe the function
 * are kept. No caller gets the result; the replay gets its own invocation file with
 * `source: "replay"`. It runs in an execution environment of its own, never on a worker a caller's
 * invocation is using, and one replay runs at a time (another asked for meanwhile is refused). A
 * refusal answers at once, and the wait for a result is bounded.
 */
import fs from 'fs'
import { randomUUID as nodeRandomUUID } from 'crypto'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import { devDirOf, fromRecordPath } from '../state/paths.js'
import { findInvocation } from '../state/read.js'

import { REPLAY_ENVIRONMENT_ID } from '../relay/protocol.js'
import { cliCommand } from '../commands/cli-names.js'
import { scopeFlags } from '../commands/envelope.js'

export { REPLAY_ENVIRONMENT_ID }
/** The largest response a replay result carries; a larger one stays in the invocation file. */
export const REPLAY_RESPONSE_LIMIT = 64 * 1024
/** Beyond the function's own timeout, how long a replay's result is waited for. */
export const REPLAY_MARGIN_MS = 30_000
const MAX_TIMEOUT_SECONDS = 900
// What of the original invocation's Lambda-Runtime headers describes the function rather than
// that one request; the request id, deadline and trace are new for a replay.
const KEPT_HEADERS = [
  'lambda-runtime-invoked-function-arn',
  'lambda-runtime-client-context',
  'lambda-runtime-cognito-identity',
]

const timeoutSecondsOf = (record) =>
  Number(record?.deployed_timeout_s) > 0
    ? Math.min(Number(record.deployed_timeout_s), MAX_TIMEOUT_SECONDS)
    : MAX_TIMEOUT_SECONDS

/** How long `serverless dev replay` waits for the result: the function's timeout plus a margin. */
export const replayTimeoutMs = (record) =>
  timeoutSecondsOf(record) * 1000 + REPLAY_MARGIN_MS

/**
 * Whether `text` names the function `functionKey` as a whole name: `api` is named by "worker for
 * api: …", not by "apiGateway".
 */
const namesFunction = (text, functionKey) => {
  if (!text || !functionKey) return false
  const name = functionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9_-])${name}($|[^A-Za-z0-9_-])`).test(text)
}

/** The `errorMessage` of an error reply's body, or null. */
const errorMessageOf = (reply) => {
  if (typeof reply?.message === 'string' && reply.message) return reply.message
  try {
    const message = JSON.parse(String(reply?.body ?? ''))?.errorMessage
    return typeof message === 'string' && message ? message : null
  } catch {
    return null
  }
}

/**
 * An invocation file's event as the bytes Lambda sends: the original bytes from base64 only when
 * the file's `event_encoding` says so, else the event as JSON (a file without the field holds
 * JSON; its shape is never guessed).
 */
export const eventBytesOf = (record) => {
  const { event } = record
  if (record.event_encoding === 'base64' && typeof event?.base64 === 'string') {
    return Buffer.from(event.base64, 'base64')
  }
  return Buffer.from(JSON.stringify(event === undefined ? null : event))
}

/**
 * `runtime()` and `recorder()` return the session's laptop runtime and invocation recorder, or
 * null before they exist. Returns `replay(idOrPrefix) → Promise<fields>`: the `dev replay` fields
 * of the run. A request id that names nothing, or more than one request, throws with `.reason`
 * 'invocation_not_found' or 'ambiguous_request_id'; any other refusal throws with a message only.
 */
export const createReplayHandler = ({
  serviceDir,
  runtime,
  recorder,
  logger,
  isStopping = () => false,
  now = Date.now,
  timers = GLOBAL_TIMERS,
  randomUUID = nodeRandomUUID,
  fs: fsRef = fs,
  find = findInvocation,
  // The session's `{ stage, region, aws_profile }`: the invoke a refusal suggests runs there.
  scope = {},
}) => {
  /** Runs `work`, or rejects with `message` once `ms` pass; the timer never outlives it. */
  const bounded = (work, ms, message) =>
    new Promise((resolve, reject) => {
      const timer = timers.setTimeout(() => reject(new Error(message)), ms)
      work.then(
        (value) => {
          timers.clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          timers.clearTimeout(timer)
          reject(error)
        },
      )
    })

  const replayOnce = async (idOrPrefix) => {
    if (isStopping()) {
      throw new Error(
        'Dev Mode is stopping; nothing more runs on this machine.',
      )
    }
    if (!serviceDir) {
      throw new Error(
        'This Dev Mode session has no service directory, so it keeps no invocations to replay.',
      )
    }
    const local = runtime()
    const records = recorder()
    if (!local || !records) {
      throw new Error(
        `Dev Mode is still starting; replay once "${cliCommand('dev wait --for ready')}" returns.`,
      )
    }
    // An exact id of any length first, else a prefix of at least 8 characters (the reader's rule).
    const { record } = await find({
      dir: devDirOf(serviceDir),
      idOrPrefix: String(idOrPrefix ?? ''),
      fs: fsRef,
    })
    const functionKey = record.function
    if (!local.has(functionKey)) {
      throw new Error(`${functionKey} is not in Dev Mode in this session.`)
    }
    const environment = local.latestEnvironment(functionKey)
    if (!environment) {
      throw new Error(
        `Dev Mode has no credentials of the role of ${functionKey} in this session yet: they arrive with its first invocation through AWS. Invoke it once (for example "${cliCommand([`invoke -f ${functionKey}`, ...scopeFlags(scope)].join(' '))}"), then replay.`,
      )
    }
    // The full id of the file's invocation: when the memory no longer holds it (its lookup refuses
    // a short id it does not hold as a prefix too short to use), the file's copy runs.
    let raw = null
    try {
      raw = records.rawEventOf(record.request_id)
    } catch (error) {
      if (error?.reason !== 'ambiguous_request_id') throw error
    }
    if (!raw && record.event_truncated) {
      throw new Error(
        `The event of ${record.request_id} was larger than 1 MB and is no longer in memory, so it cannot be replayed.`,
      )
    }
    const requestId = randomUUID()
    const headers = {
      ...Object.fromEntries(
        KEPT_HEADERS.filter((name) => raw?.headers?.[name] !== undefined).map(
          (name) => [name, raw.headers[name]],
        ),
      ),
      'lambda-runtime-aws-request-id': requestId,
      'lambda-runtime-deadline-ms': String(
        now() + timeoutSecondsOf(record) * 1000,
      ),
    }
    records.expectReplay({ requestId, replayOf: record.request_id })
    const ended = records.whenEnded(requestId)
    // Whether the recorder ended this invocation (its file written, or its write failed).
    let recorded = false
    ended.then(
      () => {
        recorded = true
      },
      () => {
        recorded = true
      },
    )
    const waitMs = replayTimeoutMs(record) + REPLAY_MARGIN_MS
    try {
      logger.notice(
        `${style.aside('↻')} Replaying ${record.request_id.slice(0, 8)} on ${functionKey} as ${requestId.slice(0, 8)}; no caller receives the result`,
      )
      const run = async () => {
        const reply = await local.invoke({
          functionKey,
          environmentId: REPLAY_ENVIRONMENT_ID,
          // Dispatch records it as a replay (`source: 'replay'`).
          source: 'replay',
          headers,
          event: raw?.eventBytes ?? eventBytesOf(record),
          environment,
        })
        if (reply?.kind === 'stream') {
          // A stream's body must be read for the invocation to end; nobody else reads it.
          for await (const chunk of reply.body) void chunk
          await reply.ended
        }
        // The runtime records an invocation's end before it hands over its reply (a stream's, as
        // it ends); one turn of the event loop lets that record arrive here. A reply with no
        // record was refused before anything ran (not in Dev Mode, past its deadline, a worker
        // that could not start, a runtime that stopped): no file comes, so nothing waits for one.
        await new Promise((resolve) => setImmediate(resolve))
        if (!recorded) {
          const reason = errorMessageOf(reply)
          // A reason that names the function already says what could not run.
          throw new Error(
            namesFunction(reason, functionKey)
              ? reason
              : `Dev Mode could not run ${functionKey} for the replay${reason ? `: ${reason}` : '.'}`,
          )
        }
        return ended
      }
      const { file } = await bounded(
        run(),
        waitMs,
        `The replay of ${record.request_id} on ${functionKey} did not end within ${Math.round(waitMs / 1000)}s.`,
      )
      const saved = JSON.parse(
        fsRef.readFileSync(fromRecordPath(serviceDir, file), 'utf8'),
      )
      const hasResponse =
        saved.response !== null && saved.response !== undefined
      const responseFits =
        hasResponse &&
        Buffer.byteLength(JSON.stringify(saved.response)) <=
          REPLAY_RESPONSE_LIMIT
      return {
        request_id: requestId,
        replay_of: record.request_id,
        function: functionKey,
        outcome: saved.outcome,
        ...(saved.status_code !== null &&
          saved.status_code !== undefined && {
            status_code: saved.status_code,
          }),
        duration_ms: saved.duration_ms,
        ...(responseFits && { response: saved.response }),
        ...(hasResponse && !responseFits && { response_omitted: true }),
        ...(saved.error && { error: saved.error }),
        file,
        ...(!raw && { note: 'replayed_redacted_event' }),
      }
    } finally {
      // Resolved, refused or given up: nothing waits on this replay any more.
      records.forgetReplay(requestId)
    }
  }

  // One replay at a time: another asked for meanwhile is refused at once, so no replay waits
  // behind one and runs after its command gave up.
  let running = false
  return async (idOrPrefix) => {
    if (running) {
      throw new Error(
        'Another replay is running. Run dev replay again when it finishes.',
      )
    }
    running = true
    try {
      return await replayOnce(idOrPrefix)
    } finally {
      running = false
    }
  }
}
