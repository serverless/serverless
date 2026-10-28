/**
 * The web bridge's side of the Dev Mode relay: the broker credentials it assumes and its one AWS
 * IoT Core connection (MQTT 5 over a presigned WebSocket), with what it publishes sealed and paced.
 * It speaks the protocol the functions bridge speaks (../../relay/protocol.js): its client id is
 * `bridgeClientId(session, environment)`, it publishes on the session's `up` topic and receives on
 * its own `down` topic and the session's `gone` topic.
 *
 * Runs inside the web app's dev revision, bundled into one file: it imports nothing from the
 * Framework but the relay's own modules. No URL or credential goes into a log line from here.
 */
import mqtt from 'mqtt'
import WebSocket from 'ws'
import {
  KIND,
  bridgeClientId,
  createOpener,
  createSealer,
  laptopClientId,
  topicsOf,
} from '../../relay/protocol.js'
import { WEB_PACING, createPacer } from '../../relay/pacer.js'
import { presignIotWebSocket } from '../../relay/sigv4.js'
import { withoutSecrets } from '../../relay/redact.js'

/** How long one broker session lasts: AWS caps a role assumed with role credentials at one hour. */
export const SESSION_SECONDS = 3600
/** Broker credentials are replaced this long before they expire. */
export const REFRESH_BEFORE_MS = 5 * 60_000
/** After a failed AssumeRole, requests do not ask again for this long. */
export const ASSUME_RETRY_MS = 1_000
/**
 * A connection idle for longer is replaced before it is used: an execution environment that was
 * frozen between requests can hold a socket that no longer reaches AWS IoT Core.
 */
export const IDLE_RECONNECT_MS = 25_000
export const KEEPALIVE_SECONDS = 30
/**
 * How long AWS IoT Core keeps a request frame nobody received (the acceptance window, rounded up).
 */
export const REQUEST_EXPIRY_SECONDS = 3

const ID = /^[A-Za-z0-9_-]{1,48}$/
const ACCOUNT = /^[0-9]{12}$/
const NAME = /^[a-z][a-z0-9-]{0,31}$/
const ROLE_ARN = /^arn:([^:]+):iam::([^:]+):role\/(.+)$/
const FUNCTION_NAME = /^[A-Za-z0-9_-]{1,140}$/
// MQTT 5 reason codes: 0x80 and above are failures.
const REFUSED = 0x80

/**
 * What one execution environment's broker session may touch, from the broker role's ARN. Every
 * part becomes part of a resource ARN, so anything that could widen the session policy (a
 * wildcard, a separator) is refused; the error names the part, never its value.
 */
export const scopeFromRoleArn = ({
  roleArn,
  region,
  session,
  environment,
  functionName,
  invokeFallback = false,
}) => {
  const match = ROLE_ARN.exec(String(roleArn ?? ''))
  if (!match || match[3].endsWith('/')) {
    throw new Error('SLS_DEV_BROKER_ROLE_ARN is not an IAM role ARN')
  }
  const [, partition, account] = match
  if (!NAME.test(partition)) {
    throw new Error("the broker scope's partition is not an AWS partition name")
  }
  if (!ACCOUNT.test(account)) {
    throw new Error(
      "the broker scope's account is not a 12-digit AWS account id",
    )
  }
  if (!NAME.test(String(region ?? ''))) {
    throw new Error("the broker scope's region is not an AWS Region name")
  }
  if (!ID.test(String(session ?? '')) || !ID.test(String(environment ?? ''))) {
    throw new Error(
      "the session and environment ids may only hold letters, digits, '_' and '-'",
    )
  }
  return {
    partition,
    account,
    region,
    session,
    environment,
    // Without a usable name the statement covers the fallback endpoint of any web function, which
    // is what the broker's own policy allows.
    functionName: FUNCTION_NAME.test(String(functionName ?? ''))
      ? functionName
      : '*',
    invokeFallback: Boolean(invokeFallback),
  }
}

/**
 * The AssumeRole session policy: the broker's permissions narrowed to this environment's own
 * client id, the session's request topic, this environment's reply topic, the session's "gone"
 * topic and Direct Messaging to the session's CLI on the ping topic only, exactly as the functions
 * bridge narrows them (dev-mode-bridge/internal/awsauth SessionPolicy). With `invokeFallback` (an
 * IamAuth fallback), also the fallback endpoint of this web function: a session policy intersects
 * the role's permissions, so the signed forward to `sls-dev-fallback` needs its own statement.
 */
