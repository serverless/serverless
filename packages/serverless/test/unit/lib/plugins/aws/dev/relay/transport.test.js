import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import net from 'net'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  CONNECT_TIMEOUT_MS,
  KEEPALIVE_SECONDS,
  RECONNECT_MAX_MS,
  RECONNECT_MIN_MS,
  RESOLVE_WAIT_MS,
  STOP_TIMEOUT_MS,
  createTransport,
} from '../../../../../../../lib/plugins/aws/dev/relay/transport.js'
import { manualClock } from './manual-clock.js'

const ENDPOINT = 'abc-ats.iot.us-east-1.amazonaws.com'
const SESSION = 's_0123456789ab'
const UP = `sls-dev/${SESSION}/up`
const GONE = `sls-dev/${SESSION}/gone`
const CREDENTIAL_REFRESH_MS = 60_000

/**
 * Stands in for an mqtt.js 5 client: records calls; the test decides what the broker answers.
 * Like the real client created with reconnectPeriod 0 and a clean session, a forced end fails
 * the publishes still waiting for their acknowledgement.
 */
class FakeClient extends EventEmitter {
  constructor(url, options) {
    super()
    this.url = url
    this.options = options
    this.stream = new EventEmitter()
    this.connected = false
    this.subscriptions = []
    this.published = []
    this.waiting = []
    this.ended = undefined
    this.subscribeAnswer = (cb) => cb(null, [{ topic: UP, qos: 1 }])
    this.publishAnswer = (cb) => cb(null, { reasonCode: 0 })
  }

  connectNow() {
    this.connected = true
    this.emit('connect', { reasonCode: 0 })
  }

  dropNow() {
    this.connected = false
    this.emit('close')
  }

  subscribe(topic, options, cb) {
    this.subscriptions.push([topic, options])
    this.subscribeAnswer(cb)
  }

  publish(topic, payload, options, cb) {
    this.published.push({ topic, payload, options })
    this.waiting.push(cb)
    this.publishAnswer((...args) => {
      this.waiting = this.waiting.filter((waiting) => waiting !== cb)
      cb(...args)
    })
  }

  end(force, options, cb) {
    this.ended = force
    this.connected = false
    if (force) {
      for (const waiting of this.waiting.splice(0)) {
        waiting(new Error('Connection closed'))
      }
    }
    ;(typeof options === 'function' ? options : cb)?.()
  }
}

/** The error Node.js gives when a host name does not resolve (as ws passes it on). */
const unresolved = (hostname, code = 'ENOTFOUND') =>
  Object.assign(new Error(`getaddrinfo ${code} ${hostname}`), {
    code,
    syscall: 'getaddrinfo',
    hostname,
  })

/** A connect whose first `failures` clients fail with `error()`; later ones connect. */
const failingFirst = (failures, error) => {
  let created = 0
  return (url, options) => {
    created += 1
    const client = new FakeClient(url, options)
    const failing = created <= failures
    setImmediate(() =>
      failing ? client.emit('error', error()) : client.connectNow(),
    )
    return client
  }
}

const autoConnect = (url, options) => {
  const client = new FakeClient(url, options)
  setImmediate(() => client.connectNow())
  return client
}

const setup = (overrides = {}) => {
  const clock = manualClock(Date.UTC(2026, 9, 2, 12, 0, 0))
  const states = []
  const messages = []
  const clients = []
  let reads = 0
  const { connect = autoConnect, ...rest } = overrides
  const transport = createTransport({
    endpoint: ENDPOINT,
    region: 'us-east-1',
    sessionId: SESSION,
    credentials: async () => {
      reads += 1
      return {
        accessKeyId: `AKID${reads}`,
        secretAccessKey: 'secret',
        sessionToken: 'token',
      }
    },
    goneFrame: (() => {
      let n = 0
      return () => Buffer.from(`gone-${(n += 1)}`)
    })(),
    onMessage: (topic, payload) => messages.push([topic, payload.toString()]),
    onState: (state) => states.push(state),
    connect: (url, options) => {
      const client = connect(url, options)
      clients.push(client)
      return client
    },
    now: clock.now,
    timers: clock.timers,
    env: {},
    createWebSocket: (url, protocols, options) => ({ url, protocols, options }),
    ...rest,
  })
  return {
    transport,
    clock,
    states,
    messages,
    clients,
    client: () => clients.at(-1),
    // What mqtt.js does with a WebSocket URL: it builds one, passes it through transformWsUrl, and
    // hands the result to createWebsocket. The transport opens the signed URL there.
    signedUrl: (client = clients.at(-1)) =>
      new URL(
        client.options.createWebsocket(
          client.options.transformWsUrl(
            `wss://${ENDPOINT}:443/mqtt`,
            client.options,
          ),
          ['mqtt'],
          client.options,
        ).url,
      ),
  }
}

/** The reconnect delays waiting on the clock (the credential refresh interval left out). */
const reconnectDelays = (clock) => clock.timeouts()

