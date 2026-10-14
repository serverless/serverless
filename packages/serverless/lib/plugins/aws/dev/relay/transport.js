/**
 * This machine's one connection to AWS IoT Core for a Dev Mode session: MQTT 5 over a WebSocket
 * whose URL is presigned with the developer's AWS credentials. Every connection, the first and each
 * reconnect, reads the credentials again, signs a new URL and seals a new will on a new MQTT client
 * (the client's URL hook cannot wait for signing), so a reconnect after the credentials were
 * refreshed uses the new ones. Reconnects back off from 1 s to 30 s. After each CONNACK the
 * connection subscribes to the session's `up` topic and checks the SUBACK; its will tells the
 * session's bridges this machine is gone when the connection drops without a goodbye. Every publish
 * is QoS 1 and goes through the pacer; publishes still waiting for their acknowledgement when the
 * connection drops fail. The signed URL never appears in an error or a reported state, and mqtt.js
 * never sees it: it gets the unsigned URL (which its DEBUG=mqttjs* output prints), and the
 * WebSocket is opened here with the signed one.
 */
import mqtt from 'mqtt'
import WebSocket from 'ws'
import { ServerlessError } from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { getProxyAgent } from '@serverless/util/src/proxy/index.js'
import { createPacer } from './pacer.js'
import { laptopClientId, topicsOf } from './protocol.js'
import { presignIotWebSocket } from './sigv4.js'
import { withoutSecrets } from './redact.js'
import { credentialsFixLine } from './messages.js'

export const KEEPALIVE_SECONDS = 30
export const RECONNECT_MIN_MS = 1_000
export const RECONNECT_MAX_MS = 30_000
/** How long start() waits for AWS IoT Core to accept the connection. */
export const CONNECT_TIMEOUT_MS = 20_000
/** How long stop() waits for the goodbye to be acknowledged before closing the connection. */
export const STOP_TIMEOUT_MS = 2_000
const CREDENTIAL_REFRESH_MS = 60_000
const RECONNECT_JITTER_MS = 500

// MQTT 5 reason codes: 0x80 and above are failures.
const REFUSED = 0x80
const BAD_USER_NAME_OR_PASSWORD = 134
const NOT_AUTHORIZED = 135

const noop = () => {}

/** Why one connection attempt failed: 'signature' (HTTP 403), 'denied' or 'unreachable'. */
class AttemptFailure extends Error {
  constructor(kind, detail, action = 'connect to') {
    super(detail)
    this.kind = kind
    this.action = action
  }
}

/** The credentials could not be read for an attempt (already reported when it matters). */
class CredentialsUnreadable extends Error {}

/** stop() was called, or the attempt was given up, while it ran. */
class Cancelled extends Error {}

const failureOf = (error, action) => {
  if (error instanceof AttemptFailure) return error
  const detail = withoutSecrets(error?.message ?? error)
  // ws reports a refused WebSocket handshake as "Unexpected server response: <status>".
  if (/Unexpected server response: 403\b/.test(detail)) {
    return new AttemptFailure('signature', detail, action)
  }
  if (
    error?.code === NOT_AUTHORIZED ||
    error?.code === BAD_USER_NAME_OR_PASSWORD ||
    /not authori[sz]ed/i.test(detail)
  ) {
    return new AttemptFailure('denied', detail, action)
  }
  return new AttemptFailure('unreachable', detail, action)
}

const startError = (failure, region) => {
  if (failure.kind === 'signature') {
    return new ServerlessError(
      `AWS IoT Core in ${region} refused this machine's signed connection (HTTP 403). Check that your AWS credentials are valid and not expired, and that this machine's clock is correct: AWS refuses requests signed more than 5 minutes away from its own time. Then run the command again.`,
      'DEV_MODE_IOT_CONNECT_DENIED',
      { stack: false },
    )
  }
  if (failure.kind === 'denied') {
    return new ServerlessError(
      `Dev Mode could not ${failure.action} AWS IoT Core in ${region} (${failure.message}). Your AWS credentials need iot:Connect on client "sls-dev-*", and iot:Subscribe, iot:Receive and iot:Publish on topics "sls-dev/*". Ask your AWS administrator to allow them.`,
      'DEV_MODE_IOT_CONNECT_DENIED',
      { stack: false },
    )
  }
  return new ServerlessError(
    `Dev Mode could not ${failure.action} AWS IoT Core in ${region} (${failure.message}). Check your network connection and proxy settings (HTTPS_PROXY), then run the command again.`,
    'DEV_MODE_IOT_UNREACHABLE',
    { stack: false },
  )
}