export const sessionPolicy = (scope) => {
  const {
    partition,
    region,
    account,
    session,
    environment,
    functionName,
    invokeFallback,
  } = scope
  const iot = `arn:${partition}:iot:${region}:${account}:`
  const topics = topicsOf(session)
  const down = topics.down(environment)
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: 'iot:Connect',
        Resource: `${iot}client/${bridgeClientId(session, environment)}`,
      },
      {
        Effect: 'Allow',
        Action: 'iot:Publish',
        Resource: `${iot}topic/${topics.up}`,
      },
      {
        Effect: 'Allow',
        Action: 'iot:Subscribe',
        Resource: [
          `${iot}topicfilter/${down}`,
          `${iot}topicfilter/${topics.gone}`,
        ],
      },
      {
        Effect: 'Allow',
        Action: 'iot:Receive',
        Resource: [`${iot}topic/${down}`, `${iot}topic/${topics.gone}`],
      },
      {
        Effect: 'Allow',
        Action: 'iot:SendDirectMessage',
        Resource: `${iot}client/${laptopClientId(session)}`,
        Condition: { StringEquals: { 'iot:Topic': topics.ping } },
      },
      ...(invokeFallback
        ? [
            {
              Effect: 'Allow',
              Action: 'lambda:InvokeWebFunctionEndpoint',
              Resource: `arn:${partition}:lambda:${region}:${account}:web-function/${functionName}/endpoint/sls-dev-fallback`,
            },
          ]
        : []),
    ],
  })
}

/**
 * The broker session's credentials: assumed with the ExternalId and the session policy on first
 * use, reused until REFRESH_BEFORE_MS before they expire. Concurrent callers share one AssumeRole;
 * after a failure, callers within ASSUME_RETRY_MS get the same failure without a new call.
 * `assumeRole(params)` resolves `{ accessKeyId, secretAccessKey, sessionToken, expiration }`.
 */
export const createBrokerCredentials = ({
  assumeRole,
  roleArn,
  externalId,
  scope,
  now = Date.now,
}) => {
  const params = {
    RoleArn: roleArn,
    RoleSessionName: `sls-dev-${scope.environment}`,
    ExternalId: externalId,
    Policy: sessionPolicy(scope),
    DurationSeconds: SESSION_SECONDS,
  }
  let current = null
  let pending = null
  let failed = null
  return async () => {
    if (current && now() < current.refreshAt) return current.credentials
    if (failed && now() < failed.until) throw failed.error
    if (!pending) {
      pending = Promise.resolve()
        .then(() => assumeRole(params))
        .then(
          (credentials) => {
            const expiresAt = new Date(credentials.expiration ?? 0).getTime()
            current = {
              credentials,
              refreshAt:
                (Number.isFinite(expiresAt) && expiresAt > 0
                  ? expiresAt
                  : now() + SESSION_SECONDS * 1000) - REFRESH_BEFORE_MS,
            }
            failed = null
            return credentials
          },
          (error) => {
            // The ExternalId never reaches a log line through an AWS error.
            const clean = new Error(
              withoutSecrets(
                String(error?.message ?? error).replaceAll(
                  externalId,
                  '<redacted>',
                ),
              ),
            )
            failed = { error: clean, until: now() + ASSUME_RETRY_MS }
            throw clean
          },
        )
        .finally(() => {
          pending = null
        })
    }
    return pending
  }
}

/**
 * The real connection: mqtt.js over a WebSocket opened with the signed URL (mqtt.js gets the
 * unsigned one), subscribed with QoS 1 to `subscriptions` before it resolves. Resolves
 * `{ publish(topic, payload, { expirySeconds }), end() }`; `onClose` runs once when it drops.
 */