describe("this machine's AWS IoT Core connection", () => {
  test('connects with MQTT 5, a clean session, keep-alive 30 s and a will, then subscribes to the session', async () => {
    const { transport, client, clock } = setup()
    await transport.start()
    const { url, options } = client()
    expect(url).toBe(`wss://${ENDPOINT}/mqtt`)
    expect(transport.clientId).toBe(`sls-dev-${SESSION}-cli`)
    expect(options).toMatchObject({
      protocolVersion: 5,
      clientId: `sls-dev-${SESSION}-cli`,
      clean: true,
      keepalive: KEEPALIVE_SECONDS,
      reconnectPeriod: 0,
      resubscribe: false,
      will: { topic: GONE, qos: 1, retain: false },
    })
    expect(client().subscriptions).toEqual([[UP, { qos: 1 }]])
    await transport.stop()
    expect(clock.live()).toBe(0)
  })

  test('the WebSocket URL is signed when the client is created, with the token appended, and kept out of the options', async () => {
    const { transport, client, clock, signedUrl } = setup()
    await transport.start()
    const url = signedUrl()
    expect(url.host).toBe(ENDPOINT)
    expect(url.pathname).toBe('/mqtt')
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(
      /^AKID1\/20261002\/us-east-1\/iotdevicegateway\/aws4_request$/,
    )
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261002T120000Z')
    expect(url.toString()).toMatch(
      /X-Amz-Signature=[0-9a-f]{64}&X-Amz-Security-Token=token$/,
    )
    const { transformWsUrl, createWebsocket, will, wsOptions, ...plain } =
      client().options
    expect(JSON.stringify(plain)).not.toMatch(/X-Amz|token/)
    expect(client().url).not.toMatch(/X-Amz/)
    await transport.stop()
    expect(clock.live()).toBe(0)
  })

  test('mqtt.js only ever sees the unsigned URL: the signed one goes straight to the WebSocket, with the proxy agent', async () => {
    const { transport, client } = setup({
      env: { HTTPS_PROXY: 'http://127.0.0.1:3128' },
    })
    await transport.start()
    const { options } = client()
    const unsigned = options.transformWsUrl(
      `wss://${ENDPOINT}:443/mqtt`,
      options,
    )
    // mqtt.js logs this one (DEBUG=mqttjs*) and keeps it as the stream's url.
    expect(unsigned).toBe(`wss://${ENDPOINT}/mqtt`)
    const socket = options.createWebsocket(unsigned, ['mqtt'], options)
    expect(socket.url).toMatch(/^wss:\/\/[^/]+\/mqtt\?X-Amz-Algorithm=/)
    expect(socket.protocols).toEqual(['mqtt'])
    expect(socket.options).toBe(options.wsOptions)
    expect(socket.options.agent).toBeInstanceOf(HttpsProxyAgent)
    await transport.stop()
  })

  test('a reconnect reads the credentials again and signs a new URL and a new will on a new client', async () => {
    const { transport, clients, clock, states, signedUrl } = setup()
    await transport.start()
    const first = clients[0]
    await clock.advance(5_000)
    first.dropNow()
    expect(first.ended).toBe(true)
    await clock.advance(RECONNECT_MIN_MS + 500)
    await clock.flush()
    expect(clients).toHaveLength(2)
    const second = clients[1]
    expect(signedUrl(second).searchParams.get('X-Amz-Credential')).toMatch(
      /^AKID2\//,
    )
    expect(signedUrl(second).searchParams.get('X-Amz-Date')).not.toBe(
      signedUrl(first).searchParams.get('X-Amz-Date'),
    )
    expect(second.options.will.payload.toString()).not.toBe(
      first.options.will.payload.toString(),
    )
    expect(second.subscriptions).toEqual([[UP, { qos: 1 }]])
    expect(states.map((s) => s.state)).toEqual(['lost', 'reconnected'])
    await transport.stop()
    expect(clock.live()).toBe(0)
  })

  test('messages reach the handler; a throwing handler does not end the connection', async () => {
    const seen = []
    const { transport, client } = setup({
      onMessage: (topic, payload) => {
        if (payload.toString() === 'bad') throw new Error('boom')
        seen.push([topic, payload.toString()])
      },
    })
    await transport.start()
    client().emit('message', UP, Buffer.from('bad'))
    client().emit('message', UP, Buffer.from('ok'))
    expect(seen).toEqual([[UP, 'ok']])
    expect(client().ended).toBeUndefined()
    await transport.stop()
  })

  test('a lost connection is reported once, backs off up to 30 s, and the reconnect reports the time offline', async () => {
    // The first connection succeeds; reconnect attempts only close until `failing` is false.
    let failing = true
    let created = 0
    const { transport, clients, clock, states } = setup({
      connect: (url, options) => {
        created += 1
        const client = new FakeClient(url, options)
        const succeed = created === 1 || !failing
        setImmediate(() => (succeed ? client.connectNow() : client.dropNow()))
        return client
      },
    })
    await transport.start()
    const lostAt = clock.now()
    clients[0].dropNow()
    clients[0].dropNow()
    const delays = []
    for (let i = 0; i < 7; i += 1) {
      const [delay] = reconnectDelays(clock)
      delays.push(delay)
      await clock.advance(delay)
      await clock.flush()
    }
    expect(states).toEqual([{ state: 'lost', reason: 'the connection closed' }])
    // 1, 2, 4, 8, 16 s, then 30 s at most, each with up to half a second of jitter.
    const bases = [1, 2, 4, 8, 16, 30, 30].map((s) => s * RECONNECT_MIN_MS)
    delays.forEach((delay, i) => {
      expect(delay).toBeGreaterThanOrEqual(bases[i])
      expect(delay).toBeLessThan(bases[i] + 500)
    })
    expect(clients).toHaveLength(8)
    expect(clients.slice(0, -1).every((client) => client.ended === true)).toBe(
      true,
    )
    failing = false
    const [delay] = reconnectDelays(clock)
    await clock.advance(delay)
    await clock.flush()
    expect(states.map((s) => s.state)).toEqual(['lost', 'reconnected'])
    expect(states[1].offlineMs).toBe(clock.now() - lostAt)
    expect(clients.at(-1).subscriptions).toEqual([[UP, { qos: 1 }]])
    // After a reconnect the backoff starts again from one second.
    clients.at(-1).dropNow()
    expect(reconnectDelays(clock)[0]).toBeLessThan(RECONNECT_MIN_MS + 500)
    expect(states.map((s) => s.state)).toEqual(['lost', 'reconnected', 'lost'])
    await transport.stop()
    expect(clock.live()).toBe(0)
  })

  test('start fails at once when AWS IoT Core refuses: a refused subscription, a refused CONNACK, a refused signature', async () => {
    const refusedSubscription = setup({
      connect: (url, options) => {
        const client = autoConnect(url, options)
        client.subscribeAnswer = (cb) =>
          cb(
            Object.assign(new Error('Subscribe error: Not authorized'), {
              code: 135,
            }),
          )
        return client
      },
    })
    await expect(refusedSubscription.transport.start()).rejects.toMatchObject({
      code: 'DEV_MODE_IOT_CONNECT_DENIED',
      message: expect.stringMatching(
        /subscribe to AWS IoT Core.*iot:Subscribe/,
      ),
    })
    expect(refusedSubscription.client().ended).toBe(true)
    expect(refusedSubscription.clock.live()).toBe(0)

    const refusedConnack = setup({
      connect: (url, options) => {
        const client = new FakeClient(url, options)
        setImmediate(() => {
          client.emit(
            'error',
            Object.assign(new Error('Connection refused: Not authorized'), {
              code: 135,
            }),
          )
          client.emit('close')
        })
        return client
      },
    })
    await expect(refusedConnack.transport.start()).rejects.toMatchObject({
      code: 'DEV_MODE_IOT_CONNECT_DENIED',
      message: expect.stringMatching(/iot:Connect/),
    })
    expect(refusedConnack.clock.live()).toBe(0)

    // ws reports a refused handshake on the stream only; mqtt.js does not forward an error
    // without a code, it just closes.
    const refusedSignature = setup({
      connect: (url, options) => {
        const client = new FakeClient(url, options)
        setImmediate(() => {
          client.stream.emit(
            'error',
            new Error('Unexpected server response: 403'),
          )
          client.emit('close')
        })
        return client
      },
    })
    await expect(refusedSignature.transport.start()).rejects.toMatchObject({
      code: 'DEV_MODE_IOT_CONNECT_DENIED',
      message: expect.stringMatching(/HTTP 403.*credentials.*clock/s),
    })
    expect(refusedSignature.client().ended).toBe(true)
    expect(refusedSignature.clock.live()).toBe(0)
  })

  test('start fails at once as unreachable on a network error or a connection that only closes', async () => {
    const offline = setup({
      connect: (url, options) => {
        const client = new FakeClient(url, options)
        setImmediate(() =>
          client.emit(
            'error',
            Object.assign(new Error(`connect ECONNREFUSED 10.0.0.1:443`), {
              code: 'ECONNREFUSED',
            }),
          ),
        )
        return client
      },
    })
    await expect(offline.transport.start()).rejects.toMatchObject({
      code: 'DEV_MODE_IOT_UNREACHABLE',
      message: expect.stringMatching(
        /ECONNREFUSED.*Check your network connection and proxy settings/,
      ),
    })
    expect(offline.clients).toHaveLength(1)
    expect(offline.client().ended).toBe(true)
    expect(offline.states).toEqual([])
    expect(offline.clock.live()).toBe(0)

    // A proxy whose own name does not resolve is not the endpoint's name: no wait either.
    const noProxy = setup({
      connect: (url, options) => {
        const client = new FakeClient(url, options)
        setImmediate(() =>
          client.emit('error', unresolved('proxy.example.internal')),
        )
        return client
      },
    })
    await expect(noProxy.transport.start()).rejects.toMatchObject({
      code: 'DEV_MODE_IOT_UNREACHABLE',
      message: expect.stringMatching(/Check your network connection/),
    })
    expect(noProxy.clients).toHaveLength(1)
    expect(noProxy.clock.live()).toBe(0)

    const closes = setup({
      connect: (url, options) => {
        const client = new FakeClient(url, options)
        setImmediate(() => client.emit('close'))
        return client
      },
    })
    await expect(closes.transport.start()).rejects.toMatchObject({
      code: 'DEV_MODE_IOT_UNREACHABLE',
    })
    expect(closes.clients).toHaveLength(1)
    expect(closes.clock.live()).toBe(0)
  })

  test('start gives up after 20 s without an answer and ends the client', async () => {
    const { transport, client, clock } = setup({
      connect: (url, options) => new FakeClient(url, options),
    })
    let outcome = null
    transport.start().then(
      () => (outcome = 'started'),
      (error) => (outcome = error),
    )
    await clock.flush()
    expect(outcome).toBeNull()
    await clock.advance(CONNECT_TIMEOUT_MS - 1)
    expect(outcome).toBeNull()
    await clock.advance(1)
    await clock.flush()
    expect(outcome).toMatchObject({ code: 'DEV_MODE_IOT_UNREACHABLE' })
    expect(client().ended).toBe(true)
    expect(clock.live()).toBe(0)
  })

  test('stop during start ends the wait at once, and start then settles quietly', async () => {
    const { transport, client, clock, states } = setup({
      connect: (url, options) => new FakeClient(url, options),
    })
    const starting = transport.start().then(
      () => 'resolved',
      (error) => error,
    )
    await clock.flush()
    await transport.stop()
    expect(await starting).toBe('resolved')
    expect(client().ended).toBe(true)
    expect(states).toEqual([])
    expect(clock.live()).toBe(0)
  })

  describe("when the endpoint's name does not resolve yet (a region's first use)", () => {
    test('start tries again with backoff, says it waits once, and connects when the name resolves', async () => {
      let failures = 0
      const { transport, clients, clock, states } = setup({
        connect: failingFirst(3, () => {
          failures += 1
          // The DNS error can also come wrapped, as the cause of another error.
          return failures === 2
            ? new Error('WebSocket error', { cause: unresolved(ENDPOINT) })
            : unresolved(ENDPOINT, failures === 3 ? 'EAI_AGAIN' : 'ENOTFOUND')
        }),
      })
      const startedAt = clock.now()
      let outcome = null
      transport.start().then(
        () => (outcome = 'started'),
        (error) => (outcome = error),
      )
      await clock.flush()
      expect(states).toEqual([
        { state: 'endpoint_unresolved', region: 'us-east-1' },
      ])
      const delays = []
      while (outcome === null && delays.length < 10) {
        const [delay] = clock.timeouts()
        delays.push(delay)
        await clock.advance(delay)
        await clock.flush()
      }
      expect(outcome).toBe('started')
      // 1, 2 and 4 s between the attempts.
      expect(delays).toEqual([1, 2, 4].map((s) => s * RECONNECT_MIN_MS))
      expect(clock.now() - startedAt).toBe(7 * RECONNECT_MIN_MS)
      expect(clients).toHaveLength(4)
      expect(clients.slice(0, -1).every((c) => c.ended === true)).toBe(true)
      expect(clients.at(-1).subscriptions).toEqual([[UP, { qos: 1 }]])
      expect(states).toHaveLength(1)
      await transport.stop()
      expect(clock.live()).toBe(0)
    })

    test(`start gives up after ${RESOLVE_WAIT_MS / 1000} s, with the same code and advice to try again in a few minutes`, async () => {
      const { transport, clients, clock } = setup({
        connect: failingFirst(Infinity, () => unresolved(ENDPOINT)),
      })
      const startedAt = clock.now()
      let outcome = null
      transport.start().then(
        () => (outcome = 'started'),
        (error) => (outcome = error),
      )
      await clock.flush()
      while (outcome === null && clock.timeouts().length > 0) {
        await clock.advance(clock.timeouts()[0])
        await clock.flush()
      }
      expect(clock.now() - startedAt).toBe(RESOLVE_WAIT_MS)
      expect(outcome).toMatchObject({
        code: 'DEV_MODE_IOT_UNREACHABLE',
        message: `The AWS IoT Core endpoint for this account in us-east-1 cannot be resolved yet (getaddrinfo ENOTFOUND ${ENDPOINT}). AWS creates an account's endpoint in a region the first time it is used there, and it can take a few minutes before it resolves. Run the command again in a few minutes. If it still cannot be resolved then, check your network connection and proxy settings (HTTPS_PROXY).`,
      })
      expect(clients.length).toBeGreaterThan(2)
      expect(clients.every((c) => c.ended === true)).toBe(true)
      expect(clock.live()).toBe(0)
    })

    test('stop during the wait ends it at once, and start then settles quietly', async () => {
      const { transport, clients, clock } = setup({
        connect: failingFirst(Infinity, () => unresolved(ENDPOINT)),
      })
      const starting = transport.start().then(
        () => 'resolved',
        (error) => error,
      )
      await clock.flush()
      expect(clients).toHaveLength(1)
      expect(clock.timeouts()).toEqual([RECONNECT_MIN_MS])
      await transport.stop()
      expect(await starting).toBe('resolved')
      expect(clients).toHaveLength(1)
      expect(clock.live()).toBe(0)
    })
  })

  test('no error message carries the signed URL', async () => {
    const { transport } = setup({
      connect: (url, options) => {
        const socket = options.createWebsocket(
          options.transformWsUrl(url, options),
          ['mqtt'],
          options,
        )
        throw new SyntaxError(`Invalid URL: ${socket.url}`)
      },
    })
    const error = await transport.start().catch((caught) => caught)
    expect(error.code).toBe('DEV_MODE_IOT_UNREACHABLE')
    expect(error.message).toMatch(/Invalid URL/)
    expect(error.message).not.toMatch(/AKID1|[0-9a-f]{64}|token/)
  })

  test('credentials that cannot be read fail the start; later they are reported only while they keep this machine from reconnecting', async () => {
    const broken = setup({
      credentials: async () => {
        throw new Error('Token is expired')
      },
      credentialSource: { source: 'profile', profile: 'dev-sso' },
    })
    await expect(broken.transport.start()).rejects.toMatchObject({
      code: 'DEV_MODE_AWS_CREDENTIALS_INVALID',
      message:
        'Dev Mode could not read your AWS credentials to connect to AWS IoT Core. The credentials come from AWS profile "dev-sso": sign in again with "serverless login aws --aws-profile dev-sso" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile\'s keys, or choose another profile with --aws-profile.',
    })
    expect(broken.clients).toHaveLength(0)
    expect(broken.clock.live()).toBe(0)

    let fail = false
    let reads = 0
    const later = setup({
      credentials: async () => {
        reads += 1
        if (fail) throw new Error('Token is expired')
        return { accessKeyId: `a${reads}`, secretAccessKey: 'b' }
      },
    })
    await later.transport.start()
    expect(reads).toBe(1)
    await later.clock.advance(CREDENTIAL_REFRESH_MS)
    expect(reads).toBe(2)
    fail = true
    // While connected, a failed refresh changes nothing this machine can see: it is not reported.
    await later.clock.advance(CREDENTIAL_REFRESH_MS)
    await later.clock.advance(CREDENTIAL_REFRESH_MS)
    expect(later.states).toEqual([])
    later.client().dropNow()
    for (let i = 0; i < 3; i += 1) {
      await later.clock.advance(RECONNECT_MAX_MS + 500)
      await later.clock.flush()
    }
    expect(later.clients).toHaveLength(1)
    expect(later.states.map((s) => s.state)).toEqual([
      'lost',
      'credentials_expired',
    ])
    fail = false
    await later.clock.advance(RECONNECT_MAX_MS + 500)
    await later.clock.flush()
    expect(later.clients).toHaveLength(2)
    expect(later.states.map((s) => s.state)).toEqual([
      'lost',
      'credentials_expired',
      'credentials_refreshed',
      'reconnected',
    ])
    // A later failure while connected is again not reported.
    fail = true
    await later.clock.advance(CREDENTIAL_REFRESH_MS)
    expect(later.states).toHaveLength(4)
    await later.transport.stop()
    expect(later.clock.live()).toBe(0)
  })

  test('publishes are QoS 1 with the expiry asked for; a refused PUBACK or no connection rejects', async () => {
    const { transport, client } = setup()
    await transport.start()
    expect(
      await transport.publish({
        topic: 't',
        payload: Buffer.from('x'),
        priority: 'control',
        expirySeconds: 3,
      }),
    ).toBe(true)
    expect(client().published[0].options).toEqual({
      qos: 1,
      properties: { messageExpiryInterval: 3 },
    })
    await transport.publish({ topic: 't', payload: Buffer.from('y') })
    expect(client().published[1].options).toEqual({ qos: 1 })
    client().publishAnswer = (cb) =>
      cb(
        Object.assign(new Error('Publish error: Not authorized'), {
          code: 135,
        }),
        {
          reasonCode: 135,
        },
      )
    await expect(
      transport.publish({ topic: 't', payload: Buffer.from('z') }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/reason code 135/),
      reasonCode: 135,
    })
    client().dropNow()
    const offline = await transport
      .publish({ topic: 't', payload: Buffer.from('w') })
      .catch((error) => error)
    expect(offline.message).toMatch(/not connected/)
    expect(offline).not.toHaveProperty('reasonCode')
    await transport.stop()
  })

  test('a failed publish is reported without a URL or a signed parameter in any form', async () => {
    const { transport, client } = setup()
    await transport.start()
    client().publishAnswer = (cb) =>
      cb(
        new Error(
          'write failed for wss://h.iot.us-east-1.amazonaws.com/mqtt?X-Amz-Date=20261002T120000Z, X-Amz-Security-Token: tok3n/a+b= and {"X-Amz-Signature": "e8df4926"}',
        ),
      )
    const error = await transport
      .publish({ topic: 't', payload: Buffer.from('x') })
      .catch((caught) => caught)
    expect(error.message).toMatch(/^write failed for /)
    expect(error.message).not.toMatch(
      /X-Amz-|tok3n|e8df4926|20261002|wss:\/\/|amazonaws/,
    )
    await transport.stop()
  })

  test('a dropped connection fails the publishes still waiting for their acknowledgement', async () => {
    const { transport, client, clock } = setup()
    await transport.start()
    client().publishAnswer = () => {}
    const waiting = transport.publish({ topic: 't', payload: Buffer.from('x') })
    await clock.flush()
    client().dropNow()
    await expect(waiting).rejects.toThrow(/Connection closed/)
    await transport.stop()
    expect(clock.live()).toBe(0)
  })

  test('stop says goodbye on the will topic, then disconnects cleanly', async () => {
    const { transport, client, clock } = setup()
    await transport.start()
    await transport.stop()
    expect(client().published.map((p) => p.topic)).toEqual([GONE])
    expect(client().published[0].options).toEqual({ qos: 1 })
    expect(client().ended).toBe(false)
    expect(clock.live()).toBe(0)
    await transport.stop()
    expect(
      await transport.publish({ topic: 't', payload: Buffer.from('x') }),
    ).toBe(false)
  })

  test('stop waits 2 s at most for the goodbye to be acknowledged, then closes the connection', async () => {
    const { transport, client, clock } = setup()
    await transport.start()
    client().publishAnswer = () => {}
    let stopped = false
    transport.stop().then(() => (stopped = true))
    await clock.flush()
    expect(stopped).toBe(false)
    await clock.advance(STOP_TIMEOUT_MS)
    await clock.flush()
    expect(stopped).toBe(true)
    expect(client().ended).toBe(true)
    expect(clock.live()).toBe(0)
  })

  test('stop while waiting to reconnect cancels the reconnect', async () => {
    const { transport, clients, clock } = setup()
    await transport.start()
    clients[0].dropNow()
    expect(reconnectDelays(clock)).toHaveLength(1)
    await transport.stop()
    expect(clock.live()).toBe(0)
    await clock.advance(RECONNECT_MAX_MS * 2)
    await clock.flush()
    expect(clients).toHaveLength(1)
  })

  test('the WebSocket goes through the proxy in the given environment unless its NO_PROXY covers the endpoint', async () => {
    const agentFor = async (env) => {
      const { transport, client } = setup({ env })
      await transport.start()
      const { agent } = client().options.wsOptions
      await transport.stop()
      return agent
    }
    expect(await agentFor({})).toBeUndefined()
    const agent = await agentFor({ HTTPS_PROXY: 'http://127.0.0.1:3128' })
    expect(agent).toBeInstanceOf(HttpsProxyAgent)
    expect(agent.proxy.href).toBe('http://127.0.0.1:3128/')
    expect(
      await agentFor({
        HTTPS_PROXY: 'http://127.0.0.1:3128',
        NO_PROXY: 'localhost,.amazonaws.com',
      }),
    ).toBeUndefined()
    expect(
      await agentFor({
        https_proxy: 'http://127.0.0.1:3128',
        no_proxy: `${ENDPOINT}`,
      }),
    ).toBeUndefined()
    // NO_PROXY=* covers every host, alone or in a list, as in common tooling.
    for (const noProxy of ['*', ' * ', 'localhost, *']) {
      expect(
        await agentFor({
          HTTPS_PROXY: 'http://127.0.0.1:3128',
          NO_PROXY: noProxy,
        }),
      ).toBeUndefined()
    }
    // The proxy the AWS SDK clients take for an HTTPS endpoint: HTTPS_PROXY, then HTTP_PROXY,
    // then a generic `proxy`.
    expect(
      (
        await agentFor({
          proxy: 'http://first:1',
          HTTP_PROXY: 'http://second:2',
          HTTPS_PROXY: 'http://third:3',
        })
      ).proxy.host,
    ).toBe('third:3')
    expect(
      (
        await agentFor({
          proxy: 'http://first:1',
          HTTP_PROXY: 'http://second:2',
        })
      ).proxy.host,
    ).toBe('second:2')
    expect((await agentFor({ proxy: 'http://first:1' })).proxy.host).toBe(
      'first:1',
    )
    // The machine's own NO_PROXY does not apply to an environment given explicitly.
    const saved = process.env.NO_PROXY
    process.env.NO_PROXY = '.amazonaws.com'
    try {
      expect(
        await agentFor({ HTTPS_PROXY: 'http://127.0.0.1:3128' }),
      ).toBeInstanceOf(HttpsProxyAgent)
    } finally {
      if (saved === undefined) delete process.env.NO_PROXY
      else process.env.NO_PROXY = saved
    }
  })
})

