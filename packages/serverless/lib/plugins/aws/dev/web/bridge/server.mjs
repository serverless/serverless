/**
 * The web bridge: the whole server of a web app's dev revision while a Dev Mode session runs. Each
 * HTTP request is offered to the developer's machine over AWS IoT Core as a sealed `request`
 * frame; the machine answers `accepted`, then `response_start`, the body in ordered `stream_data`
 * frames and `stream_end`, and the bridge writes them to the caller as they arrive. A request the
 * machine does not accept within ACCEPT_WINDOW_MS (asleep, offline, the session gone, the CLI
 * stopped) goes to the deployed code through the fallback endpoint, so no caller waits longer
 * than the window for an answer to start. A WebSocket handshake, which a web function cannot
 * complete, is answered 426 by the bridge and goes nowhere.
 *
 * Everything that reaches outside is injected (`connect`, `assumeRole`, `send`, the clock and
 * timers): index.mjs wires the real ones, and tests run the bridge in-process.
 */
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import {
  ENVIRONMENT_NAMES,
  KIND,
  WEB_BODY_BYTES,
  createSealer,
  decodeFrame,
  decodeSessionKey,
  fitsOneMessage,
  openRaw,
} from '../../relay/protocol.js'
import { withoutSecrets } from '../../relay/redact.js'
import {
  REQUEST_EXPIRY_SECONDS,
  connectMqtt,
  createBrokerCredentials,
  createLink,
  scopeFromRoleArn,
} from './relay.mjs'
import { createFallback } from './fallback.mjs'
import { endToEndHeaders, readAll, sendHttp } from './http.mjs'

/** How long a request waits for the developer's machine to accept it. */
export const ACCEPT_WINDOW_MS = 3000
/** How long a request waits for the connection to AWS IoT Core before it goes to the fallback. */
export const CONNECT_WAIT_MS = 3000
/** How long a request with a large body waits for the machine's upload URL. */
export const UPLOAD_WAIT_MS = 2000
/** How long an S3 transfer of a body may go without an answer. */
export const S3_TIMEOUT_MS = 30_000
// The frames of one response held for a frame that has not arrived yet.
const MAX_HELD_FRAMES = 64
const EMPTY = Buffer.alloc(0)

const REQUIRED = [
  'AWS_REGION',
  'SLS_DEV_BROKER_EXTERNAL_ID',
  'SLS_DEV_BROKER_ROLE_ARN',
  'SLS_DEV_IOT_ENDPOINT',
  'SLS_DEV_SESSION',
  'SLS_DEV_SESSION_KEY',
]

const clean = (error) => withoutSecrets(error?.message ?? error)

/**
 * What the dev revision's variables say: where to listen (AWS_LAMBDA_HTTP_ENDPOINT), the fallback
 * endpoint (absent for a `--local-only` web app) and the session to relay to. `relay` is null,
 * with the `reason`, when the session is missing or incomplete; reasons name variables, never
 * their values. Each execution environment picks its own id.
 */
export const readBridgeConfig = (env, randomBytes = nodeRandomBytes) => {
  const endpoint = String(env.AWS_LAMBDA_HTTP_ENDPOINT ?? '')
  const colon = endpoint.lastIndexOf(':')
  const port = Number(endpoint.slice(colon + 1))
  // A bracketed IPv6 host (`[::1]:9001`) is listened on without its brackets.
  const host = (colon > 0 ? endpoint.slice(0, colon) : '').replace(
    /^\[(.*)\]$/,
    '$1',
  )
  const listen = {
    host: host || '127.0.0.1',
    port: colon >= 0 && Number.isInteger(port) && port > 0 ? port : 8080,
  }
  let fallbackUrl = null
  try {
    const parsed = new URL(env.SLS_DEV_FALLBACK_URL)
    if (parsed.protocol === 'https:') fallbackUrl = parsed.origin
  } catch {
    // No fallback: a local-only web app.
  }
  // The fallback's auth type is `main`'s (attach copies it); an unknown value is signed for.
  const fallbackAuth =
    env.SLS_DEV_FALLBACK_AUTH === 'ApplicationManaged'
      ? 'ApplicationManaged'
      : 'IamAuth'
  const base = { listen, fallbackUrl, fallbackAuth, region: env.AWS_REGION }
  const missing = REQUIRED.filter((name) => !env[name])
  if (missing.length) {
    return {
      ...base,
      relay: null,
      reason: `the Dev Mode session is incomplete (${missing.join(', ')} missing)`,
    }
  }
  let key
  try {
    key = decodeSessionKey(env.SLS_DEV_SESSION_KEY)
  } catch (error) {
    return {
      ...base,
      relay: null,
      reason: `SLS_DEV_SESSION_KEY: ${error.message}`,
    }
  }
  return {
    ...base,
    reason: null,
    relay: {
      session: env.SLS_DEV_SESSION,
      key,
      iotEndpoint: env.SLS_DEV_IOT_ENDPOINT,
      brokerRoleArn: env.SLS_DEV_BROKER_ROLE_ARN,
      externalId: env.SLS_DEV_BROKER_EXTERNAL_ID,
      owner: env.SLS_DEV_OWNER ?? '',
      region: env.AWS_REGION,
      // AWS sets no variable with a web function's name: attach writes it.
      functionName: env.SLS_DEV_WEB_FUNCTION ?? '',
      environmentId: `e${randomBytes(6).toString('hex')}`,
    },
  }
}