export const connectMqtt = ({
  url,
  endpoint,
  clientId,
  subscriptions,
  onMessage,
  onClose,
  connect = mqtt.connect,
  createWebSocket = (signed, protocols, options) =>
    new WebSocket(signed, protocols, options),
}) =>
  new Promise((resolve, reject) => {
    const brokerUrl = `wss://${endpoint}/mqtt`
    let settled = false
    let connected = false
    let closed = false
    const client = connect(brokerUrl, {
      protocolVersion: 5,
      clientId,
      clean: true,
      keepalive: KEEPALIVE_SECONDS,
      reconnectPeriod: 0,
      resubscribe: false,
      transformWsUrl: () => brokerUrl,
      createWebsocket: (_unsigned, protocols, options) =>
        createWebSocket(url, protocols, options?.wsOptions),
    })
    const fail = (error) => {
      if (settled) return
      settled = true
      client.end(true)
      reject(new Error(withoutSecrets(error?.message ?? error)))
    }
    client.on('error', (error) => fail(error))
    client.on('message', (topic, payload) => onMessage(topic, payload))
    client.on('close', () => {
      if (!settled) {
        fail(new Error('the connection to AWS IoT Core closed'))
        return
      }
      if (closed || !connected) return
      closed = true
      onClose()
    })
    client.once('connect', () => {
      client.subscribe(subscriptions, { qos: 1 }, (error, granted) => {
        const refused = (granted ?? []).find((grant) => grant?.qos >= REFUSED)
        if (error || refused) {
          fail(error ?? new Error(`subscribing was refused (${refused.qos})`))
          return
        }
        settled = true
        connected = true
        resolve({
          publish: (topic, payload, { expirySeconds } = {}) =>
            new Promise((done, failed) => {
              client.publish(
                topic,
                payload,
                {
                  qos: 1,
                  ...(expirySeconds && {
                    properties: { messageExpiryInterval: expirySeconds },
                  }),
                },
                (publishError, packet) => {
                  const code = publishError?.code ?? packet?.reasonCode
                  if (Number.isInteger(code) && code >= REFUSED) {
                    failed(
                      new Error(`AWS IoT Core refused the message (${code})`),
                    )
                  } else if (publishError) {
                    failed(new Error(withoutSecrets(publishError.message)))
                  } else {
                    done()
                  }
                },
              )
            }),
          end: () => client.end(true),
        })
      })
    })
  })

/**
 * The bridge's one AWS IoT Core connection, made on first use (`ready(waitMs)`) and made again
 * after it dropped or sat idle for IDLE_RECONNECT_MS. Frames on this environment's down topic go to
 * the inbox registered for their id (`register(id)`); a `gone` frame and a dropped connection are
 * told to every inbox. What it publishes is sealed for the `up` topic and paced with the web
 * profile, one pacer per connection.
 */
