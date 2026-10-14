/**
 * The laptop half of the relay: requests from the session's bridges arrive here (on the session's
 * `up` topic), run through the laptop runtime's `invoke`, and their results go back to the
 * execution environment that sent them (its `down` topic).
 *
 * The acceptance rule: a request runs on this machine only after its `accepted` frame was
 * published. Until the bridge has it, the bridge is free to give the invocation to the deployed
 * code: it waits ACCEPT_WINDOW_MS after sending, and never past ACCEPT_MARGIN_MS before Lambda's
 * deadline. This machine keeps ACCEPT_RETURN_MS of that window for the acceptance's trip back, and
 * a request already older than the rest (its age is its delay over the fastest trip seen) is
 * refused with `expired`: nothing runs, and the deployed code answers it.
 *
 * Once a request is accepted it is always answered: with its result, or, when relaying it fails
 * (the deployment bucket, a publish, the stream), with Runtime.DevModeRelayFailed naming the cause,
 * so the caller never waits for its timeout. An acceptance whose publish failed without an answer
 * from AWS IoT Core (the connection dropped) may still have reached the bridge, which then waits
 * for a result: nothing ran here, so after the next reconnect the bridge is told `expired`, and the
 * deployed code answers. A request id is not otherwise remembered: Lambda keeps it on an
 * asynchronous retry, which runs again, while AWS IoT Core's copies of one message are dropped by
 * the protocol's opener.
 */
import { randomBytes as nodeRandomBytes } from 'crypto'
import {
  KIND,
  REPLAY_ENVIRONMENT_ID,
  createOpener,
  createSealer,
  topicsOf,
} from './protocol.js'
import {
  ACCEPT_WINDOW_MS,
  RETURN_TRIP_MS,
  createLambdaClock,
  remainingOf,
} from './clock.js'
import { EMPTY, createSender, describe, failure } from './relay-send.js'
import { createStreamSender } from './relay-stream.js'
import { cliCommand } from '../commands/cli-names.js'

/** How long the bridge waits for an acceptance (its AcceptWindow), defined with the clock. */
export { ACCEPT_WINDOW_MS }
export { RELAY_FAILED } from './relay-send.js'
export {
  STREAM_COALESCE_MS,
  STREAM_OBJECT_BYTES,
  STREAM_WINDOW,
} from './relay-stream.js'

/** How long before Lambda's deadline the bridge stops waiting (its MinRemaining). */
export const ACCEPT_MARGIN_MS = 1_000
/** The part of the window kept for the acceptance's trip back to the bridge. */
export const ACCEPT_RETURN_MS = 1_500
/**
 * How long after a request arrived the bridge is still told, on a reconnect, that its acceptance
 * may have reached it in vain (see `reconnected`). Lambda runs a failed asynchronous invocation
 * again with the same request id no sooner than a minute after it ended, so an `expired` sent
 * within this can only concern the attempt this machine saw.
 */
export const UNSENT_ACCEPTANCE_MS = 50_000
/** After its deadline, the bridge waits about this much longer for a result. */
const RESULT_GRACE_MS = 1_000
/**
 * An answer before the acceptance (a refusal, or a request for the environment) is worth sending
 * only while the bridge waits for it: until its acceptance window closes, plus this much for the
 * clocks' disagreement. After that the pacer drops it, so a burst of refusals never holds back an
 * acceptance behind answers nobody waits for.
 */
export const REFUSAL_GRACE_MS = 1_000
/** How long a bridge waits for an upload URL it asked for (its UploadWait). */
export const UPLOAD_WAIT_MS = 2_000
const REMEMBERED_ENVIRONMENTS = 1024
// An execution environment id is part of a topic: no level separators or wildcards.
const ENVIRONMENT_ID = /^[A-Za-z0-9_-]{1,64}$/
// More invocations than one execution environment could run between two reports.
const MAX_PASSED_COUNT = 1_000_000
// More entries than a bridge reports: one per reason for its one function.
const MAX_PASSED_ENTRIES = 16

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isRequestId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 256

/**
 * The bridge's acceptance window for a request with this much time left (absent, 0 or more than a
 * Lambda invocation can have: unknown).
 */
const acceptWindow = (remainingMs) => {
  const remaining = remainingOf(remainingMs)
  return remaining === null
    ? ACCEPT_WINDOW_MS
    : Math.min(ACCEPT_WINDOW_MS, remaining - ACCEPT_MARGIN_MS)
}