/** Headers as the wire carries them: every value one string. */
const wireHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(endToEndHeaders(headers)).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(', ') : value,
    ]),
  )

/** Writes a chunk, waiting while the caller reads slower than it arrives; false once closed. */
const write = (res, chunk) =>
  new Promise((resolve) => {
    if (res.destroyed || res.writableEnded) {
      resolve(false)
      return
    }
    if (res.write(chunk)) {
      resolve(true)
      return
    }
    const done = (ok) => () => {
      res.off('drain', onDrain)
      res.off('close', onClose)
      resolve(ok)
    }
    const onDrain = done(true)
    const onClose = done(false)
    res.once('drain', onDrain)
    res.once('close', onClose)
  })

/**
 * Whether a request opens a WebSocket: `upgrade` names `websocket`, or it carries
 * `sec-websocket-key` (a web function may not pass `upgrade` and `connection` on).
 */
export const isWebSocketHandshake = (headers = {}) =>
  headers['sec-websocket-key'] !== undefined ||
  String(headers.upgrade ?? '')
    .split(',')
    .some((token) => token.trim().toLowerCase() === 'websocket')

/** The answer to a WebSocket handshake, which a web function cannot complete. */
const HANDSHAKE_ANSWER =
  'A web function serves HTTP only, so this WebSocket connection cannot open here. Hot reload works on the local URL of serverless dev.'

/** A short plain-text answer of the bridge's own, when nothing has been written yet. */
const answerPlain = (res, status, text) => {
  if (res.destroyed || res.writableEnded) return
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(`${text}\n`)
}