const credentialsError = (credentialSource) => {
  const advice = credentialsFixLine(credentialSource)
  return Object.assign(
    new ServerlessError(
      `Dev Mode could not read your AWS credentials to connect to AWS IoT Core. ${advice}`,
      'DEV_MODE_AWS_CREDENTIALS_INVALID',
      { stack: false },
    ),
    { advice },
  )
}

export const createTransport = ({
  endpoint,
  region,
  sessionId,
  credentials, // async () => { accessKeyId, secretAccessKey, sessionToken }
  credentialSource, // where the credentials come from, for the advice when they cannot be read
  goneFrame, // () => Buffer: the sealed `gone` frame, the connection's will
  onMessage, // (topic, payload) => void
  onState = noop, // ({ state: 'lost' | 'reconnected' | 'credentials_expired' | 'credentials_refreshed', ... })
  connect = mqtt.connect,
  createWebSocket = (url, protocols, options) =>
    new WebSocket(url, protocols, options),
  now = Date.now,
  timers,
  env = process.env,
  pacerOptions = {},
}) => {
  const topics = topicsOf(sessionId)
  const clientId = laptopClientId(sessionId)
  const brokerUrl = `wss://${endpoint}/mqtt`
  // One proxy agent per client, with a signal that ends its connection to the proxy when the
  // client is ended: a proxy that accepts and never answers would otherwise hold that connection
  // (and the process) open after the attempt was given up.
  const proxyCuts = new WeakMap()
  const proxyAgentFor = (signal) =>
    getProxyAgent(brokerUrl, { env, agentOptions: { signal } })
  let current = null
  // The connected client, and the clients of attempts not yet connected or not yet handed over to
  // `live`: stop() ends all of them.
  let live = null
  const connecting = new Set()
  // Bumped by stop() and by an attempt that gives up: an attempt of an older generation ends its
  // client instead of handing it over.
  let generation = 0
  let lostAt = null
  let attempts = 0
  // Whether the expired line was reported and no successful read followed it yet.
  let expiredReported = false
  let reconnectTimer = null
  let refreshTimer = null
  // Publishes waiting for their acknowledgement, per client.
  const inFlight = new WeakMap()
  let stopping = false
  let stopped = null
  // Ends the deadline waits of running attempts at once (stop()).
  const cancels = new Set()

  // Nothing is reported or delivered once stop() was called.
  const report = (state) => {
    if (stopping) return
    try {
      onState(state)
    } catch {
      // Reporting a state never affects the connection.
    }
  }

  const deliver = (topic, payload) => {
    if (stopping) return
    try {
      onMessage(topic, payload)
    } catch {
      // A message this machine cannot handle is dropped; the connection stays.
    }
  }

  /**
   * Reads the credentials. A failure is reported only when it stops this machine from connecting
   * (no connection is up), once until they can be read again; a failure while connected is not:
   * the connection keeps working. The first successful read after a report is reported too.
   */
  const refresh = async ({ quiet = false } = {}) => {
    try {
      current = await credentials()
      if (expiredReported) {
        expiredReported = false
        report({ state: 'credentials_refreshed' })
      }
      return true
    } catch (error) {
      if (!expiredReported && !quiet && live === null) {
        expiredReported = true
        report({ state: 'credentials_expired', error })
      }
      return false
    }
  }

  /** Ends a client at once; publishes it still had waiting for an acknowledgement fail. */
  const dispose = (client) => {
    connecting.delete(client)
    client.off?.('message', deliver)
    try {
      client.end(true)
    } catch {
      // Already ended.
    }
    proxyCuts.get(client)?.abort()
  }

  const pacer = createPacer({
    timers,
    now,
    ...pacerOptions,
    send: ({ topic, payload, expirySeconds }) =>
      new Promise((resolve, reject) => {
        const client = live
        if (!client?.connected) {
          reject(new Error('Dev Mode is not connected to AWS IoT Core'))
          return
        }
        inFlight.set(client, (inFlight.get(client) ?? 0) + 1)
        client.publish(
          topic,
          payload,
          {
            qos: 1,
            ...(expirySeconds && {
              properties: { messageExpiryInterval: expirySeconds },
            }),
          },
          (error, packet) => {
            inFlight.set(client, inFlight.get(client) - 1)
            const code = error?.code ?? packet?.reasonCode
            if (Number.isInteger(code) && code >= REFUSED) {
              // AWS IoT Core refused it on a live connection: the code says why.
              reject(
                Object.assign(
                  new Error(
                    `AWS IoT Core refused the message (reason code ${code})`,
                  ),
                  { reasonCode: code },
                ),
              )
            } else if (error) {
              reject(new Error(withoutSecrets(error.message)))
            } else {
              resolve()
            }
          },
        )
      }),
  })

  const subscribe = (client) =>
    new Promise((resolve, reject) => {
      client.subscribe(topics.up, { qos: 1 }, (error, granted) => {
        const refused = (Array.isArray(granted) ? granted : []).find(
          (grant) => grant?.qos >= REFUSED,
        )
        if (error) reject(failureOf(error, 'subscribe to'))
        else if (refused) {
          const failure = new Error(
            `Subscribe error: reason code ${refused.qos}`,
          )
          failure.code = refused.qos
          reject(failureOf(failure, 'subscribe to'))
        } else resolve()
      })
    })

  const cancelled = (mine) => stopping || mine !== generation

  /**
   * One connection of generation `mine`: a new client with a URL signed now; resolves with it once
   * subscribed. The client stays in `connecting` until it is handed over to `live`.
   */
  const attempt = async (mine) => {
    const url = await presignIotWebSocket({
      endpoint,
      region,
      credentials: current,
      date: new Date(now()),
    })
    if (cancelled(mine)) throw new Cancelled()
    let client
    const proxyCut = new AbortController()
    try {
      client = connect(brokerUrl, {
        protocolVersion: 5,
        clientId,
        clean: true,
        keepalive: KEEPALIVE_SECONDS,
        connectTimeout: CONNECT_TIMEOUT_MS,
        // This module reconnects by itself, with a new client and a new URL each time.
        reconnectPeriod: 0,
        resubscribe: false,
        // mqtt.js logs and keeps the unsigned URL; only the WebSocket it asks for gets the signed one.
        transformWsUrl: () => brokerUrl,
        createWebsocket: (unsigned, protocols, options) =>
          createWebSocket(url, protocols, options.wsOptions),
        wsOptions: { agent: proxyAgentFor(proxyCut.signal) },
        will: {
          topic: topics.gone,
          payload: goneFrame(),
          qos: 1,
          retain: false,
        },
      })
    } catch (error) {
      proxyCut.abort()
      throw failureOf(error)
    }
    proxyCuts.set(client, proxyCut)
    connecting.add(client)
    // Errors are read below and through 'close'; this listener keeps any of them from crashing.
    client.on('error', noop)
    client.on('message', deliver)
    try {
      await new Promise((resolve, reject) => {
        let settled = false
        let lastError = null
        const offs = []
        const listen = (emitter, event, handler) => {
          if (typeof emitter?.on !== 'function') return
          emitter.on(event, handler)
          offs.push(() => emitter.off(event, handler))
        }
        const settle = (failure) => {
          if (settled) return
          settled = true
          for (const off of offs) off()
          if (failure) reject(failure)
          else resolve()
        }
        // A refused WebSocket handshake reaches only the stream: mqtt.js forwards stream errors
        // that carry a code, and closes.
        listen(client.stream, 'error', (error) => {
          lastError = error
        })
        listen(client, 'error', (error) => settle(failureOf(error)))
        listen(client, 'close', () =>
          settle(
            failureOf(
              lastError ??
                new Error(
                  'the connection closed before AWS IoT Core accepted it',
                ),
            ),
          ),
        )
        listen(client, 'connect', () =>
          subscribe(client).then(() => settle(), settle),
        )
      })
    } catch (failure) {
      dispose(client)
      throw failure
    }
    if (cancelled(mine)) {
      dispose(client)
      throw new Cancelled()
    }
    return client
  }

  /**
   * Reads the credentials and connects, all within CONNECT_TIMEOUT_MS, then hands the client over
   * to `live` in the same turn as the last check, so a stop() either cancels the attempt or finds
   * the client in `live`. A client that arrives after the deadline or a stop is ended. Rejects with
   * CredentialsUnreadable, Cancelled or an AttemptFailure.
   */
  const connectOnce = async ({ quiet }) => {
    const mine = generation
    let deadline = null
    let cancel = noop
    const expired = new Promise((resolve, reject) => {
      deadline = timers.setTimeout(() => {
        deadline = null
        reject(
          new AttemptFailure(
            'unreachable',
            `no answer within ${CONNECT_TIMEOUT_MS / 1000} s`,
          ),
        )
      }, CONNECT_TIMEOUT_MS)
      cancel = () => reject(new Cancelled())
    })
    cancels.add(cancel)
    const trying = (async () => {
      if (!(await refresh({ quiet }))) throw new CredentialsUnreadable()
      if (cancelled(mine)) throw new Cancelled()
      return attempt(mine)
    })()
    trying.catch(noop)
    try {
      const client = await Promise.race([trying, expired])
      if (cancelled(mine)) {
        dispose(client)
        throw new Cancelled()
      }
      connecting.delete(client)
      live = client
      watch(client)
    } catch (error) {
      // Give the attempt up: whatever it still connects is ended.
      if (mine === generation) generation += 1
      for (const pending of [...connecting]) dispose(pending)
      trying.then(dispose, noop)
      throw error
    } finally {
      if (deadline !== null) timers.clearTimeout(deadline)
      cancels.delete(cancel)
    }
  }

  const scheduleReconnect = () => {
    if (stopping || reconnectTimer !== null) return
    const delay =
      Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempts) +
      Math.floor(Math.random() * RECONNECT_JITTER_MS)
    attempts += 1
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null
      reconnect()
    }, delay)
  }

  /** Watches the connected client; a drop is reported once per outage and starts reconnecting. */
  const watch = (client) => {
    let lastError = null
    client.on('error', (error) => {
      lastError = error
    })
    client.on('close', () => {
      if (client !== live) return
      live = null
      dispose(client)
      if (stopping) return
      if (lostAt === null) {
        lostAt = now()
        report({
          state: 'lost',
          reason: lastError
            ? withoutSecrets(lastError.message)
            : 'the connection closed',
        })
      }
      scheduleReconnect()
    })
  }

  /** One reconnect attempt; a failed or timed-out one backs off and tries again. */
  const reconnect = async () => {
    if (stopping) return
    try {
      await connectOnce({ quiet: false })
    } catch {
      scheduleReconnect()
      return
    }
    if (stopping) return
    attempts = 0
    const offlineMs = now() - lostAt
    lostAt = null
    report({ state: 'reconnected', offlineMs })
  }

  /**
   * Connects for the first time; rejects with a ServerlessError when that is impossible. A stop()
   * while it runs settles it quietly (resolved, with nothing connected).
   */
  const start = async () => {
    try {
      await connectOnce({ quiet: true })
    } catch (error) {
      if (stopping || error instanceof Cancelled) return
      if (error instanceof CredentialsUnreadable) {
        throw credentialsError(credentialSource)
      }
      throw startError(failureOf(error), region)
    }
    if (stopping) return
    refreshTimer = timers.setInterval(() => {
      refresh()
    }, CREDENTIAL_REFRESH_MS)
    refreshTimer?.unref?.()
  }

  /** Closes the connection however it is stuck: a destroyed stream ends a pending DISCONNECT. */
  const forceEnd = (client) => {
    client.off?.('message', deliver)
    try {
      client.end(true)
      client.stream?.destroy?.()
    } catch {
      // Already ended.
    }
  }

  /**
   * Sends the sealed goodbye on the will topic and disconnects cleanly (AWS IoT Core then does not
   * send the will). Bounded: when the goodbye is not acknowledged within STOP_TIMEOUT_MS, or
   * publishes are still waiting, the connection is closed at once instead.
   */
  const shutdown = async () => {
    stopping = true
    generation += 1
    for (const cancel of [...cancels]) cancel()
    if (refreshTimer !== null) timers.clearInterval(refreshTimer)
    if (reconnectTimer !== null) timers.clearTimeout(reconnectTimer)
    refreshTimer = null
    reconnectTimer = null
    pacer.close()
    for (const pending of [...connecting]) dispose(pending)
    const client = live
    live = null
    if (!client) return
    let budget = null
    const expired = new Promise((resolve) => {
      budget = timers.setTimeout(() => {
        budget = null
        resolve('expired')
      }, STOP_TIMEOUT_MS)
    })
    try {
      let acknowledged = false
      if (client.connected) {
        const goodbye = new Promise((resolve) =>
          client.publish(
            topics.gone,
            goneFrame(),
            { qos: 1 },
            (error, packet) =>
              resolve(!error && !(packet?.reasonCode >= REFUSED)),
          ),
        )
        acknowledged = (await Promise.race([goodbye, expired])) === true
      }
      if (acknowledged && !inFlight.get(client)) {
        const ended = new Promise((resolve) =>
          client.end(false, {}, () => resolve('ended')),
        )
        if ((await Promise.race([ended, expired])) === 'ended') return
      }
      forceEnd(client)
    } finally {
      if (budget !== null) timers.clearTimeout(budget)
    }
  }

  return {
    start,
    clientId,
    publish: (message) => pacer.publish(message),
    stop() {
      if (!stopped) stopped = shutdown()
      return stopped
    },
  }
}
