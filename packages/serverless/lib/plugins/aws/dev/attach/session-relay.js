/**
 * The session's side of the relay plumbing: whether the sessions holding the service's functions
 * are still running (asked once, before anything changes); this machine's AWS IoT Core connection
 * (connected before anything is attached, so a missing permission fails the session while nothing
 * has changed), the lines it prints when the connection drops, comes back or cannot be re-signed,
 * and the goodbye on stop; then, once functions are attached, the deployment bucket for large
 * payloads and the warnings about invocations that ran the deployed code.
 */
import { S3Client } from '@aws-sdk/client-s3'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { addProxyToAwsClient } from '@serverless/util/src/proxy/index.js'
import { credentialProvider } from './aws.js'
import { createCredentialCache } from '../relay/credentials.js'
import { createTransport } from '../relay/transport.js'
import { KIND, createSealer, topicsOf } from '../relay/protocol.js'
import { LIVENESS, sessionsLiveness } from '../relay/liveness.js'
import {
  connectionLostLine,
  createAwayCount,
  createClockWarning,
  createNotRunWarning,
  lateLine,
  refusedLine,
  credentialsExpiredLine,
  credentialsWorkAgainLine,
  endpointWaitLine,
  livenessDeniedLine,
  livenessUnansweredLine,
  reconnectedLine,
  sideChannelOffLine,
  throughputLine,
  workersBusyLine,
} from '../relay/messages.js'
import { readAttachment, variablesOf } from './undo-record.js'
import { TIMED_OUT, within } from './session-support.js'
import { coalescePassedThrough, scrubLine } from '../state/events.js'
import {
  createUpRouter,
  createWebPublish,
  createWebRelay,
} from '../web/relay.js'

/** How long a stop waits for invocations this machine already accepted to send their results. */
export const DRAIN_MS = 10_000

/**
 * How long the end of a session waits to empty its prefix in the deployment bucket, after "Dev
 * Mode off": what is left then, the next session's start removes.
 */
export const SWEEP_MS = 10_000

/**
 * How long the start waits to learn whether other sessions are running. Each question gives up
 * after five seconds on its own; this bounds the whole check, credentials included.
 */
export const LIVENESS_WAIT_MS = 8_000

/** A connection-lost reason as its record keeps it: one line, without URLs. */
const recordReason = (reason) => scrubLine(reason ?? 'the connection closed')

/**
 * What the relay saw but left to the deployed code, as `invocation.passed_through` reasons:
 * arrived too late, held back by the message rate, refused by AWS IoT Core, refused because it was
 * not offered moments ago (the clock), accepted with no connection to send the acceptance, and
 * not accepted because every handler process on this machine was busy.
 */
const PASSED_REASONS = Object.freeze({
  expired: 'late',
  paced: 'paced',
  refused: 'refused',
  stale: 'clock_off',
  not_sent: 'offline',
  worker_limit: 'worker_limit',
})

const debugLine = (logger, what, error) => {
  try {
    logger.debug(`${what}: ${error?.message ?? error}`)
  } catch {
    // Logging never fails the session.
  }
}

export const startRelayConnection = async ({
  region,
  iotEndpoint,
  sessionId,
  sessionKey,
  resolveCredentials,
  credentialSource,
  logger,
  // The session's spinner, which says when the first connection waits for its endpoint.
  spinner,
  timers,
  now = Date.now,
  connectTransport = createTransport,
  // The session's credential cache, when it already has one.
  credentials = createCredentialCache({ resolve: resolveCredentials }),
  // Writes one event-log record: `record(type, fields)`.
  record = () => {},
}) => {
  const seal = createSealer({ key: sessionKey })
  const topics = topicsOf(sessionId)
  let receiver = () => {}
  const reconnectListeners = []
  // Set once the session stops: nothing about the connection is said after that.
  let quiet = false
  const transport = connectTransport({
    endpoint: iotEndpoint,
    region,
    sessionId,
    credentials: () => credentials.refresh(),
    credentialSource,
    goneFrame: () => seal(topics.gone, { kind: KIND.GONE }),
    onMessage: (topic, payload) => receiver(topic, payload),
    onState: (event) => {
      if (event.state === 'reconnected') {
        for (const listener of reconnectListeners) listener()
      }
      // The record first: written also while the lines are quiet (during the stop).
      if (event.state === 'lost') {
        record('connection.lost', { reason: recordReason(event.reason) })
      } else if (event.state === 'reconnected') {
        record('connection.restored', { offline_ms: event.offlineMs })
      } else if (event.state === 'credentials_expired') {
        record('credentials.expired', {})
      } else if (event.state === 'credentials_refreshed') {
        record('credentials.refreshed', {})
      }
      if (quiet) return
      if (event.state === 'endpoint_unresolved') {
        spinner?.notice(endpointWaitLine(event.region))
      } else if (event.state === 'lost')
        logger.warning(connectionLostLine(event.reason))
      else if (event.state === 'reconnected') {
        logger.notice(reconnectedLine(event.offlineMs))
      } else if (event.state === 'credentials_expired') {
        logger.warning(credentialsExpiredLine(credentialSource))
      } else if (event.state === 'credentials_refreshed') {
        // The reconnected line follows; the record says it too.
        logger.debug(credentialsWorkAgainLine())
      }
    },
    timers,
    now,
  })
  await transport.start()
  let stopping = null
  return {
    transport,
    credentials,
    /** Where every message on the session's topics goes (the relay, once the runtime runs). */
    setReceiver(fn) {
      receiver = fn
    },
    /** Called on every reconnect, before the reconnected line. */
    onReconnected(fn) {
      reconnectListeners.push(fn)
    },
    /** From the start of the session's stop on, the connection's state is not told any more. */
    quiet() {
      quiet = true
    },
    /** Says goodbye (bridges then run the deployed code at once) and disconnects. */
    stop() {
      stopping ??= transport
        .stop()
        .catch((error) =>
          debugLine(
            logger,
            'Dev Mode could not close its AWS IoT Core connection cleanly',
            error,
          ),
        )
      return stopping
    },
  }
}

