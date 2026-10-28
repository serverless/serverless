/**
 * The machine's side of a web app's relay: the HTTP requests the web bridge of a dev revision
 * offers (web/bridge/server.mjs) arrive here on the session's `up` topic, run on the web app's
 * local server through `dispatch`, and their responses go back to the execution environment that
 * sent them (its `down` topic), sealed, paced with the web profile.
 *
 * As for a function, a request runs here only after its `accepted` frame was published: until the
 * bridge has it, the bridge is free to give the request to the deployed code (it waits
 * ACCEPT_WINDOW_MS). A request too old to be accepted in time is refused with `expired`; one this
 * machine does not take (the session stopping, a web app not in it, its local server not running)
 * with `not_in_dev`; the first one without the role credentials with `need_environment`. Once
 * accepted, a request is always answered: with the local server's response, with `not_in_dev`
 * when nothing reached the local server (the bridge then runs the deployed code, nothing has been
 * written to the caller yet), or with a short 502 when it failed after that.
 *
 * Responses: `response_start` with the status and headers, the body in numbered `stream_data`
 * frames of at most WEB_BODY_BYTES each, and `stream_end`. A body of at most WEB_BODY_BYTES goes
 * inline; once one grows past it (and it is not an event stream), what follows goes through the
 * deployment bucket: pieces of RESPONSE_OBJECT_BYTES as `stream_data` frames with `s3`, and the
 * rest in `stream_end`'s `s3`. A response keeps streaming either way: what is held when no more of
 * it comes for RESPONSE_COALESCE_MS goes out at once (inline when it fits one frame, else as an
 * object), so a page or a stream written in parts shows as it arrives, while a body written all at
 * once is one object. An event stream (`text/event-stream`) always goes inline, each piece as soon
 * as the local server writes it. Without the deployment bucket, everything goes inline.
 *
 * The role credentials a bridge forwards (`environment`) go to `credentials.update(key, values)`
 * and never into a log line.
 */
import {
  ENVIRONMENT_NAMES,
  KIND,
  WEB_BODY_BYTES,
  createOpener,
  createSealer,
  decodeFrame,
  fitsOneMessage,
  openRaw,
  topicsOf,
} from '../relay/protocol.js'
import { ACCEPT_WINDOW_MS, createLambdaClock } from '../relay/clock.js'
import { WEB_PACING, createPacer } from '../relay/pacer.js'
import {
  EMPTY,
  RELAY_FAILED,
  createSender,
  describe,
} from '../relay/relay-send.js'
import {
  STREAM_COALESCE_MS,
  STREAM_OBJECT_BYTES,
} from '../relay/relay-stream.js'
import {
  ACCEPT_RETURN_MS,
  REFUSAL_GRACE_MS,
  UPLOAD_WAIT_MS,
} from '../relay/relay.js'
import { CREDENTIALS_PATH } from '../attach/naming.js'
import { FAILED_BODY } from './http-dispatch.js'

export { CREDENTIALS_PATH }

/** The largest part of a response sent as one object in the deployment bucket. */
export const RESPONSE_OBJECT_BYTES = STREAM_OBJECT_BYTES
/**
 * How long the start of a response (not an event stream) waits for more of it before the part it
 * has goes out inline: a page streamed in parts shows as it arrives.
 */
export const RESPONSE_COALESCE_MS = STREAM_COALESCE_MS
/** After a drain gave up, how long the aborted requests get to end. */
export const ABORT_GRACE_MS = 1_000
const REMEMBERED_ENVIRONMENTS = 1024
// An execution environment id is part of a topic: no level separators or wildcards.
const ENVIRONMENT_ID = /^[A-Za-z0-9_-]{1,64}$/
const IDLE = Symbol('idle')
const STOPPED = Symbol('stopped')

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isRequestId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 256

/** Headers as the wire carries them: names lower-cased, each value a string or a list of them. */
const wireHeaders = (headers) => {
  const out = {}
  if (!isPlainObject(headers)) return out
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue
    out[name.toLowerCase()] = Array.isArray(value)
      ? value.map(String)
      : String(value)
  }
  return out
}

const isEventStream = (headers) =>
  String([headers['content-type'] ?? ''].flat()[0])
    .trim()
    .toLowerCase()
    .startsWith('text/event-stream')

/** Whether a failed dispatch never reached the local server, so the deployed code can answer. */
const reachedNothing = (error) =>
  error?.notRun === true || error?.code === 'ECONNREFUSED'