/** The entry for `key`, made the most recent: an entry in use is never the first one forgotten. */
const recall = (map, key) => {
  if (!map.has(key)) return undefined
  const value = map.get(key)
  map.delete(key)
  map.set(key, value)
  return value
}

const remember = (map, key, value, limit) => {
  map.delete(key)
  map.set(key, value)
  if (map.size > limit) map.delete(map.keys().next().value)
}

// AWS IoT Core's refusals of a message for its rate or quota (MQTT 5 0x96, 0x97).
const RATE_REFUSALS = new Set([0x96, 0x97])

/**
 * Why an acceptance whose publish failed was not sent: refused by AWS IoT Core for its rate
 * ('paced') or for another reason ('refused', with the code), or never sent ('not_sent': no
 * connection, which the connection line says).
 */
const notSentReason = (error) => {
  const code = error?.reasonCode
  if (!Number.isInteger(code)) return { reason: 'not_sent' }
  if (RATE_REFUSALS.has(code)) return { reason: 'paced' }
  return { reason: 'refused', reasonCode: code }
}

export const createRelay = ({
  sessionId,
  key,
  functions,
  runtime,
  publish,
  sideChannel = { enabled: false, reason: 'it is not set up' },
  now = Date.now,
  timers,
  logger,
  onNotRun = () => {},
  onPassed = () => {},
  randomBytes = nodeRandomBytes,
  // How many execution environments are remembered; the one unused the longest goes first.
  rememberedEnvironments = REMEMBERED_ENVIRONMENTS,
}) => {
  const topics = topicsOf(sessionId)
  const seal = createSealer({ key, randomBytes })
  const open = createOpener({ key })
  const clock = createLambdaClock()
  // The variables of each execution environment of each function, as its bridge first sent them:
  // a bridge sends the same ones on every connection, so a later different set was not its.
  const environments = new Map()
  // The function of each execution environment seen: one environment runs one function.
  const owners = new Map()
  const environmentKey = (functionKey, environmentId) =>
    `${functionKey}\u0000${environmentId}`
  // Acceptances whose publish failed without an answer, by request id: { environmentId, until }.
  const unsentAcceptances = new Map()
  const running = new Set()
  // Streams waiting to send their small writes together: drain() sends them at once.
  const coalescing = new Set()
  let stopping = false
  let draining = false
  let dropped = 0
  // Requests refused as too old (stale): in all, and stamped ones in a row with no other between.
  let staleCount = 0
  let staleInARow = 0

  const debug = (text) => {
    try {
      logger.debug(text)
    } catch {
      // Nothing to tell it with.
    }
  }
  const notRun = (details) => {
    try {
      onNotRun(details)
    } catch (error) {
      debug(
        `Dev Mode could not count a request it did not run: ${describe(error)}`,
      )
    }
  }
  const passed = (details) => {
    try {
      onPassed(details)
    } catch (error) {
      debug(
        `Dev Mode could not count invocations that ran the deployed code: ${describe(error)}`,
      )
    }
  }

  /**
   * A bridge's count of the invocations it handed to the deployed code while this session could
   * not be reached. Only counts of this session's functions, for that reason, as integers, pass.
   */
  const handlePassed = ({ header, body }) => {
    if (stopping) return
    let report
    try {
      report = JSON.parse(body.toString('utf8'))
    } catch {
      debug('Dev Mode ignored a count of invocations that did not parse')
      return
    }
    const since = Number.isSafeInteger(report?.since) ? report.since : null
    const counts = Array.isArray(report?.counts) ? report.counts : []
    for (const entry of counts.slice(0, MAX_PASSED_ENTRIES)) {
      const functionKey =
        typeof entry?.fn === 'string' ? functions.get(entry.fn) : undefined
      const count = entry?.n
      if (
        !functionKey ||
        entry.reason !== 'offline' ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > MAX_PASSED_COUNT
      ) {
        continue
      }
      passed({ functionKey, count, since, environmentId: header.env ?? null })
    }
  }

  const {
    publishFrame,
    trySend,
    spareUpload,
    sendOrFail,
    sendBuffered,
    sendFailure,
  } = createSender({ topics, seal, publish, sideChannel, debug })
  const { sendStream } = createStreamSender({
    sendOrFail,
    spareUpload,
    sideChannel,
    timers,
    coalescing,
    isDraining: () => draining,
  })

  /** Everything after the acceptance: the event, the invocation and its result. */
  const runAccepted = async ({
    header,
    body,
    functionKey,
    environment,
    deadline,
    slot,
  }) => {
    const { env: environmentId, id } = header
    const resultDeadline =
      deadline === null
        ? undefined
        : deadline + RETURN_TRIP_MS + RESULT_GRACE_MS
    const stream = { started: false, startSent: false, sent: [] }
    try {
      let event = body
      if (header.s3) {
        if (!sideChannel.enabled) {
          throw new Error(
            `Its event is in the deployment bucket, which Dev Mode cannot use: ${sideChannel.reason}.`,
          )
        }
        try {
          event = await sideChannel.download(header.s3)
        } catch (error) {
          throw failure(
            "Dev Mode could not download this invocation's event from the deployment bucket",
            error,
          )
        }
      }
      const headers = isPlainObject(header.headers) ? { ...header.headers } : {}
      if (deadline === null) delete headers['lambda-runtime-deadline-ms']
      else headers['lambda-runtime-deadline-ms'] = String(deadline)
      const reply = await runtime.invoke({
        functionKey,
        environmentId,
        headers,
        event: Buffer.from(event ?? EMPTY),
        environment,
        slot,
      })
      switch (reply?.kind) {
        case KIND.EXPIRED:
        case KIND.NOT_IN_DEV:
          // The runtime did not run it: the deployed code answers. One it had no process for (its
          // process went away after the reservation, with every other one busy) is counted.
          if (reply.reason === 'worker_limit') {
            notRun({ id, functionKey, reason: 'worker_limit' })
          }
          await trySend(environmentId, { kind: reply.kind, id }, EMPTY, {
            deadline: resultDeadline,
          })
          return
        case 'stream':
          await sendStream(environmentId, reply, id, resultDeadline, stream)
          return
        case KIND.RESPONSE:
        case KIND.ERROR:
        case KIND.INIT_ERROR:
          await sendBuffered(environmentId, reply, id, resultDeadline)
          return
        default:
          throw new Error(
            `The laptop runtime answered with ${typeof reply?.kind === 'string' ? reply.kind : 'nothing'}`,
          )
      }
    } catch (error) {
      await sendFailure(
        environmentId,
        id,
        stream,
        describe(error),
        resultDeadline,
      )
    } finally {
      // The runtime takes the reserved place when it starts a process; one not used goes back.
      slot?.release()
    }
  }

  /**
   * A request this machine did not take never reads its event from the deployment bucket: it is
   * deleted here, with its version, as a download would. A failed delete is left to the sweep.
   */
  const discardEvent = async ({ s3, id }) => {
    if (!s3 || !sideChannel?.enabled || !sideChannel.discard) return
    try {
      await sideChannel.discard(s3)
    } catch (error) {
      debug(
        `Dev Mode could not delete the event of ${id} from the deployment bucket (the session's sweep removes it): ${describe(error)}`,
      )
    }
  }

  /** Decides on an offered invocation; true when it was accepted and ran here. */
  const offer = async ({ header, body }, receivedAt) => {
    const { env: environmentId, id } = header
    if (!ENVIRONMENT_ID.test(environmentId ?? '') || !isRequestId(id)) {
      debug('Dev Mode ignored a request without an execution environment or id')
      return
    }
    // A new invoke with this id is Lambda running it again: it is decided on its own.
    unsentAcceptances.delete(id)
    // An answer before the acceptance matters only while the bridge waits for one.
    const refuse = (kind) =>
      trySend(environmentId, { kind, id }, EMPTY, {
        deadline:
          receivedAt + acceptWindow(header.remainingMs) + REFUSAL_GRACE_MS,
      })
    if (stopping) {
      await refuse(KIND.NOT_IN_DEV)
      return
    }
    const functionKey =
      typeof header.fn === 'string' ? functions.get(header.fn) : undefined
    if (!functionKey) {
      debug(
        `Dev Mode left ${id} to the deployed code: its function is not in this session`,
      )
      await refuse(KIND.NOT_IN_DEV)
      return
    }
    // An environment that runs another function, or replay's own, is not this one's: whoever
    // sent it holds the session key but is not that environment's bridge. Nothing is answered.
    const owner = recall(owners, environmentId)
    if (
      environmentId === REPLAY_ENVIRONMENT_ID ||
      (owner !== undefined && owner !== functionKey)
    ) {
      debug(
        `Dev Mode ignored ${id}: its execution environment ${environmentId} ${environmentId === REPLAY_ENVIRONMENT_ID ? 'is the one replays run in' : 'runs another function'}`,
      )
      return
    }
    const { ageMs, deadline, stale } = clock.observe({
      sentAt: header.sentAt,
      remainingMs: header.remainingMs,
      receivedAt,
    })
    // Stamped requests that look too old, one after another, mean this machine's clock moved.
    if (!stale) staleInARow = 0
    else if (typeof header.sentAt === 'number') staleInARow += 1
    const key = environmentKey(functionKey, environmentId)
    // A stale request binds its environment too: the expired answer goes to down/<environment>,
    // which anyone with the key reads, and an unbound id there could be taken over.
    if (owner === undefined) {
      remember(owners, environmentId, functionKey, rememberedEnvironments)
    }
    if (isPlainObject(header.environment)) {
      const kept = recall(environments, key)
      if (kept === undefined) {
        remember(environments, key, header.environment, rememberedEnvironments)
      } else if (JSON.stringify(kept) !== JSON.stringify(header.environment)) {
        debug(
          `Dev Mode kept the variables execution environment ${environmentId} of ${functionKey} sent first: ${id} brought others`,
        )
      }
    }
    const budget = acceptWindow(header.remainingMs) - ACCEPT_RETURN_MS - ageMs
    if (stale || budget <= 0 || (deadline !== null && deadline <= receivedAt)) {
      debug(
        stale
          ? `Dev Mode left ${id} to the deployed code: it was not offered moments ago (it has no time it was sent, it is a replay, or this machine's clock moved by more than a minute; if every request is refused, start ${cliCommand('dev')} again)`
          : `Dev Mode left ${id} to the deployed code: it arrived too late to be accepted (${ageMs} ms slower than the fastest trip)`,
      )
      if (stale) {
        staleCount += 1
        notRun({ id, functionKey, reason: 'stale', staleInARow })
      } else {
        notRun({ id, functionKey, reason: 'expired' })
      }
      await refuse(KIND.EXPIRED)
      return
    }
    const environment = recall(environments, key)
    if (!environment) {
      await refuse(KIND.NEED_ENVIRONMENT)
      return
    }
    // A request this machine has no handler process for (every one is busy) is never accepted:
    // the deployed code answers it.
    const slot = runtime.reserve
      ? runtime.reserve({ functionKey, environmentId })
      : undefined
    if (slot === null) {
      debug(
        `Dev Mode left ${id} to the deployed code: every handler process on this machine is busy`,
      )
      notRun({ id, functionKey, reason: 'worker_limit' })
      await refuse(KIND.NOT_IN_DEV)
      return
    }
    // The acceptance must reach the bridge before its window closes; if it cannot be sent in time,
    // nothing runs here and the deployed code answers.
    let accepted = false
    let dropped
    try {
      accepted =
        (await publishFrame(environmentId, { kind: KIND.ACCEPTED, id }, EMPTY, {
          // Its window is the shortest of all: it goes ahead of every other frame.
          priority: 'acceptance',
          deadline: receivedAt + budget,
          onDropped: (reason) => {
            dropped = reason
          },
        })) === true
    } catch (error) {
      debug(
        `Dev Mode left ${id} to the deployed code: its acceptance could not be sent: ${describe(error)}`,
      )
      const why = notSentReason(error)
      if (why.reason === 'not_sent') {
        remember(
          unsentAcceptances,
          id,
          { environmentId, until: receivedAt + UNSENT_ACCEPTANCE_MS },
          REMEMBERED_ENVIRONMENTS,
        )
      }
      notRun({ id, functionKey, ...why })
      slot?.release()
      return
    }
    if (!accepted) {
      slot?.release()
      debug(
        `Dev Mode left ${id} to the deployed code: its acceptance was not sent in time (${dropped ?? 'not sent'})`,
      )
      // Only a wait for the message rate is pacing; a wait for acknowledgements on a slow link,
      // or a request already out of time, arrived too late.
      notRun({
        id,
        functionKey,
        reason: dropped === 'link' || dropped === 'late' ? 'expired' : 'paced',
      })
      return
    }
    await runAccepted({
      header,
      body,
      functionKey,
      environment,
      deadline,
      slot,
    })
    return true
  }

  const handleInvoke = async (message, receivedAt) => {
    let ran = false
    try {
      ran = await offer(message, receivedAt)
    } finally {
      // After its answer: the deployed code is not kept waiting for the delete.
      if (!ran) await discardEvent(message.header)
    }
  }

  const handleUploadRequest = async (
    { env: environmentId, id },
    receivedAt,
  ) => {
    if (!ENVIRONMENT_ID.test(environmentId ?? '') || !isRequestId(id)) return
    const upload = stopping ? undefined : await spareUpload()
    // Stopping may have begun while the URL was signed: an object uploaded after the session's
    // last sweep would stay behind. The answer matters only while the bridge waits for it.
    await trySend(
      environmentId,
      upload && !stopping
        ? { kind: KIND.UPLOAD_URL, id, upload }
        : { kind: KIND.NOT_IN_DEV, id },
      EMPTY,
      { deadline: receivedAt + UPLOAD_WAIT_MS },
    )
  }

  const track = (promise) => {
    running.add(promise)
    promise
      .catch((error) =>
        debug(`Dev Mode could not relay an invocation: ${describe(error)}`),
      )
      .finally(() => running.delete(promise))
  }

  return {
    /**
     * Every message delivered to this machine's connection; never throws. Only sealed frames on
     * the session's `up` topic count; the bridges' liveness questions (empty messages on its `ping`
     * topic) and anything else are ignored, and a frame that does not open is dropped and counted.
     */
    receive(topic, payload) {
      try {
        if (topic !== topics.up || !payload?.length) return
        const receivedAt = now()
        const frame = open(topic, payload)
        if (!frame) {
          dropped += 1
          debug(
            `Dev Mode dropped a message on the session's topic that did not open (${dropped} so far)`,
          )
          return
        }
        if (frame.header.kind === KIND.INVOKE) {
          track(handleInvoke(frame, receivedAt))
        } else if (frame.header.kind === KIND.UPLOAD_URL_REQUEST) {
          track(handleUploadRequest(frame.header, receivedAt))
        } else if (frame.header.kind === KIND.PASSED) {
          handlePassed(frame)
        }
      } catch (error) {
        debug(`Dev Mode could not take a message: ${describe(error)}`)
      }
    },
    /** From now on every request gets `not_in_dev`: the deployed code answers it. */
    stopAccepting() {
      stopping = true
    },
    /**
     * Waits up to `ms` for the invocations already accepted to send their results. Streams send
     * their small writes at once from now on.
     */
    async drain(ms) {
      draining = true
      for (const stream of [...coalescing]) stream.flushNow()
      if (!running.size) return
      let timer
      await Promise.race([
        Promise.allSettled([...running]),
        new Promise((resolve) => {
          timer = timers.setTimeout(resolve, ms)
        }),
      ])
      timers.clearTimeout(timer)
    },
    /** The requests being handled: accepted and running, or still being decided. */
    inFlight: () => running.size,
    /** How many messages on the session's topic did not open. */
    droppedFrames: () => dropped,
    /** How many requests were refused as too old to be ones a bridge offered moments ago. */
    staleFrames: () => staleCount,
    /**
     * After every reconnect: the trips seen before it no longer say how old a request is, and each
     * acceptance whose publish failed without an answer is followed by `expired`, so a bridge that
     * got it anyway hands the invocation to the deployed code instead of waiting for its result.
     * One is forgotten once its `expired` was sent or refused by AWS IoT Core; one that failed to
     * send (the connection dropped again) is sent after the next reconnect.
     */
    reconnected() {
      clock.reset()
      const at = now()
      for (const [id, entry] of unsentAcceptances) {
        const { environmentId, until } = entry
        if (until <= at) {
          unsentAcceptances.delete(id)
          continue
        }
        const forget = () => {
          // A new invoke with this id may have replaced the entry meanwhile.
          if (unsentAcceptances.get(id) === entry) unsentAcceptances.delete(id)
        }
        track(
          publishFrame(environmentId, { kind: KIND.EXPIRED, id }, EMPTY, {
            deadline: until,
          }).then(
            (sent) => {
              if (sent === true) forget()
              else {
                debug(
                  `Dev Mode did not send expired for ${id}: its deadline passed first`,
                )
              }
            },
            (error) => {
              debug(
                `Dev Mode could not send expired for ${id}: ${describe(error)}`,
              )
              if (Number.isInteger(error?.reasonCode)) forget()
            },
          ),
        )
      }
    },
  }
}