/**
 * What the laptop runtime's relay needs once functions are attached: the deployment bucket for
 * payloads above one message (said once when it cannot be used), and the warnings about
 * invocations that ran the deployed code (this machine too slow to take them, its clock moved, or
 * the bridges could not reach it).
 * With `web` (web apps attached), the web apps' relay too (../web/relay.js): it gets the session's
 * `request` frames and its web bridges' upload URL requests, the functions' relay (which the
 * laptop runtime sets with `relay.connection.setReceiver`) everything else.
 * `quiet()` (when the session's stop begins) ends the warnings and their timer, and the web relay
 * takes no new request; `drain(ms)` waits for the web requests already accepted; `stop()` also
 * empties the session's prefix in the bucket. None throws.
 */
export const openRelayRun = async ({
  connection,
  openSideChannel,
  provider,
  serverless,
  sessionId,
  sessionKey,
  // The S3 client for the deployment bucket; by default one with the developer's credentials.
  s3,
  deployedNames,
  logger,
  timers,
  now = Date.now,
  sweepMs = SWEEP_MS,
  // Writes one event-log record, `record(type, fields)`; without it nothing is counted.
  record,
  // How long the requests left to the deployed code are summed before their record is written.
  passedWindowMs = 1_000,
  // Web apps attached: `{ functions, dispatch, credentials, recorder, isServing }`, as
  // createWebRelay takes them (`functions`: web function name -> web app key).
  web,
}) => {
  const sideChannel = await openSideChannel({
    provider,
    serverless,
    sessionId,
    key: sessionKey,
    // The cache returns the same object until a refresh, so presigning reuses one client.
    credentials: () => connection.credentials.current(),
    s3:
      s3 ??
      addProxyToAwsClient(
        new S3Client({
          region: provider.getRegion(),
          credentials: credentialProvider(provider),
        }),
      ),
    logger,
    now,
    timers,
  })
  if (!sideChannel.enabled) {
    logger.warning(sideChannelOffLine(sideChannel.reason))
  }
  const warn = (line) => logger.warning(line)
  const throughput = createNotRunWarning({
    warn,
    now,
    timers,
    line: throughputLine,
  })
  const late = createNotRunWarning({ warn, now, timers, line: lateLine })
  const workersBusy = createNotRunWarning({
    warn,
    now,
    timers,
    line: workersBusyLine,
  })
  const refused = createNotRunWarning({
    warn,
    now,
    timers,
    line: refusedLine,
  })
  const clock = createClockWarning({ warn })
  const passed = record
    ? coalescePassedThrough({ emit: record, timers, windowMs: passedWindowMs })
    : null
  // What the bridges ran on the deployed code while this machine could not be reached: one line
  // after a reconnect, and a record per function.
  const away = createAwayCount({
    warn,
    record: (fields) => {
      try {
        record?.('invocation.passed_through', fields)
      } catch (error) {
        debugLine(
          logger,
          'Dev Mode could not record invocations that ran the deployed code',
          error,
        )
      }
    },
    timers,
  })
  connection.onReconnected?.(() => away.reconnected())
  let webRelay = null
  let webPublish = null
  let relayConnection = connection
  if (web) {
    webPublish = createWebPublish({
      publish: (message) => connection.transport.publish(message),
      now,
      timers,
    })
    webRelay = createWebRelay({
      ...web,
      sessionId,
      key: sessionKey,
      sideChannel,
      publish: webPublish.publish,
      now,
      timers,
      logger,
    })
    const router = createUpRouter({
      sessionId,
      key: sessionKey,
      web: webRelay,
    })
    connection.setReceiver(router.receive)
    connection.onReconnected?.(() => webRelay.reconnected())
    // The functions' relay receives through the router.
    relayConnection = { ...connection, setReceiver: router.setOthers }
  }
  let quiet = false
  const silence = () => {
    quiet = true
    throughput.stop()
    late.stop()
    workersBusy.stop()
    refused.stop()
    passed?.stop()
    away.stop()
    webRelay?.stopAccepting()
  }
  let stopping = null
  return {
    relay: {
      connection: relayConnection,
      sessionId,
      sessionKey,
      deployedNames,
      sideChannel,
      // Each refusal is said with its cause: a stale request may mean the clock moved; a late one
      // came after this machine was asleep, over a slow link, or out of time; a paced one met the
      // relay's rate or AWS IoT Core's rate or quota; a refused one was refused by AWS IoT Core
      // for another reason, named by its code. Only one whose acceptance found no connection
      // ('not_sent') adds nothing: the connection line says it.
      onNotRun: ({ functionKey, reason, staleInARow, reasonCode } = {}) => {
        if (quiet) return
        if (PASSED_REASONS[reason]) {
          passed?.add({ functionKey, reason: PASSED_REASONS[reason] })
        }
        if (reason === 'stale') clock.stale(staleInARow)
        else if (reason === 'expired') late.notRun()
        else if (reason === 'paced') throughput.notRun()
        else if (reason === 'refused') refused.notRun(reasonCode)
        else if (reason === 'worker_limit') workersBusy.notRun()
      },
      onPassed: (details) => {
        if (!quiet) away.passed(details)
      },
    },
    quiet: silence,
    /** The web apps' relay, when web apps are attached. */
    web: webRelay,
    /** Waits up to `ms` for the web requests already accepted to send their responses. */
    drain: (ms) => webRelay?.drain(ms) ?? Promise.resolve(),
    stop() {
      stopping ??= (async () => {
        silence()
        webPublish?.close()
        if (!sideChannel.enabled) return
        // Ended when it outlasts sweepMs: its S3 request is aborted, so nothing it started keeps
        // the process alive after "Dev Mode off".
        const sweepCut = new AbortController()
        const sweeping = Promise.resolve()
          .then(() => sideChannel.sweep({ abortSignal: sweepCut.signal }))
          .catch((error) => {
            if (sweepCut.signal.aborted) return
            debugLine(
              logger,
              'Dev Mode could not remove the payload objects of this session',
              error,
            )
          })
        if ((await within(sweeping, sweepMs, timers)) === TIMED_OUT) {
          sweepCut.abort()
          debugLine(
            logger,
            'Dev Mode stopped waiting to remove the payload objects of this session',
            'the next session removes them',
          )
        }
      })()
      return stopping
    },
  }
}