export const createBridge = ({
  env = process.env,
  connect = connectMqtt,
  assumeRole,
  send = sendHttp,
  now = Date.now,
  timers = { setTimeout, clearTimeout },
  log = (line) => console.log(line),
  randomBytes = nodeRandomBytes,
  config = readBridgeConfig(env, randomBytes),
}) => {
  let { relay, reason } = config
  let credentials = null
  let link = null
  if (relay) {
    try {
      const scope = scopeFromRoleArn({
        roleArn: relay.brokerRoleArn,
        region: relay.region,
        session: relay.session,
        environment: relay.environmentId,
        functionName: relay.functionName,
        // Only a signed forward needs the broker to invoke the fallback.
        invokeFallback:
          Boolean(config.fallbackUrl) && config.fallbackAuth === 'IamAuth',
      })
      if (scope.functionName === '*') {
        log(
          `SLS_DEV_WEB_FUNCTION is missing or not a function name${scope.invokeFallback ? ', so the broker session may invoke the fallback endpoint of any web function the broker role allows' : ''}`,
        )
      }
      credentials = createBrokerCredentials({
        assumeRole,
        roleArn: relay.brokerRoleArn,
        externalId: relay.externalId,
        scope,
        now,
      })
      link = createLink({
        sessionId: relay.session,
        key: relay.key,
        environmentId: relay.environmentId,
        endpoint: relay.iotEndpoint,
        region: relay.region,
        credentials,
        connect,
        now,
        timers,
        log,
      })
    } catch (error) {
      reason = error.message
      relay = null
    }
  }
  const fallback =
    config.fallbackUrl &&
    (credentials || config.fallbackAuth === 'ApplicationManaged')
      ? createFallback({
          url: config.fallbackUrl,
          region: config.region,
          authType: config.fallbackAuth,
          credentials,
          send,
          now,
        })
      : null
  if (!relay) {
    log(
      `${reason}; ${fallback ? 'requests run the deployed code' : 'requests are answered with 503'}`,
    )
  }
  // The connection the execution role's credentials were last sent on.
  let environmentSentOn = null
  const environment = () =>
    Object.fromEntries(
      ENVIRONMENT_NAMES.filter((name) => env[name]).map((name) => [
        name,
        String(env[name]),
      ]),
    )

  /** Downloads, deletes and opens a payload the machine put in S3 for this response. */
  const download = async (s3) => {
    const response = await send({
      method: 'GET',
      url: s3.get,
      timeoutMs: S3_TIMEOUT_MS,
    })
    const data = await readAll(response.body)
    if (response.status !== 200) {
      throw new Error(`S3 answered ${response.status} to the download`)
    }
    if (s3.delete) {
      // A failed delete is left to the session's sweep.
      await send({ method: 'DELETE', url: s3.delete, timeoutMs: S3_TIMEOUT_MS })
        .then((answer) => readAll(answer.body))
        .catch(() => {})
    }
    const opened = openRaw({
      key: relay.key,
      topic: `s3/${s3.key}`,
      message: data,
    })
    const frame = opened && decodeFrame(opened.plaintext)
    if (frame?.header.kind !== KIND.PAYLOAD) {
      throw new Error("the downloaded payload is not this session's")
    }
    return frame.body
  }

  /** Asks the machine for an upload URL and puts the sealed body there: `{ s3 }` or `{ pass }`. */
  const upload = async (state, inbox, id, body) => {
    const until = now() + UPLOAD_WAIT_MS
    const larger = 'its body is larger than one message and'
    // Not awaited: on a socket that no longer reaches AWS IoT Core, a publish settles only when the
    // connection is found dead, long after the wait for the URL is over.
    const asking = { acked: false, failed: null }
    link
      .publish(
        state,
        { kind: KIND.UPLOAD_URL_REQUEST, env: relay.environmentId, id },
        EMPTY,
        { priority: 'control', deadline: until, expirySeconds: 2 },
      )
      .then(
        (sent) => {
          if (sent) asking.acked = true
          else asking.failed = 'did not happen in time'
        },
        (error) => {
          asking.failed = `failed (${clean(error)})`
        },
      )
      .finally(() => inbox.event('published'))
    let target
    while (!target) {
      const item = await inbox.next(until)
      if (item.event === 'published') {
        if (asking.failed) {
          return { pass: `${larger} asking for an upload URL ${asking.failed}` }
        }
        continue
      }
      if (item.event === 'timeout') {
        if (!asking.acked) {
          // A publish never acknowledged: the socket may be dead. The next request reconnects.
          link.broken(state)
          return {
            pass: `${larger} asking for an upload URL was not acknowledged within ${UPLOAD_WAIT_MS} ms`,
          }
        }
        return { pass: `${larger} no upload URL arrived in time` }
      }
      if (item.event === 'aborted') return { aborted: true }
      if (item.event)
        return { pass: `the wait for an upload URL ended (${item.event})` }
      const { header } = item.frame
      if (header.kind === KIND.UPLOAD_URL && header.upload?.url) {
        target = header.upload
      } else if (
        header.kind === KIND.NOT_IN_DEV ||
        header.kind === KIND.EXPIRED
      ) {
        return {
          pass: `the developer's machine did not take it (${header.kind})`,
        }
      }
    }
    try {
      const sealed = createSealer({ key: relay.key })(
        `s3/${target.key}`,
        { kind: KIND.PAYLOAD },
        body,
      )
      const response = await send({
        method: 'PUT',
        url: target.url,
        headers: {
          ...(target.headers ?? {}),
          'content-length': String(sealed.length),
        },
        body: sealed,
        timeoutMs: S3_TIMEOUT_MS,
      })
      await readAll(response.body)
      if (response.status !== 200) {
        return {
          pass: `S3 answered ${response.status} to the upload of its body`,
        }
      }
      const versionId = response.headers?.['x-amz-version-id']
      return {
        s3: {
          key: target.key,
          ...(typeof versionId === 'string' && versionId && { versionId }),
        },
      }
    } catch (error) {
      return { pass: `uploading its body failed (${clean(error)})` }
    }
  }

  /**
   * Writes the machine's answer as its frames arrive: the start, then the body in order, then the
   * end. `{ pass }` when the machine says it did not run it after all and nothing was written.
   */
  const respond = async ({ id, inbox, res, backlog, startedAt }) => {
    const held = new Map()
    const pending = [...backlog]
    let next = 0
    let end = null
    let started = false
    let status
    const lost = (why) => {
      inbox.end('machine')
      log(
        `${id} was accepted by the developer's machine, but its response could not arrive: ${why}`,
      )
      answerPlain(
        res,
        502,
        "Dev Mode lost the response from the developer's machine.",
      )
      return { done: true }
    }
    // No time bound: the machine may be paused at a breakpoint or rendering slowly. The revision's
    // own request timeout ends a request that never gets an answer, and `gone` or a lost
    // connection ends one whose machine went away.
    for (;;) {
      const item = pending.length
        ? { frame: pending.shift() }
        : await inbox.next()
      if (item.event === 'published') continue
      if (item.event === 'aborted') {
        inbox.end('machine')
        return { done: true }
      }
      if (item.event === 'gone') return lost('the Dev Mode session is gone')
      if (item.event) return lost('the connection to AWS IoT Core ended')
      const { header, body } = item.frame
      switch (header.kind) {
        case KIND.RESPONSE_START:
          if (started) break
          status = header.status
          if (!Number.isInteger(status) || status < 100 || status > 599) {
            return lost(`its status ${String(status)} is not an HTTP status`)
          }
          try {
            res.writeHead(status, endToEndHeaders(header.headers ?? {}))
            res.flushHeaders()
          } catch (error) {
            return lost(`its headers could not be written (${clean(error)})`)
          }
          started = true
          break
        case KIND.STREAM_DATA:
          if (!Number.isInteger(header.n) || header.n < next) break
          if (held.has(header.n)) break
          if (held.size >= MAX_HELD_FRAMES) {
            return lost(
              'more of its response arrived out of order than Dev Mode holds',
            )
          }
          held.set(header.n, { header, body })
          break
        case KIND.STREAM_END:
          end ??= header
          break
        case KIND.NOT_IN_DEV:
        case KIND.EXPIRED:
          if (!started && next === 0 && !held.size) {
            return {
              pass: `the developer's machine did not run it (${header.kind})`,
            }
          }
          break
        default:
          break
      }
      if (!started) continue
      try {
        while (held.has(next)) {
          const frame = held.get(next)
          held.delete(next)
          next += 1
          const data = frame.header.s3?.get
            ? await download(frame.header.s3)
            : frame.body
          if (!(await write(res, data))) {
            inbox.end('machine')
            return { done: true }
          }
        }
        if (end && next >= (Number.isInteger(end.count) ? end.count : 0)) {
          if (end.s3?.get && !(await write(res, await download(end.s3)))) {
            inbox.end('machine')
            return { done: true }
          }
          inbox.end('machine')
          if (end.errorType) {
            log(
              `${id} ran on the developer's machine and its response ended with ${end.errorType}`,
            )
            res.destroy()
          } else {
            res.end()
            log(
              `${id} ran on the developer's machine: ${status} in ${now() - startedAt} ms`,
            )
          }
          return { done: true }
        }
      } catch (error) {
        return lost(`downloading part of it from S3 failed (${clean(error)})`)
      }
    }
  }

  /** Offers one request to the machine: `{ done }` when it answered, `{ pass }` otherwise. */
  const relayRequest = async (request, res) => {
    const startedAt = now()
    const id = `r${randomBytes(8).toString('hex')}`
    const pass = (why) => {
      log(`${id} went to the deployed code: ${why}`)
      return { pass: why }
    }
    let state
    try {
      state = await link.ready(CONNECT_WAIT_MS)
    } catch (error) {
      return pass(`no connection to AWS IoT Core (${clean(error)})`)
    }
    const inbox = link.register(id, state)
    const onClose = () => {
      if (!res.writableFinished) inbox.event('aborted')
    }
    res.once('close', onClose)
    const handOver = (why) => {
      inbox.end('fallback')
      return pass(why)
    }
    // The caller left before the machine accepted: nobody gets an answer, the deployed code
    // included.
    const abandon = () => {
      inbox.end('abandoned')
      log(`${id} was abandoned by its caller before it was accepted`)
      return { done: true }
    }
    try {
      const header = {
        kind: KIND.REQUEST,
        env: relay.environmentId,
        fn: relay.functionName,
        id,
        sentAt: 0,
        method: request.method,
        path: request.path,
        headers: wireHeaders(request.headers),
      }
      if (environmentSentOn !== state) header.environment = environment()
      let body = request.body
      if (body.length > WEB_BODY_BYTES || !fitsOneMessage(header, body)) {
        const uploaded = await upload(state, inbox, id, body)
        if (uploaded.aborted) return abandon()
        if (uploaded.pass) return handOver(uploaded.pass)
        header.s3 = uploaded.s3
        body = EMPTY
      }

      // One acceptance window per offer; the offer sent again with the environment has its own.
      let offer
      const makeOffer = () => {
        const offeredAt = now()
        header.sentAt = offeredAt
        const current = {
          acceptAt: offeredAt + ACCEPT_WINDOW_MS,
          acked: false,
          failed: null,
        }
        link
          .publish(state, header, body, {
            priority: 'control',
            deadline: current.acceptAt,
            expirySeconds: REQUEST_EXPIRY_SECONDS,
          })
          .then(
            (sent) => {
              if (sent) {
                current.acked = true
                if (header.environment) environmentSentOn = state
              } else {
                current.failed =
                  'publishing it to AWS IoT Core did not happen in time'
              }
            },
            (error) => {
              current.failed = `publishing it to AWS IoT Core failed (${clean(error)})`
            },
          )
          .finally(() => inbox.event('published'))
        offer = current
      }
      makeOffer()
      let resent = false
      for (;;) {
        const item = await inbox.next(offer.acceptAt)
        if (item.event) {
          switch (item.event) {
            case 'published':
              if (offer.failed) return handOver(offer.failed)
              continue
            case 'timeout':
              if (!offer.acked) {
                // A publish never acknowledged: the socket may be dead. The next request
                // reconnects.
                link.broken(state)
                return handOver(
                  `its publish was not acknowledged and it was not accepted within ${ACCEPT_WINDOW_MS} ms`,
                )
              }
              return handOver(`not accepted within ${ACCEPT_WINDOW_MS} ms`)
            case 'gone':
              return handOver('the Dev Mode session is gone')
            case 'aborted':
              return abandon()
            default:
              return handOver('the connection to AWS IoT Core ended')
          }
        }
        const { kind } = item.frame.header
        if (
          kind === KIND.ACCEPTED ||
          kind === KIND.RESPONSE_START ||
          kind === KIND.STREAM_DATA ||
          kind === KIND.STREAM_END
        ) {
          // A reply can overtake its acceptance (AWS IoT Core does not keep order).
          const answered = await respond({
            id,
            inbox,
            res,
            backlog: kind === KIND.ACCEPTED ? [] : [item.frame],
            startedAt,
          })
          return answered.pass ? handOver(answered.pass) : answered
        }
        if (kind === KIND.NOT_IN_DEV || kind === KIND.EXPIRED) {
          return handOver(`the developer's machine did not take it (${kind})`)
        }
        if (kind === KIND.NEED_ENVIRONMENT) {
          if (resent || header.s3) {
            return handOver(
              "the developer's machine asked for the environment again",
            )
          }
          resent = true
          header.environment = environment()
          makeOffer()
        }
      }
    } finally {
      res.off('close', onClose)
    }
  }

  const toFallback = async (request, res, why) => {
    if (!fallback) {
      answerPlain(
        res,
        503,
        "Dev Mode did not get an answer from the developer's machine for this request.",
      )
      return
    }
    let answer
    try {
      answer = await fallback.forward(request)
    } catch (error) {
      log(`the deployed code could not be reached: ${clean(error)}`)
      answerPlain(res, 502, 'Dev Mode could not reach the deployed code.')
      return
    }
    // A caller that leaves ends the deployed code's answer too, at once, not at its next chunk.
    let callerLeft = false
    const onClose = () => {
      if (res.writableFinished) return
      callerLeft = true
      answer.body.destroy?.()
    }
    res.once('close', onClose)
    try {
      if (res.destroyed) {
        onClose()
        return
      }
      res.writeHead(answer.status, answer.headers)
      res.flushHeaders()
      for await (const chunk of answer.body) {
        if (!(await write(res, chunk))) return
      }
      res.end()
    } catch (error) {
      if (!callerLeft) {
        log(`the answer of the deployed code was cut off: ${clean(error)}`)
      }
      res.destroy()
    } finally {
      res.off('close', onClose)
    }
  }

  return {
    config,
    /** The http server's request listener; never throws. */
    async handle(req, res) {
      try {
        // Neither the machine nor the deployed code could finish it: it is answered here, unrelayed.
        if (isWebSocketHandshake(req.headers)) {
          answerPlain(res, 426, HANDSHAKE_ANSWER)
          return
        }
        const request = {
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: await readAll(req),
        }
        if (!link) {
          await toFallback(request, res, reason)
          return
        }
        const outcome = await relayRequest(request, res)
        // A caller that left while the request waited gets nothing from the deployed code either.
        if (outcome.pass && !res.destroyed) {
          await toFallback(request, res, outcome.pass)
        }
      } catch (error) {
        log(`a request failed: ${clean(error)}`)
        answerPlain(res, 502, 'Dev Mode could not relay this request.')
      }
    },
    /** Disconnects from AWS IoT Core; requests under way end. */
    close() {
      link?.close()
    },
  }
}