/** Resolves after `n` turns of the microtask queue. */
const microtasks = async (n) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve()
}

/**
 * After stop: every client is ended, nothing reaches onMessage or onState any more, and no timer
 * is left. `statesAtStop` is how many states had been reported when stop() was called.
 */
const expectFullyStopped = async (
  { clients, clock, states, messages },
  statesAtStop,
) => {
  for (const client of clients) expect(client.ended).not.toBeUndefined()
  const before = messages.length
  for (const client of clients) client.emit('message', UP, Buffer.from('late'))
  expect(messages).toHaveLength(before)
  await clock.advance(RECONNECT_MAX_MS * 4)
  await clock.flush()
  expect(states).toHaveLength(statesAtStop)
  expect(clock.live()).toBe(0)
}

describe("this machine's AWS IoT Core connection when it is stopped or late", () => {
  test('credentials read after the start deadline never connect a client', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const harness = setup({
      credentials: async () => {
        await gate
        return { accessKeyId: 'AKID', secretAccessKey: 'secret' }
      },
    })
    const starting = harness.transport.start().catch((error) => error)
    await harness.clock.flush()
    await harness.clock.advance(CONNECT_TIMEOUT_MS)
    expect(await starting).toMatchObject({ code: 'DEV_MODE_IOT_UNREACHABLE' })
    release()
    await harness.clock.flush(10)
    for (const client of harness.clients) expect(client.ended).toBe(true)
    await harness.transport.stop()
    await expectFullyStopped(harness, 0)
  })

  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
    'a stop %i microtasks after the SUBACK of the first connection leaves nothing behind',
    async (n) => {
      let stopping = null
      let statesAtStop = null
      let transport
      const harness = setup({
        connect: (url, options) => {
          const client = autoConnect(url, options)
          client.subscribeAnswer = (cb) => {
            cb(null, [{ topic: UP, qos: 1 }])
            microtasks(n).then(() => {
              statesAtStop = harness.states.length
              stopping = transport.stop()
            })
          }
          return client
        },
      })
      transport = harness.transport
      const started = await transport.start().then(
        () => 'resolved',
        (error) => error,
      )
      await harness.clock.flush()
      expect(started).toBe('resolved')
      expect(stopping).not.toBeNull()
      await stopping
      await expectFullyStopped(harness, statesAtStop)
    },
  )

  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
    'a stop %i microtasks after the SUBACK of a reconnect leaves nothing behind',
    async (n) => {
      let stopping = null
      let statesAtStop = null
      let created = 0
      let transport
      const harness = setup({
        connect: (url, options) => {
          created += 1
          const client = autoConnect(url, options)
          if (created === 2) {
            client.subscribeAnswer = (cb) => {
              cb(null, [{ topic: UP, qos: 1 }])
              microtasks(n).then(() => {
                statesAtStop = harness.states.length
                stopping = transport.stop()
              })
            }
          }
          return client
        },
      })
      transport = harness.transport
      await transport.start()
      harness.clients[0].dropNow()
      await harness.clock.advance(RECONNECT_MIN_MS + 500)
      await harness.clock.flush()
      expect(harness.clients).toHaveLength(2)
      expect(stopping).not.toBeNull()
      await stopping
      await expectFullyStopped(harness, statesAtStop)
    },
  )

  test('a credential read that hangs during a reconnect counts as a failed attempt and backs off', async () => {
    let hang = false
    const harness = setup({
      credentials: async () => {
        if (hang) await new Promise(() => {})
        return { accessKeyId: 'AKID', secretAccessKey: 'secret' }
      },
    })
    const { transport, clients, clock, states } = harness
    await transport.start()
    hang = true
    clients[0].dropNow()
    await clock.advance(RECONNECT_MIN_MS + 500)
    await clock.flush()
    // The attempt hangs reading the credentials; only its deadline is waiting.
    const [deadline] = clock.timeouts()
    expect(clock.timeouts()).toHaveLength(1)
    expect(deadline).toBeGreaterThan(CONNECT_TIMEOUT_MS - 500)
    expect(deadline).toBeLessThanOrEqual(CONNECT_TIMEOUT_MS)
    await clock.advance(deadline)
    await clock.flush()
    // That attempt gave up; the next one waits a longer backoff.
    const [next] = clock.timeouts()
    expect(next).toBeGreaterThanOrEqual(2 * RECONNECT_MIN_MS)
    expect(next).toBeLessThan(2 * RECONNECT_MIN_MS + 500)
    hang = false
    await clock.advance(next)
    await clock.flush()
    expect(clients).toHaveLength(2)
    expect(states.map((s) => s.state)).toEqual(['lost', 'reconnected'])
    await transport.stop()
    await expectFullyStopped(harness, 2)
  })

  test('a publish callback lost on an old connection does not prevent a later clean disconnect', async () => {
    const { transport, clients, clock } = setup()
    await transport.start()
    clients[0].publishAnswer = () => {}
    transport.publish({ topic: 't', payload: Buffer.from('x') }).catch(() => {})
    await clock.flush()
    // mqtt.js never answers this one: not even ending the client fails it.
    clients[0].waiting.length = 0
    clients[0].dropNow()
    await clock.advance(RECONNECT_MIN_MS + 500)
    await clock.flush()
    expect(clients).toHaveLength(2)
    await transport.stop()
    expect(clients[1].published.map((p) => p.topic)).toEqual([GONE])
    expect(clients[1].ended).toBe(false)
    expect(clock.live()).toBe(0)
  })
})