/**
 * Whether other sessions are running (see liveness.js); never throws. A check that could not be
 * made at all reads as failed for each session.
 */
export const checkSessions = async ({
  sessionIds,
  request = sessionsLiveness,
  ...options
}) => {
  try {
    return await request({ sessionIds, ...options })
  } catch (error) {
    options.debug?.(error)
    return new Map(sessionIds.map((id) => [id, LIVENESS.FAILED]))
  }
}

const otherSessionsOn = (lives, sessionId) => [
  ...new Set(
    [...lives.values()]
      .map((live) => (live ? readAttachment(variablesOf(live))?.session : null))
      .filter((id) => id && id !== sessionId),
  ),
]

const CHECK_FAILED = 'the check through AWS IoT Core failed'
const CREDENTIALS_UNREADABLE = 'your AWS credentials could not be read'
const NO_ANSWER_IN_TIME = 'AWS IoT Core did not answer in time'
const DENIED = 'iot:SendDirectMessage was denied'
/** Answers that say whether a session is running. */
const ANSWERED = new Set([LIVENESS.LIVE, LIVENESS.GONE, LIVENESS.UNKNOWN])

/**
 * Whether the sessions the service's functions are attached to (other than this one) are
 * running, as `known`: `Map<sessionId, liveness>`, which `classifyFunction` reads.
 *
 * - `start(lives)` asks once, before anything changes, about every session found on the
 *   functions. Denied or failed answers keep the rule by owner, with one warning. A session the
 *   answer leaves out is asked again, as `cover` does.
 * - `cover(ids)` asks about sessions not known yet: one that attached after this session looked
 *   (found when a write is retried) was running moments ago. Without an answer that says whether
 *   it runs, it keeps its functions, with one warning.
 *
 * Each question waits at most `waitMs`; then every session it asked about counts as unknown
 * (running, not answering), the question is withdrawn (nothing is sent after that), and one
 * warning says so. Never throws.
 */