const iterate = (body) => {
  if (body === undefined || body === null) return [][Symbol.iterator]()
  if (Buffer.isBuffer(body) || typeof body === 'string') {
    return [Buffer.from(body)][Symbol.iterator]()
  }
  return body[Symbol.asyncIterator]?.() ?? body[Symbol.iterator]()
}

/**
 * The web relay. `functions` maps each attached web function's name to its web app's key;
 * `dispatch({ key, id, method, path, headers, body, source, signal })` resolves
 * `{ status, headers, body }` (body a Readable) from the local server, and rejects with `notRun`
 * (or ECONNREFUSED) when nothing reached it; `signal` aborts when the session's stop outlives its
 * drain, and the response is then no longer read. `isServing(key)`, when given, says whether that
 * local server runs (false: `not_in_dev`); `recorder` is told `start(...)` and `end(...)` of each
 * accepted request; `publish` is the paced publish of `createWebPublish`. `localOnly` holds the
 * keys of the `--local-only` web apps: a GET of CREDENTIALS_PATH for one of them only brings the
 * role credentials, and is answered here with 204 (`need_environment` when it brought none), not
 * dispatched and not recorded; any other request for one of them is refused with `not_in_dev`.
 */
export const createWebRelay = ({
  sessionId,
  key,
  functions,
  dispatch,
  credentials = { update: () => {} },
  isServing,
  localOnly = new Set(),
  sideChannel = { enabled: false, reason: 'it is not set up' },
  publish,
  recorder = { start: () => {}, end: () => {} },
  now = Date.now,
  timers,
  logger,
}) => {
  const topics = topicsOf(sessionId)
  const seal = createSealer({ key })
  const open = createOpener({ key })
  const clock = createLambdaClock()
  // The web app of each execution environment seen: one environment runs one web function.
  const owners = new Map()
  // The web apps whose local servers have the role credentials.
  const withCredentials = new Set()
  const running = new Set()
  // The accepted requests' abort controllers: a stop that outlives its drain aborts them.
  const aborts = new Set()
  let stopping = false

  const debug = (text) => {
    try {
      logger.debug(text)
    } catch {
      // Nothing to tell it with.
    }
  }
  const tell = (what, details) => {
    try {
      recorder[what]?.(details)
    } catch (error) {
      debug(`Dev Mode could not record a web request: ${describe(error)}`)
    }
  }
  const { publishFrame, trySend, spareUpload, sendOrFail } = createSender({
    topics,
    seal,
    publish,
    sideChannel,
    debug,
  })

  /**
   * Forwards the role credentials of a request to the web app's local server; true when the
   * request brought them and they were taken.
   */
  const takeEnvironment = (webKey, environment) => {
    if (!isPlainObject(environment)) return false
    const values = Object.fromEntries(
      ENVIRONMENT_NAMES.filter(
        (name) => typeof environment[name] === 'string' && environment[name],
      ).map((name) => [name, environment[name]]),
    )
    if (!Object.keys(values).length) return false
    try {
      credentials.update(webKey, values)
      withCredentials.add(webKey)
      return true
    } catch (error) {
      debug(
        `Dev Mode could not pass the role credentials to the local server of ${webKey}: ${describe(error)}`,
      )
      return false
    }
  }

  /**
   * Sends one response: its start, then its body as described at the top, then its end.
   * `progress.bytes` counts the body bytes sent so far (inline or in the bucket). Resolves once the
   * end was sent; rejects when the response could not be relayed. `signal`, when it aborts (the
   * session's stop outlived its drain), ends the local server's response the same way.
   */
  const sendResponse = async (
    environmentId,
    id,
    response,
    progress,
    signal,
  ) => {
    const status =
      Number.isInteger(response?.status) &&
      response.status >= 100 &&
      response.status <= 599
        ? response.status
        : 502
    let headers = wireHeaders(response?.headers)
    let start = { kind: KIND.RESPONSE_START, id, status, headers }
    let source = response?.body
    if (!fitsOneMessage(start)) {
      debug(
        `Dev Mode answered ${id} with 502: its headers do not fit one message`,
      )
      headers = { 'content-type': 'text/plain; charset=utf-8' }
      start = { kind: KIND.RESPONSE_START, id, status: 502, headers }
      source?.destroy?.()
      source = FAILED_BODY
    }
    // A frame that could not be sent: the bridge answers the caller itself, nothing follows.
    const sendPart = (what, frame, data, options) =>
      sendOrFail(what, environmentId, frame, data, options).catch((error) => {
        throw Object.assign(error, { unsent: true })
      })
    const iterator = iterate(source)
    // Every read is handled when it is made: one still pending when the response fails (and its
    // source is destroyed) rejects with nobody waiting for it.
    const read = () => {
      const reading = Promise.resolve().then(() => iterator.next())
      reading.catch(() => {})
      return reading
    }
    const stopReading = () => {
      source?.destroy?.()
      Promise.resolve()
        .then(() => iterator.return?.())
        .catch(() => {})
    }
    const onAbort = () => stopReading()
    if (signal?.aborted) stopReading()
    signal?.addEventListener('abort', onAbort, { once: true })
    const eventStream = isEventStream(headers)
    const objects = sideChannel.enabled && !eventStream
    let n = 0
    let toBucket = false
    let pending = []
    let pendingBytes = 0
    const take = () => {
      const data = Buffer.concat(pending)
      pending = []
      pendingBytes = 0
      return data
    }
    const sendInline = async (data) => {
      for (let at = 0; at < data.length; at += WEB_BODY_BYTES) {
        const piece = data.subarray(at, at + WEB_BODY_BYTES)
        const frame = { kind: KIND.STREAM_DATA, id, n }
        n += 1
        await sendPart('part of its response', frame, piece, {
          priority: 'data',
        })
        progress.bytes += piece.length
      }
    }
    const upload = async (data) => {
      try {
        return await sideChannel.upload(data)
      } catch (error) {
        throw new Error(
          `Dev Mode could not upload part of its response to the deployment bucket: ${describe(error)}`,
        )
      }
    }
    const sendObject = async (data) => {
      const s3 = await upload(data)
      const frame = { kind: KIND.STREAM_DATA, id, n, s3 }
      n += 1
      await sendPart('part of its response', frame, EMPTY, { priority: 'data' })
      progress.bytes += data.length
    }
    // What is held goes out when no more of it comes for a moment: inline while it fits one frame
    // (or before the body passed WEB_BODY_BYTES), as an object in the bucket when larger.
    const flushHeld = async () => {
      if (toBucket && pendingBytes > WEB_BODY_BYTES) await sendObject(take())
      else await sendInline(take())
    }
    try {
      await sendPart('the start of its response', start, EMPTY)
      let next = read()
      for (;;) {
        let item
        if (pendingBytes) {
          let timer
          item = await Promise.race([
            next,
            new Promise((resolve) => {
              timer = timers.setTimeout(
                () => resolve(IDLE),
                RESPONSE_COALESCE_MS,
              )
            }),
          ])
          timers.clearTimeout(timer)
          if (item === IDLE) {
            await flushHeld()
            continue
          }
        } else {
          item = await next
        }
        if (item.done) break
        next = read()
        const chunk = Buffer.from(item.value)
        if (!chunk.length) continue
        if (eventStream) {
          await sendInline(chunk)
          continue
        }
        pending.push(chunk)
        pendingBytes += chunk.length
        if (
          !toBucket &&
          objects &&
          progress.bytes + pendingBytes > WEB_BODY_BYTES
        ) {
          toBucket = true
        }
        if (toBucket && pendingBytes >= RESPONSE_OBJECT_BYTES) {
          await sendObject(take())
        } else if (!objects && pendingBytes >= WEB_BODY_BYTES) {
          await sendInline(take())
        }
      }
      if (signal?.aborted) throw new Error('the session stopped')
      const rest = take()
      let s3
      if (toBucket && rest.length) s3 = await upload(rest)
      else await sendInline(rest)
      await sendPart(
        'the end of its response',
        { kind: KIND.STREAM_END, id, count: n, ...(s3 && { s3 }) },
        EMPTY,
      )
      if (s3) progress.bytes += rest.length
    } catch (error) {
      // The local server is not kept writing a response nobody sends.
      stopReading()
      const reason = signal?.aborted
        ? new Error('the session stopped before the response ended')
        : error
      debug(
        `Dev Mode could not relay the response of ${id}: ${describe(reason)}`,
      )
      // The bridge ends the caller's response with the error type.
      if (!error?.unsent) {
        await trySend(
          environmentId,
          { kind: KIND.STREAM_END, id, count: n, errorType: RELAY_FAILED },
          EMPTY,
        )
      }
      throw reason
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /** Everything after the acceptance: the body, the local server's response, the record. */
  const runAccepted = async ({ header, body, webKey, receivedAt }) => {
    const { env: environmentId, id } = header
    const startedAt = now()
    // Aborted when the session's stop outlives its drain.
    const abort = new AbortController()
    aborts.add(abort)
    tell('start', {
      id,
      key: webKey,
      method: header.method,
      path: header.path,
      headers: isPlainObject(header.headers) ? header.headers : {},
      environmentId,
      at: startedAt,
    })
    const end = (fields) =>
      tell('end', {
        id,
        key: webKey,
        at: now(),
        durationMs: now() - receivedAt,
        ...fields,
      })
    const notRun = async (why) => {
      debug(`Dev Mode left ${id} to the deployed code: ${why}`)
      await trySend(environmentId, { kind: KIND.NOT_IN_DEV, id }, EMPTY)
      end({ outcome: 'not_run', status: null, bytes: 0, reason: why })
    }
    try {
      let requestBody = body
      if (header.s3) {
        try {
          requestBody = await sideChannel.download(header.s3)
        } catch (error) {
          // A body existed and was never read: its record says so, and it is not replayed.
          tell('note', { id, requestBodyUnknown: true })
          await notRun(
            `its body could not be read from the deployment bucket (${describe(error)})`,
          )
          return
        }
      }
      let response
      try {
        const dispatching = Promise.resolve().then(() =>
          dispatch({
            key: webKey,
            id,
            method: header.method,
            path: header.path,
            headers: isPlainObject(header.headers) ? { ...header.headers } : {},
            body: Buffer.from(requestBody ?? EMPTY),
            source: 'relay',
            signal: abort.signal,
          }),
        )
        // A response that arrives after the stop gave up on it is not read.
        dispatching.then(
          (late) => {
            if (abort.signal.aborted) late?.body?.destroy?.()
          },
          () => {},
        )
        response = await Promise.race([
          dispatching,
          new Promise((resolve) => {
            if (abort.signal.aborted) resolve(STOPPED)
            abort.signal.addEventListener('abort', () => resolve(STOPPED), {
              once: true,
            })
          }),
        ])
      } catch (error) {
        if (reachedNothing(error)) {
          await notRun(
            `its local server could not be reached (${describe(error)})`,
          )
          return
        }
        debug(`Dev Mode answered ${id} with 502: ${describe(error)}`)
        response = {
          status: 502,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          body: FAILED_BODY,
          failed: describe(error),
        }
      }
      if (response === STOPPED) {
        // Nothing was sent: the bridge answers the caller when the session says goodbye.
        debug(
          `Dev Mode stopped waiting for the local server to answer ${id}: the session stopped`,
        )
        end({
          outcome: 'failed',
          status: null,
          bytes: 0,
          reason: 'the session stopped before the local server answered',
        })
        return
      }
      const progress = { bytes: 0 }
      try {
        await sendResponse(environmentId, id, response, progress, abort.signal)
        end(
          response.failed
            ? {
                outcome: 'failed',
                status: 502,
                bytes: progress.bytes,
                reason: response.failed,
              }
            : {
                outcome: 'answered',
                status: response.status,
                bytes: progress.bytes,
              },
        )
      } catch (error) {
        end({
          outcome: 'failed',
          status: response.status ?? null,
          bytes: progress.bytes,
          reason: describe(error),
        })
      }
    } finally {
      aborts.delete(abort)
    }
  }

  /** A body in the deployment bucket of a request not taken is deleted unread. */
  const discardBody = async ({ s3, id }) => {
    if (!s3 || !sideChannel.enabled || !sideChannel.discard) return
    try {
      await sideChannel.discard(s3)
    } catch (error) {
      debug(
        `Dev Mode could not delete the body of ${id} from the deployment bucket (the session's sweep removes it): ${describe(error)}`,
      )
    }
  }

  /**
   * The CLI's request for a `--local-only` web app's role credentials: once they came (`took`),
   * accepted and answered with 204 here; otherwise the bridge is asked to send them.
   */
  const answerCredentials = async ({
    header,
    took,
    refuse,
    receivedAt,
    budget,
  }) => {
    const { env: environmentId, id } = header
    if (!took) {
      await refuse(KIND.NEED_ENVIRONMENT)
      return false
    }
    const accepted = await publishFrame(
      environmentId,
      { kind: KIND.ACCEPTED, id },
      EMPTY,
      { priority: 'acceptance', deadline: receivedAt + budget },
    ).catch(() => false)
    if (accepted !== true) return false
    await sendResponse(
      environmentId,
      id,
      { status: 204, headers: {} },
      {
        bytes: 0,
      },
    ).catch((error) =>
      debug(
        `Dev Mode could not answer the credentials request ${id}: ${describe(error)}`,
      ),
    )
    return true
  }

  /** Decides on an offered request; true when it was accepted. */
  const offer = async ({ header, body }, receivedAt) => {
    const { env: environmentId, id } = header
    if (!ENVIRONMENT_ID.test(environmentId ?? '') || !isRequestId(id)) {
      debug(
        'Dev Mode ignored a web request without an execution environment or id',
      )
      return false
    }
    const refuse = (kind) =>
      trySend(environmentId, { kind, id }, EMPTY, {
        deadline: receivedAt + ACCEPT_WINDOW_MS + REFUSAL_GRACE_MS,
      })
    if (stopping) {
      await refuse(KIND.NOT_IN_DEV)
      return false
    }
    const webKey =
      typeof header.fn === 'string' ? functions.get(header.fn) : undefined
    if (!webKey) {
      debug(
        `Dev Mode left ${id} to the deployed code: its web app is not in this session`,
      )
      await refuse(KIND.NOT_IN_DEV)
      return false
    }
    // An environment that runs another web function is not this one's: nothing is answered.
    const owner = owners.get(environmentId)
    if (owner !== undefined && owner !== webKey) {
      debug(
        `Dev Mode ignored ${id}: its execution environment runs another web app`,
      )
      return false
    }
    owners.delete(environmentId)
    owners.set(environmentId, webKey)
    if (owners.size > REMEMBERED_ENVIRONMENTS) {
      owners.delete(owners.keys().next().value)
    }
    const { ageMs, stale } = clock.observe({
      sentAt: header.sentAt,
      receivedAt,
    })
    const budget = ACCEPT_WINDOW_MS - ACCEPT_RETURN_MS - ageMs
    if (stale || budget <= 0) {
      debug(
        `Dev Mode left ${id} to the deployed code: ${stale ? 'it was not offered moments ago' : `it arrived too late to be accepted (${ageMs} ms slower than the fastest trip)`}`,
      )
      await refuse(KIND.EXPIRED)
      return false
    }
    const took = takeEnvironment(webKey, header.environment)
    if (
      localOnly.has(webKey) &&
      header.method === 'GET' &&
      String(header.path ?? '').split('?')[0] === CREDENTIALS_PATH
    ) {
      return answerCredentials({ header, took, refuse, receivedAt, budget })
    }
    // `sls-dev-local` hands over the role credentials only: a web app kept on localhost is not
    // reachable from the cloud.
    if (localOnly.has(webKey)) {
      debug(
        `Dev Mode refused ${id}: ${webKey} runs only on localhost (--local-only)`,
      )
      await refuse(KIND.NOT_IN_DEV)
      return false
    }
    if (!withCredentials.has(webKey)) {
      await refuse(KIND.NEED_ENVIRONMENT)
      return false
    }
    if (header.s3 && !sideChannel.enabled) {
      debug(
        `Dev Mode left ${id} to the deployed code: its body is in the deployment bucket, which Dev Mode cannot use: ${sideChannel.reason}`,
      )
      await refuse(KIND.NOT_IN_DEV)
      return false
    }
    if (isServing && !isServing(webKey)) {
      debug(
        `Dev Mode left ${id} to the deployed code: the local server of ${webKey} is not running`,
      )
      await refuse(KIND.NOT_IN_DEV)
      return false
    }
    let accepted = false
    try {
      accepted =
        (await publishFrame(environmentId, { kind: KIND.ACCEPTED, id }, EMPTY, {
          priority: 'acceptance',
          deadline: receivedAt + budget,
        })) === true
    } catch (error) {
      debug(
        `Dev Mode left ${id} to the deployed code: its acceptance could not be sent: ${describe(error)}`,
      )
      return false
    }
    if (!accepted) {
      debug(
        `Dev Mode left ${id} to the deployed code: its acceptance was not sent in time`,
      )
      return false
    }
    await runAccepted({ header, body, webKey, receivedAt })
    return true
  }

  const handleRequest = async (frame, receivedAt) => {
    let accepted = false
    try {
      accepted = await offer(frame, receivedAt)
    } finally {
      if (!accepted) await discardBody(frame.header)
    }
  }

  const handleUploadRequest = async (
    { env: environmentId, id },
    receivedAt,
  ) => {
    if (!ENVIRONMENT_ID.test(environmentId ?? '') || !isRequestId(id)) return
    const upload = stopping ? undefined : await spareUpload()
    // Stopping may have begun while the URL was signed: an object uploaded after the session's
    // last sweep would stay behind.
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
        debug(`Dev Mode could not relay a web request: ${describe(error)}`),
      )
      .finally(() => running.delete(promise))
  }

  return {
    /** Every web frame on the session's `up` topic (see createUpRouter); never throws. */
    receive(topic, payload) {
      try {
        if (topic !== topics.up || !payload?.length) return
        const receivedAt = now()
        const frame = open(topic, payload)
        if (!frame) return
        if (frame.header.kind === KIND.REQUEST) {
          track(handleRequest(frame, receivedAt))
        } else if (frame.header.kind === KIND.UPLOAD_URL_REQUEST) {
          track(handleUploadRequest(frame.header, receivedAt))
        }
      } catch (error) {
        debug(`Dev Mode could not take a web request: ${describe(error)}`)
      }
    },
    /** Whether this execution environment is a web bridge's (it sent a request here). */
    owns: (environmentId) => owners.has(environmentId),
    /** From now on every request gets `not_in_dev`: the deployed code answers it. */
    stopAccepting() {
      stopping = true
    },
    /**
     * Waits up to `ms` for the requests already accepted to send their responses. Those still
     * running then are aborted (their dispatch's `signal`, and the local server's response is no
     * longer read), and given up to ABORT_GRACE_MS more to end; the bridge answers their callers
     * when the session says goodbye. Never rejects.
     */
    async drain(ms) {
      const settled = (wait) => {
        if (!running.size) return Promise.resolve(true)
        let timer
        return Promise.race([
          Promise.allSettled([...running]).then(() => true),
          new Promise((resolve) => {
            timer = timers.setTimeout(() => resolve(false), wait)
          }),
        ]).finally(() => timers.clearTimeout(timer))
      }
      if (await settled(ms)) return
      for (const abort of aborts) abort.abort()
      await settled(ABORT_GRACE_MS)
    },
    /** The requests being handled. */
    inFlight: () => running.size,
    /** After every reconnect: the trips seen before it no longer say how old a request is. */
    reconnected() {
      clock.reset()
    },
  }
}

/**
 * Where each message on the session's topics goes when web apps are attached: `request` frames,
 * and the upload URL requests of execution environments known to be web bridges, to the web relay;
 * everything else to the functions' relay (`setOthers`). Before the functions' relay listens,
 * every upload URL request goes to the web relay. An upload URL is the same answer whichever relay
 * gives it, so a web bridge's first request asking for one may be answered by the functions'
 * relay.
 */
export const createUpRouter = ({ sessionId, key, web }) => {
  const { up } = topicsOf(sessionId)
  let others = null
  return {
    setOthers(fn) {
      others = fn
    },
    receive(topic, payload) {
      if (topic === up && payload?.length) {
        const opened = openRaw({ key, topic, message: payload })
        const header = opened && decodeFrame(opened.plaintext)?.header
        if (
          header?.kind === KIND.REQUEST ||
          (header?.kind === KIND.UPLOAD_URL_REQUEST &&
            (!others || web.owns(header.env)))
        ) {
          web.receive(topic, payload)
          return
        }
      }
      others?.(topic, payload)
    },
  }
}

/**
 * The web relay's publish: frames paced with the web profile (WEB_PACING) before they reach the
 * connection's own pacer (`publish`, the transport's), which keeps the functions' rate for the
 * connection as a whole. Resolves true once sent, false when dropped here (its deadline passed, or
 * closed); rejects when the connection did not send it.
 */
export const createWebPublish = ({
  publish,
  now = Date.now,
  timers,
  pacing = WEB_PACING,
}) => {
  const pacer = createPacer({
    now,
    timers,
    ...pacing,
    send: async ({ topic, payload, priority, deadline, expirySeconds }) => {
      const sent = await publish({
        topic,
        payload,
        priority,
        ...(deadline !== undefined && { deadline }),
        ...(expirySeconds !== undefined && { expirySeconds }),
      })
      if (sent !== true) {
        throw new Error('the frame was not sent before its deadline')
      }
    },
  })
  return {
    pacing,
    publish: (message) => pacer.publish(message),
    close: () => pacer.close(),
  }
}
