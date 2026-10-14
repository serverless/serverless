/**
 * One invocation on this machine: its deadline, the wait for its environment's worker, and its
 * buffered or streamed reply, shown as it starts and ends.
 */
import { PassThrough } from 'stream'
import { runtimeHeaders } from './runtime-api.js'
import { TIMED_OUT, errorReply, parseEvent, timeoutMessage } from './replies.js'
import { createBodyChunkCounter } from './invocation-output.js'
import { workersBusyMessage } from './worker-pool.js'
import { MAX_REMAINING_MS } from '../relay/clock.js'

/**
 * How long after an invocation's deadline its worker is killed: the deadline comes from Lambda's
 * clock, and the relay's own delay should not end an invocation Lambda would still have let finish.
 */
export const DEADLINE_GRACE_MS = 1_000
/** How much of a stream's start is kept for the end line to read an HTTP prelude from. */
const PRELUDE_LIMIT = 16_384
/** How much of a stream's body is kept for the invocation's record (the rest is only counted). */
export const STREAM_HEAD_BYTES = 1024 * 1024

/** `isRunning()` tells whether the runtime started and is not stopping. */
export const createDispatch = ({
  functions,
  pool,
  timers,
  now,
  emit,
  guarded,
  debug,
  isRunning,
  maxWorkers,
}) => {
  const {
    workerFor,
    leaveStart,
    killWorker,
    beginInvocation,
    markStarted,
    endInvocation,
    afterInvocation,
  } = pool

  const dispatchInvocation = async (request) => {
    if (!isRunning()) {
      return errorReply(
        'Runtime.Unknown',
        'Dev Mode is not running on this machine',
      )
    }
    const fn = functions.get(request?.functionKey)
    if (!fn) return { kind: 'not_in_dev' }
    const headers = runtimeHeaders(request.headers)
    const requestId = headers['lambda-runtime-aws-request-id'] ?? 'unknown'
    const deadlineMs = Number(headers['lambda-runtime-deadline-ms'])
    const hasDeadline = Number.isFinite(deadlineMs) && deadlineMs > 0
    if (hasDeadline && deadlineMs <= now()) {
      debug(
        `Dev Mode dropped ${requestId} for ${fn.key}: its deadline passed before it could start`,
      )
      return { kind: 'expired' }
    }
    const environmentId =
      request.environmentId === undefined || request.environmentId === null
        ? ''
        : String(request.environmentId)
    if (!environmentId) {
      return errorReply(
        'Runtime.Unknown',
        'Dev Mode received no Lambda execution environment for this invocation',
      )
    }
    const receivedAt = now()
    const event = parseEvent(request.event)
    // What every start and end tells its listeners besides the parsed event: the raw event, the
    // Lambda-Runtime headers and where the invocation came from (a replay says so).
    const source = request.source === 'replay' ? 'replay' : 'caller'
    const about = {
      eventBytes: Buffer.isBuffer(request.event)
        ? request.event
        : Buffer.from(request.event ?? ''),
      environmentId,
      headers,
      source,
    }
    // Lambda ends an invocation at its deadline, and so does this machine (a little later, see
    // DEADLINE_GRACE_MS): its worker is killed, and the invocation gets Lambda's timeout error.
    // The clock runs from the moment the invocation is accepted, so a worker that is slow to be
    // prepared or to start is bounded too. Without a usable deadline nothing ends it early.
    const deadline = {
      timer: null,
      timedOut: false,
      stream: null,
      worker: null,
      whileStarting: null,
    }
    const timeoutSeconds =
      Number.isFinite(Number(fn.timeout)) && Number(fn.timeout) > 0
        ? Number(fn.timeout)
        : Math.max(0, Math.round((deadlineMs - receivedAt) / 1000))
    const timedOutMessage = () => timeoutMessage(requestId, timeoutSeconds)
    const onDeadline = () => {
      deadline.timer = null
      deadline.timedOut = true
      debug(
        `Dev Mode ended ${requestId} for ${fn.key}: it was still running at its deadline`,
      )
      const { worker } = deadline
      if (!worker) {
        deadline.whileStarting?.()
        return
      }
      if (deadline.stream) {
        if (!deadline.stream.ended) killWorker(worker)
        return
      }
      const settled = worker.channel.abandon(
        deadline,
        errorReply(TIMED_OUT, timedOutMessage()),
      )
      // Still queued behind another invocation, the worker is that one's to end; still queued
      // because the worker never finished its init, the worker is hung in the init.
      if (settled === 'current' || (settled === 'queued' && !worker.started)) {
        killWorker(worker)
      }
    }
    const clearDeadline = () => {
      timers.clearTimeout(deadline.timer)
      deadline.timer = null
    }
    if (hasDeadline) {
      // No Lambda invocation has more time than MAX_REMAINING_MS; a timer past about 24.8 days
      // would fire at once.
      deadline.timer = timers.setTimeout(
        () => guarded('end an invocation at its deadline', onDeadline),
        Math.min(Math.max(0, deadlineMs - now()), MAX_REMAINING_MS) +
          DEADLINE_GRACE_MS,
      )
    }
    const startingWorker = workerFor(fn, environmentId, request, request.slot)
    let found
    try {
      found = await Promise.race([
        startingWorker.promise,
        new Promise((resolve) => {
          deadline.whileStarting = () => resolve({ timedOut: true })
        }),
      ])
    } catch (error) {
      clearDeadline()
      debug(
        `Dev Mode could not start the local worker for ${fn.key}: ${error.message}`,
      )
      return errorReply(
        'Runtime.Unknown',
        `Dev Mode could not start the local worker for ${fn.key}: ${error.message}`,
      )
    }
    deadline.whileStarting = null
    if (found.busy) {
      clearDeadline()
      debug(
        `Dev Mode left ${requestId} for ${fn.key} to the deployed code: every handler process is busy`,
      )
      return {
        kind: 'not_in_dev',
        reason: 'worker_limit',
        message: workersBusyMessage(maxWorkers),
      }
    }
    if (found.timedOut) {
      // The worker was still being prepared or started: Lambda times the invocation out the same
      // way when the init outlasts it. That start is left to any other invocation waiting on it,
      // and otherwise ended as soon as its worker exists.
      leaveStart(startingWorker.start, startingWorker.promise)
      const reply = errorReply(TIMED_OUT, timedOutMessage())
      emit('start', {
        functionKey: fn.key,
        requestId,
        event,
        newWorker: true,
        ...about,
      })
      const endedAt = now()
      emit('end', {
        functionKey: fn.key,
        requestId,
        event,
        ...about,
        reply,
        durationMs: endedAt - receivedAt,
        initMs: undefined,
        deadlineMs,
        endedAt,
        timeoutSeconds: fn.timeout,
      })
      return reply
    }
    if (found.missing) {
      clearDeadline()
      return errorReply(
        'Runtime.Unknown',
        'Dev Mode received no environment for this Lambda execution environment',
      )
    }
    const { worker, created } = found
    deadline.worker = worker
    const newWorker = beginInvocation(worker, {
      requestId,
      environment: request.environment,
      created,
    })
    emit('start', {
      functionKey: fn.key,
      requestId,
      event,
      ...about,
      newWorker,
    })
    let startedAt = null
    const reply = await worker.channel.dispatch({
      headers,
      event: request.event,
      token: deadline,
      onStarted: () =>
        guarded('record the start of an invocation', () => {
          startedAt = now()
          markStarted(worker, { requestId, startedAt, newWorker })
        }),
    })
    const finish = (extra = {}) => {
      clearDeadline()
      endInvocation(worker, {
        requestId,
        initError: reply.kind === 'init_error',
      })
      const endedAt = now()
      emit('end', {
        functionKey: fn.key,
        requestId,
        event,
        ...about,
        reply,
        durationMs: endedAt - (startedAt ?? receivedAt),
        initMs: newWorker ? worker.initMs : undefined,
        deadlineMs: hasDeadline ? deadlineMs : undefined,
        endedAt,
        timeoutSeconds: fn.timeout,
        ...extra,
      })
      guarded('schedule the local worker after an invocation', () =>
        afterInvocation(worker),
      )
    }
    if (reply.kind !== 'stream') {
      finish()
      return reply
    }
    deadline.stream = { ended: false }
    // The deadline can pass between the stream's start and this line.
    if (deadline.timedOut) killWorker(worker)
    // A stream cut off at its deadline ends the way Lambda ends it: with the timeout error.
    const ended = reply.ended.then((trailers) => {
      deadline.stream.ended = true
      return deadline.timedOut && trailers?.aborted
        ? {
            errorType: TIMED_OUT,
            errorBody: Buffer.from(
              JSON.stringify({
                errorType: TIMED_OUT,
                errorMessage: timedOutMessage(),
              }),
            ).toString('base64'),
          }
        : trailers
    })
    const body = new PassThrough()
    // Counted as the caller receives the body: a stream's HTTP prelude is not part of it.
    const chunks = createBodyChunkCounter({
      contentType: reply.contentType,
      limit: PRELUDE_LIMIT,
    })
    let firstByteMs
    let head = Buffer.alloc(0)
    const bodyHead = []
    let bodyHeadBytes = 0
    let bodyBytes = 0
    reply.body.on('data', (chunk) => {
      chunks.add(chunk)
      if (firstByteMs === undefined) {
        firstByteMs = now() - (startedAt ?? receivedAt)
      }
      if (head.length < PRELUDE_LIMIT) {
        head = Buffer.concat([head, chunk]).subarray(0, PRELUDE_LIMIT)
      }
      bodyBytes += chunk.length
      if (bodyHeadBytes < STREAM_HEAD_BYTES) {
        const piece = chunk.subarray(0, STREAM_HEAD_BYTES - bodyHeadBytes)
        bodyHead.push(piece)
        bodyHeadBytes += piece.length
      }
    })
    reply.body.pipe(body)
    ended
      .then((trailers) =>
        finish({
          trailers,
          chunks: chunks.count,
          firstByteMs,
          head,
          contentType: reply.contentType,
          bodyHead: Buffer.concat(bodyHead),
          bodyBytes,
        }),
      )
      .catch((error) =>
        debug(
          `Dev Mode could not finish the streamed invocation ${requestId}: ${error?.message ?? error}`,
        ),
      )
    return { ...reply, body, ended }
  }

  return dispatchInvocation
}