export const createSessionLiveness = ({
  sessionId,
  iotEndpoint,
  region,
  credentials,
  check = checkSessions,
  logger,
  timers,
  waitMs = LIVENESS_WAIT_MS,
}) => {
  const known = new Map()
  const asking = new Map()
  const warned = new Set()
  const warnOnce = (line) => {
    if (warned.has(line)) return
    warned.add(line)
    logger.warning(line)
  }
  const unanswered = (reason) => {
    // One line for every session that keeps its functions without an answer.
    if (warned.has('unanswered')) return
    warned.add('unanswered')
    logger.warning(livenessUnansweredLine(reason))
  }
  const debug = (error) =>
    debugLine(
      logger,
      'Dev Mode could not ask AWS IoT Core whether another Dev Mode session is running',
      error,
    )

  /** `{ answers }`, or `{ reason }` when no answer came at all. */
  const ask = async (sessionIds) => {
    const withdraw = new AbortController()
    let timer
    const late = new Promise((resolve) => {
      timer = timers.setTimeout(() => {
        withdraw.abort()
        resolve({ reason: NO_ANSWER_IN_TIME, late: true })
      }, waitMs)
    })
    const asked = (async () => {
      let current
      try {
        current = await credentials.refresh()
      } catch (error) {
        debugLine(
          logger,
          'Dev Mode could not read the AWS credentials to check other Dev Mode sessions',
          error,
        )
        return { reason: CREDENTIALS_UNREADABLE }
      }
      // The wait ended while the credentials were read: the question is not sent.
      if (withdraw.signal.aborted) return { reason: NO_ANSWER_IN_TIME }
      try {
        return {
          answers: await check({
            endpoint: iotEndpoint,
            region,
            credentials: current,
            sessionIds,
            timers,
            signal: withdraw.signal,
            debug,
          }),
        }
      } catch (error) {
        debugLine(
          logger,
          'Dev Mode could not check other Dev Mode sessions',
          error,
        )
        return { reason: CHECK_FAILED }
      }
    })()
    try {
      return await Promise.race([asked, late])
    } finally {
      timers.clearTimeout(timer)
    }
  }

  const cover = async (ids) => {
    const fresh = [...new Set(ids)].filter(
      (id) => id && id !== sessionId && !known.has(id),
    )
    const waiting = fresh.filter((id) => asking.has(id))
    const sessionIds = fresh.filter((id) => !asking.has(id))
    if (sessionIds.length) {
      const question = (async () => {
        const { answers, reason } = await ask(sessionIds)
        let without = null
        for (const id of sessionIds) {
          const state = answers?.get(id)
          if (ANSWERED.has(state)) {
            known.set(id, state)
            continue
          }
          known.set(id, LIVENESS.UNKNOWN)
          without ??=
            reason ?? (state === LIVENESS.DENIED ? DENIED : CHECK_FAILED)
        }
        if (without) unanswered(without)
      })()
      for (const id of sessionIds) asking.set(id, question)
      try {
        await question
      } finally {
        for (const id of sessionIds) asking.delete(id)
      }
    }
    await Promise.all(waiting.map((id) => asking.get(id)))
  }

  const start = async (lives) => {
    const sessionIds = otherSessionsOn(lives, sessionId)
    if (!sessionIds.length) return
    const { answers, reason, late } = await ask(sessionIds)
    if (late) {
      for (const id of sessionIds) known.set(id, LIVENESS.UNKNOWN)
      unanswered(reason)
      return
    }
    if (reason) {
      for (const id of sessionIds) known.set(id, LIVENESS.FAILED)
      warnOnce(livenessDeniedLine(reason))
      return
    }
    for (const id of sessionIds) {
      if (answers.has(id)) known.set(id, answers.get(id))
    }
    const states = new Set(known.values())
    if (states.has(LIVENESS.DENIED)) warnOnce(livenessDeniedLine(DENIED))
    else if (states.has(LIVENESS.FAILED)) {
      warnOnce(livenessDeniedLine(CHECK_FAILED))
    }
    await cover(sessionIds.filter((id) => !known.has(id)))
  }

  return {
    known,
    start,
    cover,
    /** `cover` for the session the function `live` is attached to, if another one. */
    coverFunction: (live) =>
      cover(otherSessionsOn(new Map([['', live]]), sessionId)),
  }
}