export const createLink = ({
  sessionId,
  key,
  environmentId,
  endpoint,
  region,
  credentials, // async () => broker credentials
  connect, // ({ url, endpoint, clientId, subscriptions, onMessage, onClose }) => Promise<connection>
  presign = presignIotWebSocket,
  now = Date.now,
  timers,
  log = () => {},
  pacing = WEB_PACING,
  idleReconnectMs = IDLE_RECONNECT_MS,
}) => {
  const topics = topicsOf(sessionId)
  const down = topics.down(environmentId)
  const clientId = bridgeClientId(sessionId, environmentId)
  const seal = createSealer({ key })
  const open = createOpener({ key })
  const inboxes = new Map()
  // Ids that ended before a frame for them arrived: such a frame is logged, never acted on.
  const ended = new Map()
  let current = null
  let epoch = 0
  let closed = false

  const deliver = (topic, payload) => {
    const frame = open(topic, payload)
    if (!frame) return
    if (topic === topics.gone) {
      if (frame.header.kind === KIND.GONE) {
        for (const inbox of inboxes.values()) inbox.event('gone')
      }
      return
    }
    if (topic !== down) return
    if (current?.connection && !current.dropped) current.lastUsed = now()
    const inbox = inboxes.get(frame.header.id)
    if (inbox) {
      inbox.push(frame)
      return
    }
    const outcome = ended.get(frame.header.id)
    if (frame.header.kind !== KIND.ACCEPTED) return
    if (outcome === 'fallback') {
      ended.set(frame.header.id, 'logged')
      log(
        `${frame.header.id} was accepted after it had gone to the deployed code; the answer from the developer's machine is ignored`,
      )
    } else if (outcome === 'abandoned') {
      ended.set(frame.header.id, 'logged')
      log(
        `${frame.header.id} was accepted after its caller had left; the answer from the developer's machine is ignored`,
      )
    }
  }

  const drop = (state) => {
    if (state.dropped) return
    state.dropped = true
    state.pacer?.close()
    try {
      state.connection?.end()
    } catch {
      // Ending a connection that is already gone changes nothing.
    }
    if (current === state) current = null
    for (const inbox of inboxes.values()) {
      if (inbox.epoch === state.epoch) inbox.event('lost')
    }
  }

  const establish = () => {
    epoch += 1
    const state = {
      epoch,
      dropped: false,
      connection: null,
      pacer: null,
      lastUsed: now(),
    }
    state.ready = (async () => {
      const brokerCredentials = await credentials()
      const url = await presign({
        endpoint,
        region,
        credentials: brokerCredentials,
        date: new Date(now()),
      })
      const connection = await connect({
        url,
        endpoint,
        clientId,
        subscriptions: [down, topics.gone],
        onMessage: deliver,
        onClose: () => {
          log('the connection to AWS IoT Core ended')
          drop(state)
        },
      })
      if (state.dropped || closed) {
        connection.end()
        throw new Error('the connection to AWS IoT Core was closed')
      }
      state.connection = connection
      state.pacer = createPacer({
        send: ({ topic, payload, expirySeconds }) =>
          connection.publish(topic, payload, { expirySeconds }),
        now,
        timers,
        ...pacing,
      })
      return state
    })()
    state.ready.catch((error) => {
      log(`could not connect to AWS IoT Core: ${withoutSecrets(error.message)}`)
      drop(state)
    })
    current = state
    return state
  }

  const withTimeout = (promise, ms, what) =>
    new Promise((resolve, reject) => {
      const timer = timers.setTimeout(
        () => reject(new Error(`${what} took longer than ${ms} ms`)),
        ms,
      )
      promise.then(
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

  return {
    clientId,
    environmentId,
    /**
     * The connection, made or replaced as needed; rejects when it is not there within `waitMs`
     * (the attempt goes on for the next request).
     */
    async ready(waitMs) {
      if (closed) throw new Error('the relay has stopped')
      // Only a connection nothing waits on: a response streaming on it keeps it.
      if (
        current?.connection &&
        !current.dropped &&
        now() - current.lastUsed > idleReconnectMs &&
        ![...inboxes.values()].some((inbox) => inbox.epoch === current.epoch)
      ) {
        drop(current)
      }
      const state = current && !current.dropped ? current : establish()
      const ready = await withTimeout(
        state.ready,
        waitMs,
        'connecting to AWS IoT Core',
      )
      ready.lastUsed = now()
      return ready
    },
    /** Replaces a connection that may no longer deliver (an unacknowledged publish). */
    broken(state) {
      if (state) drop(state)
    },
    /**
     * Seals and queues one frame on `state`'s pacer. Resolves true once AWS IoT Core acknowledged
     * it, false when it was dropped (its deadline passed, or the connection ended); rejects when
     * AWS IoT Core refused it.
     */
    publish(state, header, body, options = {}) {
      state.lastUsed = now()
      return state.pacer.publish({
        topic: topics.up,
        payload: seal(topics.up, header, body),
        ...options,
      })
    },
    /** The frames for one request id, and the events that end the wait for them. */
    register(id, state) {
      const queue = []
      let waiter = null
      const wake = (item) => {
        if (waiter) {
          const resolve = waiter
          waiter = null
          resolve(item)
        } else {
          queue.push(item)
        }
      }
      const inbox = {
        epoch: state.epoch,
        push: (frame) => wake({ frame }),
        event: (name) => wake({ event: name }),
        /**
         * The next frame (`{ frame }`) or event (`{ event }`: 'gone', 'lost', 'timeout', or what
         * `abort` was given); `until` is a time on the `now` clock.
         */
        next(until) {
          if (queue.length) return Promise.resolve(queue.shift())
          return new Promise((resolve) => {
            let timer = null
            waiter = (item) => {
              if (timer !== null) timers.clearTimeout(timer)
              resolve(item)
            }
            if (until !== undefined) {
              timer = timers.setTimeout(
                () => {
                  timer = null
                  waiter = null
                  resolve({ event: 'timeout' })
                },
                Math.max(0, until - now()),
              )
            }
          })
        },
        /** Takes the frames already queued, leaving events. */
        drain() {
          const frames = queue.filter((item) => item.frame)
          queue.splice(0, queue.length, ...queue.filter((item) => !item.frame))
          return frames.map((item) => item.frame)
        },
        /** Puts frames back at the front, in order. */
        unshift(frames) {
          queue.unshift(...frames.map((frame) => ({ frame })))
        },
        /** Ends the wait for this id; `outcome` says who answered it. */
        end(outcome) {
          inboxes.delete(id)
          ended.set(id, outcome)
          if (ended.size > 1024) ended.delete(ended.keys().next().value)
          if (waiter) inbox.event('ended')
          if (state.connection && !state.dropped) state.lastUsed = now()
        },
      }
      inboxes.set(id, inbox)
      return inbox
    },
    /** Disconnects; every inbox is told the connection is lost. */
    close() {
      closed = true
      if (current) drop(current)
      for (const inbox of inboxes.values()) inbox.event('lost')
    },
  }
}