describe("this machine's AWS IoT Core connection with a real mqtt.js client", () => {
  test('behind a proxy that never answers, a connect gives up at its limit and the process can exit', async () => {
    const transportFile = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../../../../lib/plugins/aws/dev/relay/transport.js',
    )
    // A proxy that accepts every connection and never answers.
    const accepted = new Set()
    const proxy = net.createServer((socket) => {
      accepted.add(socket)
      socket.on('error', () => {})
    })
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    // Its timers end every wait within 300 ms, so the connect gives up at once.
    const script = `
      const { createTransport } = await import(${JSON.stringify(pathToFileURL(transportFile).href)})
      const transport = createTransport({
        endpoint: 'iot.example.com',
        region: 'us-east-1',
        sessionId: 's_0123456789ab',
        credentials: async () => ({ accessKeyId: 'AKID', secretAccessKey: 'secret', sessionToken: 'token' }),
        goneFrame: () => Buffer.from('gone'),
        onMessage: () => {},
        timers: { setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 300)), clearTimeout, setInterval, clearInterval },
        env: { HTTPS_PROXY: process.env.TEST_PROXY },
      })
      const error = await transport.start().then(() => null, (caught) => caught)
      await transport.stop()
      console.log('START ' + (error?.code ?? 'connected'))
    `
    try {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '--eval', script],
        {
          env: {
            PATH: process.env.PATH,
            ...(process.env.SystemRoot && {
              SystemRoot: process.env.SystemRoot,
            }),
            TEST_PROXY: `http://127.0.0.1:${proxy.address().port}`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      )
      let output = ''
      child.stdout.on('data', (chunk) => (output += chunk))
      child.stderr.on('data', (chunk) => (output += chunk))
      // The proxy keeps every connection open until the end of the test: a child still running
      // after 10 s is held open by its connection to the proxy, and is ended.
      const stuck = setTimeout(() => child.kill(), 10_000)
      const code = await new Promise((resolve) =>
        child.on('exit', (exitCode, signal) => resolve(exitCode ?? signal)),
      )
      clearTimeout(stuck)
      expect({ code, output: output.trim() }).toEqual({
        code: 0,
        output: 'START DEV_MODE_IOT_UNREACHABLE',
      })
      expect(accepted.size).toBeGreaterThan(0)
    } finally {
      for (const socket of accepted) socket.destroy()
      await new Promise((resolve) => proxy.close(resolve))
    }
  }, 30_000)

  test("mqtt.js's own debug output (DEBUG=mqttjs*) never carries the signed URL", async () => {
    const transportFile = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../../../../lib/plugins/aws/dev/relay/transport.js',
    )
    // A real mqtt.js client against a port nothing listens on: it builds its WebSocket, logs it,
    // and fails to connect.
    const script = `
      const { createTransport } = await import(${JSON.stringify(pathToFileURL(transportFile).href)})
      const transport = createTransport({
        endpoint: '127.0.0.1:9',
        region: 'us-east-1',
        sessionId: 's_0123456789ab',
        credentials: async () => ({ accessKeyId: 'AKIDDEBUGLEAK', secretAccessKey: 'secret', sessionToken: 'tokendebugleak' }),
        goneFrame: () => Buffer.from('gone'),
        onMessage: () => {},
        timers: { setTimeout, clearTimeout, setInterval, clearInterval },
        env: {},
      })
      const error = await transport.start().then(() => null, (caught) => caught)
      await transport.stop()
      console.log('START ' + (error?.code ?? 'connected'))
    `
    const child = spawn(
      process.execPath,
      ['--input-type=module', '--eval', script],
      {
        // SystemRoot: Windows needs it for a child that opens a TLS connection.
        env: {
          PATH: process.env.PATH,
          ...(process.env.SystemRoot && { SystemRoot: process.env.SystemRoot }),
          DEBUG: 'mqttjs*',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const code = await new Promise((resolve) => child.on('close', resolve))
    expect(code).toBe(0)
    expect(output).toContain('START DEV_MODE_IOT_UNREACHABLE')
    // The debug line names the endpoint without its signature.
    expect(output).toContain(
      'creating new Websocket for url: wss://127.0.0.1:9/mqtt',
    )
    expect(output).not.toMatch(/X-Amz-|AKIDDEBUGLEAK|tokendebugleak/)
  }, 60_000)
})
