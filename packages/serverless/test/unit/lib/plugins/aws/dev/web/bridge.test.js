import { EventEmitter } from 'node:events'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { SignatureV4 } from '@smithy/signature-v4'
import {
  ACCEPT_WINDOW_MS,
  CONNECT_WAIT_MS,
  UPLOAD_WAIT_MS,
  createBridge,
  isWebSocketHandshake,
  readBridgeConfig,
} from '../../../../../../../lib/plugins/aws/dev/web/bridge/server.mjs'
import {
  IDLE_RECONNECT_MS,
  connectMqtt,
  createBrokerCredentials,
  createLink,
  scopeFromRoleArn,
  sessionPolicy,
} from '../../../../../../../lib/plugins/aws/dev/web/bridge/relay.mjs'
import { endToEndHeaders } from '../../../../../../../lib/plugins/aws/dev/web/bridge/http.mjs'
import {
  KIND,
  WEB_BODY_BYTES,
  bridgeClientId,
  createOpener,
  createSealer,
  decodeFrame,
  openRaw,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'
import { WEB_PACING } from '../../../../../../../lib/plugins/aws/dev/relay/pacer.js'
import { Sha256 } from '../../../../../../../lib/plugins/aws/lib/sigv4.js'
import { manualClock } from '../relay/manual-clock.js'

const KEY = Buffer.alloc(32, 7)
const SESSION = 's_0123456789ab'
const ENDPOINT = 'abc123-ats.iot.us-east-1.amazonaws.com'
const FALLBACK_HOST = 'fallback1234.mrc.lambda-web.us-east-1.on.aws'
const BUCKET_HOST = 'deployment-bucket.s3.us-east-1.amazonaws.com'
const BROKER = {
  accessKeyId: 'ASIABROKER',
  secretAccessKey: 'broker-secret',
  sessionToken: 'broker-token',
}
const ENV = Object.freeze({
  AWS_LAMBDA_HTTP_ENDPOINT: '127.0.0.1:8080',
  AWS_REGION: 'us-east-1',
  AWS_ACCOUNT_ID: '123456789012',
  AWS_ACCESS_KEY_ID: 'ASIAEXECUTIONROLE',
  AWS_SECRET_ACCESS_KEY: 'execution-secret',
  AWS_SESSION_TOKEN: 'execution-token',
  SLS_DEV_SESSION: SESSION,
  SLS_DEV_SESSION_KEY: KEY.toString('base64'),
  SLS_DEV_IOT_ENDPOINT: ENDPOINT,
  SLS_DEV_BROKER_ROLE_ARN:
    'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
  SLS_DEV_BROKER_EXTERNAL_ID: 'external-id-1',
  SLS_DEV_OWNER: 'dev',
  SLS_DEV_REVISION_ROLE: 'dev',
  SLS_DEV_FALLBACK_URL: `https://${FALLBACK_HOST}`,
  SLS_DEV_FALLBACK_AUTH: 'IamAuth',
  SLS_DEV_WEB_FUNCTION: 'svc-dev-web',
})
const topics = topicsOf(SESSION)
const T0 = Date.parse('2026-10-27T10:00:00Z')

const bodyOf = (chunks) =>
  (async function* () {
    for (const chunk of chunks) yield Buffer.from(chunk)
  })()

/** Waits, in real time, until `condition()` holds. */
const until = async (condition, what = 'the condition') => {
  for (let i = 0; i < 500; i++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error(`${what} did not happen`)
}

/**
 * The developer's CLI on the other end of AWS IoT Core: opens what the bridge publishes and
 * answers as `behave(frame, cli)` says.
 */
const fakeCli = ({ clock, behave = () => {} }) => {
  const seal = createSealer({ key: KEY })
  const open = createOpener({ key: KEY })
  const cli = {
    connections: [],
    frames: [],
    published: [],
    behave,
    connect: (options) => {
      if (cli.hang) return new Promise(() => {})
      const connection = {
        options,
        ended: false,
        publish: async (topic, payload, publishOptions) => {
          cli.published.push({
            topic,
            bytes: payload.length,
            at: clock.now(),
            options: publishOptions,
          })
          // A socket that no longer reaches AWS IoT Core: the publish never settles.
          if (cli.stall) return new Promise(() => {})
          if (cli.refuse) {
            throw new Error('AWS IoT Core refused the message (135)')
          }
          const frame = open(topic, payload)
          if (!frame) return
          cli.frames.push(frame)
          setImmediate(() => cli.behave(frame, cli))
        },
        end() {
          connection.ended = true
        },
      }
      cli.connections.push(connection)
      return Promise.resolve(connection)
    },
    get env() {
      return cli.frames[0]?.header.env
    },
    send(header, body = Buffer.alloc(0)) {
      const connection = cli.connections.at(-1)
      const topic = topics.down(cli.env)
      connection.options.onMessage(topic, seal(topic, header, body))
    },
    gone() {
      const connection = cli.connections.at(-1)
      connection.options.onMessage(
        topics.gone,
        seal(topics.gone, { kind: KIND.GONE }),
      )
    },
    lose() {
      cli.connections.at(-1).options.onClose()
    },
    requests: () => cli.frames.filter((f) => f.header.kind === KIND.REQUEST),
  }
  return cli
}

/** Answers a request with `status`, `headers` and the body in `pieces`, frame by frame. */
const answer = (cli, id, { status = 200, headers = {}, pieces = [] } = {}) => {
  cli.send({ kind: KIND.ACCEPTED, id })
  cli.send({ kind: KIND.RESPONSE_START, id, status, headers })
  pieces.forEach((piece, n) =>
    cli.send({ kind: KIND.STREAM_DATA, id, n }, Buffer.from(piece)),
  )
  cli.send({ kind: KIND.STREAM_END, id, count: pieces.length })
}

/** S3 (presigned URLs) and the fallback endpoint, as the bridge's HTTP client sees them. */
const fakeNetwork = ({ fallback } = {}) => {
  const objects = new Map()
  const calls = []
  const send = async ({ method, url, headers, body }) => {
    const target = new URL(url)
    calls.push({ method, url: target, headers, body })
    if (target.hostname === BUCKET_HOST) {
      const objectKey = decodeURIComponent(target.pathname.slice(1))
      if (method === 'PUT') {
        objects.set(objectKey, Buffer.from(body))
        return {
          status: 200,
          headers: { 'x-amz-version-id': 'v1' },
          body: bodyOf([]),
        }
      }
      if (method === 'GET') {
        return objects.has(objectKey)
          ? { status: 200, headers: {}, body: bodyOf([objects.get(objectKey)]) }
          : { status: 404, headers: {}, body: bodyOf([]) }
      }
      if (method === 'DELETE') {
        objects.delete(objectKey)
        return { status: 204, headers: {}, body: bodyOf([]) }
      }
    }
    if (target.hostname === FALLBACK_HOST) {
      return (
        fallback?.({ method, url: target, headers, body }) ?? {
          status: 201,
          headers: { 'content-type': 'text/plain', 'x-from': 'deployed' },
          body: bodyOf(['deployed code']),
        }
      )
    }
    throw new Error(`unexpected request to ${target.hostname}`)
  }
  return {
    objects,
    calls,
    send,
    fallbackCalls: () =>
      calls.filter(({ url }) => url.hostname === FALLBACK_HOST),
  }
}

const started = []

const start = async ({ behave, env = ENV, fallback } = {}) => {
  const clock = manualClock(T0)
  const cli = fakeCli({ clock, behave })
  const network = fakeNetwork({ fallback })
  const assumed = []
  const logs = []
  const bridge = createBridge({
    env,
    connect: cli.connect,
    assumeRole: async (params) => {
      assumed.push(params)
      return { ...BROKER, expiration: new Date(clock.now() + 3_600_000) }
    },
    send: network.send,
    now: clock.now,
    timers: clock.timers,
    log: (line) => logs.push(line),
  })
  const server = http.createServer(bridge.handle)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const agent = new http.Agent({ keepAlive: false })
  started.push({ bridge, server, agent })

  /** One request; resolves with the response, its body read whole, and the chunks as they came. */
  const call = (path, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const request = http.request(
        { host: '127.0.0.1', port, path, method, headers, agent },
        (response) => {
          const chunks = []
          response.on('data', (chunk) => {
            chunks.push(chunk)
            call.onChunk?.(chunk)
          })
          response.on('end', () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks),
              chunks,
            }),
          )
          response.on('error', reject)
          response.on('aborted', () => reject(new Error('aborted')))
        },
      )
      request.on('error', reject)
      request.end(body)
      call.current = request
    })
  return { clock, cli, network, assumed, logs, bridge, call }
}

afterEach(async () => {
  for (const { bridge, server, agent } of started.splice(0)) {
    bridge.close()
    agent.destroy()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

describe('the web bridge configuration', () => {
  test('a dev revision with a session relays, with its fallback; without one, nothing is relayed', () => {
    const config = readBridgeConfig(ENV)
    expect(config.listen).toEqual({ host: '127.0.0.1', port: 8080 })
    // A bracketed IPv6 host is listened on without its brackets.
    expect(
      readBridgeConfig({ ...ENV, AWS_LAMBDA_HTTP_ENDPOINT: '[::1]:9001' })
        .listen,
    ).toEqual({ host: '::1', port: 9001 })
    expect(config.fallbackUrl).toBe(`https://${FALLBACK_HOST}`)
    expect(config.fallbackAuth).toBe('IamAuth')
    expect(
      readBridgeConfig({ ...ENV, SLS_DEV_FALLBACK_AUTH: 'ApplicationManaged' })
        .fallbackAuth,
    ).toBe('ApplicationManaged')
    // Anything else is signed for.
    expect(
      readBridgeConfig({ ...ENV, SLS_DEV_FALLBACK_AUTH: 'other' }).fallbackAuth,
    ).toBe('IamAuth')
    expect(config.relay).toMatchObject({
      session: SESSION,
      functionName: 'svc-dev-web',
      region: 'us-east-1',
      iotEndpoint: ENDPOINT,
    })
    expect(config.relay.key.equals(KEY)).toBe(true)
    expect(config.relay.environmentId).toMatch(/^e[0-9a-f]{12}$/)

    const incomplete = readBridgeConfig({ ...ENV, SLS_DEV_SESSION_KEY: '' })
    expect(incomplete.relay).toBeNull()
    expect(incomplete.reason).toBe(
      'the Dev Mode session is incomplete (SLS_DEV_SESSION_KEY missing)',
    )
    expect(incomplete.reason).not.toContain(ENV.SLS_DEV_BROKER_EXTERNAL_ID)
    const localOnly = readBridgeConfig({ ...ENV, SLS_DEV_FALLBACK_URL: '' })
    expect(localOnly.fallbackUrl).toBeNull()
    expect(localOnly.relay).not.toBeNull()
  })

  test('the session policy narrows the broker to this environment, as the functions bridge does, and to an IamAuth fallback endpoint', () => {
    const scope = scopeFromRoleArn({
      roleArn: 'arn:aws:iam::123456789012:role/b',
      region: 'us-east-1',
      session: SESSION,
      environment: 'e0123456789ab',
      functionName: 'svc-dev-web',
      invokeFallback: true,
    })
    const iot = 'arn:aws:iot:us-east-1:123456789012:'
    expect(sessionPolicy(scope)).toBe(
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'iot:Connect',
            Resource: `${iot}client/sls-dev-s_0123456789ab-e0123456789ab`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            Resource: `${iot}topic/sls-dev/s_0123456789ab/up`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Subscribe',
            Resource: [
              `${iot}topicfilter/sls-dev/s_0123456789ab/down/e0123456789ab`,
              `${iot}topicfilter/sls-dev/s_0123456789ab/gone`,
            ],
          },
          {
            Effect: 'Allow',
            Action: 'iot:Receive',
            Resource: [
              `${iot}topic/sls-dev/s_0123456789ab/down/e0123456789ab`,
              `${iot}topic/sls-dev/s_0123456789ab/gone`,
            ],
          },
          {
            Effect: 'Allow',
            Action: 'iot:SendDirectMessage',
            Resource: `${iot}client/sls-dev-s_0123456789ab-cli`,
            Condition: {
              StringEquals: { 'iot:Topic': 'sls-dev/s_0123456789ab/ping' },
            },
          },
          {
            Effect: 'Allow',
            Action: 'lambda:InvokeWebFunctionEndpoint',
            Resource:
              'arn:aws:lambda:us-east-1:123456789012:web-function/svc-dev-web/endpoint/sls-dev-fallback',
          },
        ],
      }),
    )
    expect(sessionPolicy(scope).length).toBeLessThanOrEqual(2048)
    // An unsigned (ApplicationManaged) fallback needs no permission: the IoT statements alone.
    const unsigned = JSON.parse(
      sessionPolicy({ ...scope, invokeFallback: false }),
    ).Statement
    expect(unsigned.map(({ Action }) => Action)).toEqual([
      'iot:Connect',
      'iot:Publish',
      'iot:Subscribe',
      'iot:Receive',
      'iot:SendDirectMessage',
    ])
    for (const bad of [
      { roleArn: 'arn:aws:iam::123456789012:user/b' },
      { roleArn: 'arn:aws:iam::12345:role/b' },
      { session: 's_*' },
      { environment: 'e/1' },
      { region: 'us-east-1*' },
    ]) {
      expect(() =>
        scopeFromRoleArn({
          roleArn: 'arn:aws:iam::123456789012:role/b',
          region: 'us-east-1',
          session: SESSION,
          environment: 'e1',
          ...bad,
        }),
      ).toThrow()
    }
  })

  test('broker credentials are assumed once with the ExternalId and the policy, and replaced before they expire', async () => {
    const clock = manualClock(T0)
    const calls = []
    const scope = scopeFromRoleArn({
      roleArn: ENV.SLS_DEV_BROKER_ROLE_ARN,
      region: 'us-east-1',
      session: SESSION,
      environment: 'e1',
      functionName: 'svc-dev-web',
    })
    const credentials = createBrokerCredentials({
      assumeRole: async (params) => {
        calls.push(params)
        return { ...BROKER, expiration: new Date(clock.now() + 3_600_000) }
      },
      roleArn: ENV.SLS_DEV_BROKER_ROLE_ARN,
      externalId: 'external-id-1',
      scope,
      now: clock.now,
    })
    await Promise.all([credentials(), credentials()])
    expect(calls).toEqual([
      {
        RoleArn: ENV.SLS_DEV_BROKER_ROLE_ARN,
        RoleSessionName: 'sls-dev-e1',
        ExternalId: 'external-id-1',
        Policy: sessionPolicy(scope),
        DurationSeconds: 3600,
      },
    ])
    await clock.advance(54 * 60_000)
    await credentials()
    expect(calls).toHaveLength(1)
    await clock.advance(60_001)
    await credentials()
    expect(calls).toHaveLength(2)
  })

  test('hop-by-hop headers, and the headers the Connection header names, are dropped', () => {
    expect(
      endToEndHeaders({
        connection: 'keep-alive, X-Private',
        'keep-alive': 'timeout=5',
        'proxy-connection': 'keep-alive',
        'transfer-encoding': 'chunked',
        te: 'trailers',
        trailer: 'x-t',
        upgrade: 'h2c',
        'proxy-authenticate': 'Basic',
        'proxy-authorization': 'Basic x',
        'x-private': '1',
        'x-kept': 'yes',
        'set-cookie': ['a=1', 'b=2'],
      }),
    ).toEqual({ 'x-kept': 'yes', 'set-cookie': ['a=1', 'b=2'] })
  })
})

describe('the MQTT connection of the web bridge', () => {
  /** An mqtt.js client stand-in: records what it is asked and answers as `answers` says. */
  const fakeMqtt = (answers = {}) => {
    const calls = {
      options: null,
      sockets: [],
      subscribed: null,
      published: [],
    }
    const client = new EventEmitter()
    client.subscribe = (topics, options, done) => {
      calls.subscribed = { topics, options }
      done(
        answers.subscribeError ?? null,
        answers.granted ?? topics.map(() => ({ qos: 1 })),
      )
    }
    client.publish = (topic, payload, options, done) => {
      calls.published.push({ topic, options })
      done(null, { reasonCode: answers.publishCode ?? 0 })
    }
    client.end = () => setImmediate(() => client.emit('close'))
    const connect = (url, options) => {
      calls.url = url
      calls.options = options
      options.createWebsocket('wss://unsigned', ['mqtt'], {
        wsOptions: { a: 1 },
      })
      setImmediate(() =>
        answers.fail
          ? client.emit('error', answers.fail)
          : client.emit('connect'),
      )
      return client
    }
    return { calls, client, connect }
  }

  const open = (fake, extra = {}) =>
    connectMqtt({
      url: 'wss://endpoint/mqtt?X-Amz-Signature=signed',
      endpoint: 'endpoint',
      clientId: 'sls-dev-s_1-e1',
      subscriptions: ['down', 'gone'],
      onMessage: () => {},
      onClose: () => {},
      connect: fake.connect,
      createWebSocket: (url, protocols, options) =>
        fake.calls.sockets.push({ url, protocols, options }),
      ...extra,
    })

  test('connects with MQTT 5 over the signed WebSocket, subscribes with QoS 1 and publishes with QoS 1 and an expiry', async () => {
    const fake = fakeMqtt()
    const closes = []
    const connection = await open(fake, { onClose: () => closes.push(1) })
    expect(fake.calls.url).toBe('wss://endpoint/mqtt')
    expect(fake.calls.options).toMatchObject({
      protocolVersion: 5,
      clientId: 'sls-dev-s_1-e1',
      reconnectPeriod: 0,
    })
    expect(fake.calls.sockets).toEqual([
      {
        url: 'wss://endpoint/mqtt?X-Amz-Signature=signed',
        protocols: ['mqtt'],
        options: { a: 1 },
      },
    ])
    expect(fake.calls.subscribed).toEqual({
      topics: ['down', 'gone'],
      options: { qos: 1 },
    })
    await connection.publish('up', Buffer.from('x'), { expirySeconds: 3 })
    expect(fake.calls.published).toEqual([
      {
        topic: 'up',
        options: { qos: 1, properties: { messageExpiryInterval: 3 } },
      },
    ])
    connection.end()
    await new Promise((resolve) => setImmediate(resolve))
    fake.client.emit('close')
    expect(closes).toEqual([1])
  })

  test('a refused subscription or publish is an error that holds no URL', async () => {
    await expect(
      open(fakeMqtt({ granted: [{ qos: 1 }, { qos: 135 }] })),
    ).rejects.toThrow('subscribing was refused (135)')
    const connection = await open(fakeMqtt({ publishCode: 135 }))
    await expect(connection.publish('up', Buffer.from('x'))).rejects.toThrow(
      'AWS IoT Core refused the message (135)',
    )
    const opening = open(
      fakeMqtt({
        fail: new Error('failed wss://endpoint/mqtt?X-Amz-Signature=signed'),
      }),
    )
    const error = await opening.catch((caught) => caught)
    expect(error.message).toBe('failed <url>')
  })
})

describe('the web bridge', () => {
  test('request round-trips method, path, headers, body', async () => {
    const { cli, call, assumed } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        answer(cli, frame.header.id, {
          status: 207,
          headers: {
            'content-type': 'text/plain',
            'x-answer': 'local',
            'set-cookie': ['a=1', 'b=2'],
            upgrade: 'h2c',
            'keep-alive': 'timeout=99',
          },
          pieces: ['from ', 'the machine'],
        })
      },
    })
    const response = await call('/orders/7?expand=items', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-custom': 'yes',
        connection: 'keep-alive, x-hop',
        'x-hop': 'dropped',
        te: 'trailers',
      },
      body: '{"qty":2}',
    })
    expect(response.status).toBe(207)
    expect(response.headers['x-answer']).toBe('local')
    expect(response.headers['set-cookie']).toEqual(['a=1', 'b=2'])
    expect(response.headers.upgrade).toBeUndefined()
    expect(response.headers['keep-alive']).not.toBe('timeout=99')
    expect(response.body.toString()).toBe('from the machine')

    const [request] = cli.requests()
    expect(request.header).toEqual({
      kind: 'request',
      env: expect.stringMatching(/^e[0-9a-f]{12}$/),
      fn: 'svc-dev-web',
      id: expect.any(String),
      sentAt: T0,
      method: 'POST',
      path: '/orders/7?expand=items',
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'x-custom': 'yes',
        host: expect.stringMatching(/^127\.0\.0\.1:/),
      }),
      environment: {
        AWS_ACCESS_KEY_ID: 'ASIAEXECUTIONROLE',
        AWS_SECRET_ACCESS_KEY: 'execution-secret',
        AWS_SESSION_TOKEN: 'execution-token',
      },
    })
    for (const hop of ['connection', 'x-hop', 'te', 'transfer-encoding']) {
      expect(request.header.headers).not.toHaveProperty(hop)
    }
    expect(request.body.toString()).toBe('{"qty":2}')

    // One connection, as this environment's own client, on its own topics.
    expect(cli.connections).toHaveLength(1)
    const { options } = cli.connections[0]
    expect(options.clientId).toBe(bridgeClientId(SESSION, request.header.env))
    expect(options.subscriptions).toEqual([
      topics.down(request.header.env),
      topics.gone,
    ])
    const url = new URL(options.url)
    expect([url.protocol, url.host, url.pathname]).toEqual([
      'wss:',
      ENDPOINT,
      '/mqtt',
    ])
    expect(url.searchParams.get('X-Amz-Security-Token')).toBe('broker-token')
    expect(assumed).toEqual([
      expect.objectContaining({
        RoleArn: ENV.SLS_DEV_BROKER_ROLE_ARN,
        RoleSessionName: `sls-dev-${request.header.env}`,
        ExternalId: 'external-id-1',
      }),
    ])
    expect(JSON.parse(assumed[0].Policy).Statement[0].Resource).toContain(
      `client/sls-dev-${SESSION}-${request.header.env}`,
    )
  })

  test('response frames are written in order and the stream ends', async () => {
    const { call } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        const { id } = frame.header
        // AWS IoT Core neither orders nor deduplicates: data overtakes its start, copies repeat.
        cli.send({ kind: KIND.STREAM_DATA, id, n: 2 }, Buffer.from('c'))
        cli.send({ kind: KIND.ACCEPTED, id })
        cli.send({ kind: KIND.STREAM_DATA, id, n: 0 }, Buffer.from('a'))
        cli.send({
          kind: KIND.RESPONSE_START,
          id,
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
        cli.send({ kind: KIND.STREAM_END, id, count: 4 })
        cli.send({ kind: KIND.STREAM_DATA, id, n: 0 }, Buffer.from('a'))
        cli.send({ kind: KIND.STREAM_DATA, id, n: 3 }, Buffer.from('d'))
        cli.send({ kind: KIND.STREAM_DATA, id, n: 1 }, Buffer.from('b'))
      },
    })
    const response = await call('/letters')
    expect(response.status).toBe(200)
    expect(response.body.toString()).toBe('abcd')
  })

  test('text/event-stream responses are written as frames arrive', async () => {
    let id
    const { cli, call } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        id = frame.header.id
        cli.send({ kind: KIND.ACCEPTED, id })
        cli.send({
          kind: KIND.RESPONSE_START,
          id,
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
        cli.send(
          { kind: KIND.STREAM_DATA, id, n: 0 },
          Buffer.from('data: 1\n\n'),
        )
      },
    })
    const seen = []
    call.onChunk = (chunk) => seen.push(chunk.toString())
    const response = call('/events')
    await until(() => seen.join('') === 'data: 1\n\n', 'the first event')
    cli.send({ kind: KIND.STREAM_DATA, id, n: 1 }, Buffer.from('data: 2\n\n'))
    await until(() => seen.length === 2, 'the second event')
    cli.send({ kind: KIND.STREAM_END, id, count: 2 })
    const done = await response
    expect(done.headers['content-type']).toBe('text/event-stream')
    expect(done.body.toString()).toBe('data: 1\n\ndata: 2\n\n')
  })

  test('no accepted within 3000 ms → forwards to the fallback URL, signed, and returns its response', async () => {
    expect(ACCEPT_WINDOW_MS).toBe(3000)
    // The machine is asleep: AWS IoT Core takes the request, nobody answers.
    const { clock, cli, network, call, logs } = await start()
    const response = call('/checkout?step=2', {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
        'x-custom': 'yes',
        'x-forwarded-proto': 'https',
        'lambda-web-request-id': 'req-1',
        'lambda-web-endpoint-name': 'main',
      },
      body: 'cart',
    })
    await until(() => cli.requests().length === 1, 'the request frame')
    await clock.advance(ACCEPT_WINDOW_MS - 1)
    expect(network.fallbackCalls()).toHaveLength(0)
    await clock.advance(1)
    const done = await response
    expect(done.status).toBe(201)
    expect(done.headers['x-from']).toBe('deployed')
    expect(done.body.toString()).toBe('deployed code')

    const [forward] = network.fallbackCalls()
    expect(forward.method).toBe('PUT')
    expect(forward.url.pathname + forward.url.search).toBe('/checkout?step=2')
    expect(Buffer.from(forward.body).toString()).toBe('cart')
    expect(forward.headers.host).toBe(FALLBACK_HOST)
    expect(forward.headers['x-custom']).toBe('yes')
    expect(forward.headers['x-forwarded-proto']).toBe('https')
    expect(forward.headers).not.toHaveProperty('lambda-web-request-id')
    expect(forward.headers).not.toHaveProperty('lambda-web-endpoint-name')
    expect(forward.headers['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD')
    expect(forward.headers['x-forwarded-host']).toMatch(/^127\.0\.0\.1:/)
    expect(forward.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=ASIABROKER\/\d{8}\/us-east-1\/lambda\/aws4_request, SignedHeaders=[a-z0-9;-]*host[a-z0-9;-]*, Signature=[0-9a-f]{64}$/,
    )
    expect(forward.headers['x-amz-security-token']).toBe('broker-token')
    // The signature is the one SigV4 gives for what was sent: method, host, path, query and body.
    const [, date, time] = /^(\d{8})T(\d{6})Z$/.exec(
      forward.headers['x-amz-date'],
    )
    const signingDate = new Date(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4)}Z`,
    )
    const resigned = await new SignatureV4({
      service: 'lambda',
      region: 'us-east-1',
      sha256: Sha256,
      credentials: BROKER,
    }).sign(
      {
        method: 'PUT',
        protocol: 'https:',
        hostname: FALLBACK_HOST,
        path: forward.url.pathname,
        query: Object.fromEntries(forward.url.searchParams),
        headers: {
          host: forward.headers.host,
          'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        },
        body: Buffer.from(forward.body),
      },
      { signingDate },
    )
    expect(forward.headers.authorization).toBe(resigned.headers.authorization)
    expect(forward.headers['x-amz-content-sha256']).toBe(
      resigned.headers['x-amz-content-sha256'],
    )
    expect(logs.join('\n')).toMatch(/not accepted within 3000 ms/)
    expect(logs.join('\n')).not.toMatch(/broker-token|broker-secret/)

    // An acceptance that comes after the window is logged and changes nothing.
    cli.send({ kind: KIND.ACCEPTED, id: cli.requests()[0].header.id })
    expect(logs.join('\n')).toMatch(
      /accepted after it had gone to the deployed code/,
    )
  })

  test("an ApplicationManaged fallback gets the request unsigned, with the app's own Authorization", async () => {
    const { clock, cli, network, call, assumed } = await start({
      env: { ...ENV, SLS_DEV_FALLBACK_AUTH: 'ApplicationManaged' },
    })
    const response = call('/me?x=1&x=2', {
      method: 'POST',
      headers: {
        authorization: 'Bearer app-token',
        'x-forwarded-for': '203.0.113.7',
        'lambda-web-request-id': 'req-1',
      },
      body: 'hello',
    })
    await until(() => cli.requests().length === 1, 'the request frame')
    await clock.advance(ACCEPT_WINDOW_MS)
    expect((await response).status).toBe(201)
    const [forward] = network.fallbackCalls()
    expect(forward.url.href).toBe(`https://${FALLBACK_HOST}/me?x=1&x=2`)
    expect(forward.headers.authorization).toBe('Bearer app-token')
    expect(forward.headers.host).toBe(FALLBACK_HOST)
    expect(forward.headers['x-forwarded-for']).toBe('203.0.113.7')
    expect(forward.headers['x-forwarded-host']).toMatch(/^127\.0\.0\.1:/)
    expect(Buffer.from(forward.body).toString()).toBe('hello')
    expect(
      Object.keys(forward.headers).filter((name) =>
        /^(x-amz-|lambda-web-)/.test(name),
      ),
    ).toEqual([])
    // The broker session gets no permission it does not use.
    expect(assumed[0].Policy).not.toContain('lambda:InvokeWebFunctionEndpoint')
  })

  test('an IamAuth fallback is signed in its headers, whatever Authorization the request carried', async () => {
    const { clock, cli, network, call, assumed } = await start()
    const response = call('/me', {
      headers: { authorization: 'Bearer stale' },
    })
    await until(() => cli.requests().length === 1, 'the request frame')
    await clock.advance(ACCEPT_WINDOW_MS)
    expect((await response).status).toBe(201)
    const [forward] = network.fallbackCalls()
    expect(forward.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=ASIABROKER\//,
    )
    expect(forward.url.search).toBe('')
    expect(JSON.parse(assumed[0].Policy).Statement.at(-1)).toEqual({
      Effect: 'Allow',
      Action: 'lambda:InvokeWebFunctionEndpoint',
      Resource:
        'arn:aws:lambda:us-east-1:123456789012:web-function/svc-dev-web/endpoint/sls-dev-fallback',
    })
  })

  test('a machine that is gone, or says the request is not its, sends it to the fallback at once', async () => {
    const gone = await start({
      behave: (frame, cli) => {
        if (frame.header.kind === KIND.REQUEST) cli.gone()
      },
    })
    expect((await gone.call('/a')).status).toBe(201)
    expect(gone.clock.now()).toBe(T0)

    const notInDev = await start({
      behave: (frame, cli) => {
        if (frame.header.kind === KIND.REQUEST) {
          cli.send({ kind: KIND.NOT_IN_DEV, id: frame.header.id })
        }
      },
    })
    expect((await notInDev.call('/b')).status).toBe(201)
    expect(notInDev.clock.now()).toBe(T0)
  })

  test('a WebSocket handshake is answered 426 by the bridge: neither the machine nor the deployed code gets it', async () => {
    const { cli, network, call } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind === KIND.REQUEST) cli.gone()
      },
    })
    // A web function passes `sec-websocket-*` on; `upgrade` and `connection` may not reach it.
    const byKey = await call('/_hmr?id=1', {
      headers: {
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    })
    expect(byKey.status).toBe(426)
    expect(byKey.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(byKey.body.toString()).toMatch(/local URL of serverless dev/)
    const byUpgrade = await call('/socket', {
      headers: { connection: 'Upgrade', upgrade: 'WebSocket' },
    })
    expect(byUpgrade.status).toBe(426)
    expect(cli.requests()).toHaveLength(0)
    expect(network.fallbackCalls()).toHaveLength(0)
    // Other requests are still offered to the machine (gone here, so the deployed code answers).
    expect((await call('/a')).status).toBe(201)
    expect(cli.requests()).toHaveLength(1)
  })

  test('without a session a WebSocket handshake is still answered 426, not sent to the deployed code', async () => {
    const { network, call } = await start({
      env: { ...ENV, SLS_DEV_SESSION: '' },
    })
    const response = await call('/ws', {
      headers: { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' },
    })
    expect(response.status).toBe(426)
    expect(network.fallbackCalls()).toHaveLength(0)
  })

  test.each([
    [{ 'sec-websocket-key': 'abc' }, true],
    [{ upgrade: 'websocket' }, true],
    [{ upgrade: 'h2c, WebSocket' }, true],
    [{ upgrade: 'h2c' }, false],
    [{ 'sec-websocket-version': '13' }, false],
    [{}, false],
  ])('isWebSocketHandshake(%j) is %s', (headers, expected) => {
    expect(isWebSocketHandshake(headers)).toBe(expected)
  })

  test('a connection to AWS IoT Core that never comes up sends requests to the fallback within the wait', async () => {
    expect(CONNECT_WAIT_MS).toBe(3000)
    const { clock, cli, network, call } = await start()
    cli.hang = true
    const response = call('/slow')
    await until(
      () => network.calls.length === 0 && clock.live() > 0,
      'the wait',
    )
    await clock.advance(CONNECT_WAIT_MS - 1)
    expect(network.fallbackCalls()).toHaveLength(0)
    await clock.advance(1)
    expect((await response).status).toBe(201)
  })

  test('without a fallback (a local-only web app), a request nobody took is answered 503', async () => {
    const { clock, cli, call } = await start({
      env: { ...ENV, SLS_DEV_FALLBACK_URL: '' },
    })
    const response = call('/x')
    await until(() => cli.requests().length === 1, 'the request frame')
    await clock.advance(ACCEPT_WINDOW_MS)
    const done = await response
    expect(done.status).toBe(503)
    expect(done.body.toString()).not.toMatch(/https?:|token|secret/)
  })

  test('after acceptance, a dropped connection ends the request instead of leaving it open', async () => {
    const before = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        cli.send({ kind: KIND.ACCEPTED, id: frame.header.id })
        setImmediate(() => cli.lose())
      },
    })
    expect((await before.call('/a')).status).toBe(502)

    const during = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        const { id } = frame.header
        cli.send({ kind: KIND.ACCEPTED, id })
        cli.send({ kind: KIND.RESPONSE_START, id, status: 200, headers: {} })
        cli.send({ kind: KIND.STREAM_DATA, id, n: 0 }, Buffer.from('part'))
        setImmediate(() => cli.gone())
      },
    })
    await expect(during.call('/b')).rejects.toThrow()
  })

  test('request body of 200 KiB goes through upload_url and arrives byte-identical', async () => {
    const payload = randomBytes(200 * 1024)
    let objectKey
    const { cli, network, call } = await start({
      behave: (frame, cli) => {
        const { kind, id } = frame.header
        if (kind === KIND.UPLOAD_URL_REQUEST) {
          objectKey = `serverless-dev-mode/svc/dev/${SESSION}/${'a'.repeat(32)}`
          cli.send({
            kind: KIND.UPLOAD_URL,
            id,
            upload: {
              url: `https://${BUCKET_HOST}/${objectKey}?X-Amz-Signature=abc`,
              headers: { 'x-amz-server-side-encryption': 'aws:kms' },
              key: objectKey,
              ttlMs: 900_000,
            },
          })
        }
        if (kind === KIND.REQUEST) answer(cli, id, { pieces: ['stored'] })
      },
    })
    const response = await call('/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: payload,
    })
    expect(response.body.toString()).toBe('stored')

    const [askForUrl] = cli.frames
    expect(askForUrl.header).toEqual({
      kind: 'upload_url_request',
      env: cli.env,
      id: expect.any(String),
    })
    const [request] = cli.requests()
    expect(request.header.id).toBe(askForUrl.header.id)
    expect(request.header.s3).toEqual({ key: objectKey, versionId: 'v1' })
    expect(request.body).toHaveLength(0)

    const put = network.calls.find((c) => c.method === 'PUT')
    expect(put.headers['x-amz-server-side-encryption']).toBe('aws:kms')
    const opened = openRaw({
      key: KEY,
      topic: `s3/${objectKey}`,
      message: network.objects.get(objectKey),
    })
    const frame = decodeFrame(opened.plaintext)
    expect(frame.header.kind).toBe('payload')
    expect(frame.body.equals(payload)).toBe(true)
  })

  test('a large body whose upload URL request is never acknowledged reaches the fallback at the upload wait', async () => {
    const { clock, cli, network, call, logs } = await start()
    // The socket is half dead: publishes go out and never settle.
    cli.stall = true
    const response = call('/upload', {
      method: 'POST',
      body: randomBytes(200 * 1024),
    })
    await until(() => cli.published.length === 1, 'the upload URL request')
    await clock.advance(UPLOAD_WAIT_MS - 1)
    expect(network.fallbackCalls()).toHaveLength(0)
    await clock.advance(1)
    const done = await response
    expect(done.status).toBe(201)
    expect(network.fallbackCalls()).toHaveLength(1)
    expect(Buffer.from(network.fallbackCalls()[0].body)).toHaveLength(
      200 * 1024,
    )
    expect(cli.connections[0].ended).toBe(true)
    expect(logs.join('\n')).toMatch(
      /asking for an upload URL was not acknowledged within 2000 ms/,
    )
  })

  test('need_environment for a request whose body went through S3 sends it to the fallback', async () => {
    const objectKey = `serverless-dev-mode/svc/dev/${SESSION}/${'d'.repeat(32)}`
    const { clock, cli, network, call } = await start({
      behave: (frame, cli) => {
        const { kind, id } = frame.header
        if (kind === KIND.UPLOAD_URL_REQUEST) {
          cli.send({
            kind: KIND.UPLOAD_URL,
            id,
            upload: {
              url: `https://${BUCKET_HOST}/${objectKey}`,
              key: objectKey,
              ttlMs: 900_000,
            },
          })
        }
        if (kind === KIND.REQUEST) {
          cli.send({ kind: KIND.NEED_ENVIRONMENT, id })
        }
      },
    })
    const done = await call('/upload', {
      method: 'POST',
      body: randomBytes(100 * 1024),
    })
    expect(done.status).toBe(201)
    expect(clock.now()).toBe(T0)
    expect(cli.requests()).toHaveLength(1)
    expect(network.fallbackCalls()).toHaveLength(1)
  })

  test('a request AWS IoT Core refuses to take goes to the fallback at once', async () => {
    const { clock, cli, network, call, logs } = await start()
    cli.refuse = true
    expect((await call('/refused')).status).toBe(201)
    expect(clock.now()).toBe(T0)
    expect(network.fallbackCalls()).toHaveLength(1)
    expect(logs.join('\n')).toMatch(/publishing it to AWS IoT Core failed/)
  })

  test('a caller that leaves before acceptance gets nothing sent to the fallback, and a late acceptance says so', async () => {
    const { cli, network, call, logs } = await start()
    call('/gone-caller').catch(() => {})
    await until(() => cli.requests().length === 1, 'the request frame')
    call.current.destroy()
    await until(
      () => logs.some((line) => /abandoned by its caller/.test(line)),
      'the abandon',
    )
    cli.send({ kind: KIND.ACCEPTED, id: cli.requests()[0].header.id })
    expect(network.fallbackCalls()).toHaveLength(0)
    const text = logs.join('\n')
    expect(text).toMatch(/was accepted after its caller had left/)
    expect(text).not.toMatch(/gone to the deployed code/)
  })

  test('a caller that leaves during the fallback answer ends the answer of the deployed code', async () => {
    const upstream = new Readable({ read() {} })
    upstream.push('first part')
    const { clock, cli, call } = await start({
      fallback: () => ({ status: 200, headers: {}, body: upstream }),
    })
    const seen = []
    call.onChunk = (chunk) => seen.push(chunk)
    call('/stream').catch(() => {})
    await until(() => cli.requests().length === 1, 'the request frame')
    await clock.advance(ACCEPT_WINDOW_MS)
    await until(() => seen.length === 1, 'the first part')
    call.current.destroy()
    await until(() => upstream.destroyed, 'the upstream answer to end')
  })

  test('an accepted request with no frame for 300 s still gets its response when it arrives', async () => {
    let id
    const { clock, cli, call, logs } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        id = frame.header.id
        cli.send({ kind: KIND.ACCEPTED, id })
      },
    })
    let settled = false
    const response = call('/breakpoint').finally(() => (settled = true))
    await until(() => id, 'the acceptance')
    // A breakpoint on the machine, or a slow first render: nothing for five minutes.
    await clock.advance(300_000)
    await clock.flush()
    expect(settled).toBe(false)
    expect(clock.live()).toBe(0)
    answer(cli, id, { status: 200, pieces: ['at last'] })
    const done = await response
    expect(done.status).toBe(200)
    expect(done.body.toString()).toBe('at last')
    expect(logs.join('\n')).not.toMatch(/504|did not start/)
  })

  test('a function name the policy cannot use is logged, and the policy covers any web function', async () => {
    const { assumed, cli, call, logs } = await start({
      env: { ...ENV, SLS_DEV_WEB_FUNCTION: '' },
      behave: (frame, cli) => {
        if (frame.header.kind === KIND.REQUEST) answer(cli, frame.header.id)
      },
    })
    await call('/x')
    expect(logs.join('\n')).toMatch(
      /SLS_DEV_WEB_FUNCTION is missing or not a function name/,
    )
    expect(JSON.parse(assumed[0].Policy).Statement.at(-1).Resource).toBe(
      'arn:aws:lambda:us-east-1:123456789012:web-function/*/endpoint/sls-dev-fallback',
    )
    expect(cli.requests()[0].header.fn).toBe('')
  })

  test('a request body of exactly 64 KiB goes inline', async () => {
    const payload = randomBytes(WEB_BODY_BYTES)
    const { cli, call } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind === KIND.REQUEST) answer(cli, frame.header.id)
      },
    })
    await call('/inline', { method: 'POST', body: payload })
    expect(cli.frames.map((f) => f.header.kind)).toEqual(['request'])
    expect(cli.requests()[0].body.equals(payload)).toBe(true)
  })

  test('a 2 MB response through S3 arrives byte-identical, and each object is deleted after it is read', async () => {
    const seal = createSealer({ key: KEY })
    const head = Buffer.from('head:')
    const middle = randomBytes(1024 * 1024)
    const tail = randomBytes(1024 * 1024)
    let network
    const store = (name, body) => {
      const objectKey = `serverless-dev-mode/svc/dev/${SESSION}/${name.repeat(32)}`
      network.objects.set(
        objectKey,
        seal(`s3/${objectKey}`, { kind: KIND.PAYLOAD }, body),
      )
      return {
        key: objectKey,
        get: `https://${BUCKET_HOST}/${objectKey}?X-Amz-Signature=get`,
        delete: `https://${BUCKET_HOST}/${objectKey}?X-Amz-Signature=del`,
      }
    }
    const started = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        const { id } = frame.header
        cli.send({ kind: KIND.ACCEPTED, id })
        cli.send({
          kind: KIND.RESPONSE_START,
          id,
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
        cli.send({ kind: KIND.STREAM_DATA, id, n: 0 }, head)
        cli.send({ kind: KIND.STREAM_DATA, id, n: 1, s3: store('b', middle) })
        cli.send({ kind: KIND.STREAM_END, id, count: 2, s3: store('c', tail) })
      },
    })
    network = started.network
    const response = await started.call('/big')
    expect(response.body.equals(Buffer.concat([head, middle, tail]))).toBe(true)
    expect(network.objects.size).toBe(0)
    expect(network.calls.filter((c) => c.method === 'DELETE')).toHaveLength(2)
  })

  test('environment is sent on first request and on need_environment', async () => {
    let asked = false
    const { clock, cli, call } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        if (frame.header.path === '/third' && !asked) {
          asked = true
          clock.advance(400)
          cli.send({ kind: KIND.NEED_ENVIRONMENT, id: frame.header.id })
          return
        }
        answer(cli, frame.header.id, { pieces: [frame.header.path] })
      },
    })
    expect((await call('/first')).body.toString()).toBe('/first')
    expect((await call('/second')).body.toString()).toBe('/second')
    expect((await call('/third')).body.toString()).toBe('/third')
    const environment = {
      AWS_ACCESS_KEY_ID: 'ASIAEXECUTIONROLE',
      AWS_SECRET_ACCESS_KEY: 'execution-secret',
      AWS_SESSION_TOKEN: 'execution-token',
    }
    const sent = cli
      .requests()
      .map((f) => [f.header.path, f.header.environment, f.header.sentAt])
    expect(sent).toEqual([
      ['/first', environment, T0],
      ['/second', undefined, T0],
      ['/third', undefined, T0],
      ['/third', environment, T0 + 400],
    ])
    const ids = cli.requests().map((f) => f.header.id)
    expect(ids[3]).toBe(ids[2])
  })

  test('a connection idle for longer than the idle limit is replaced, and the environment is sent again on the new one', async () => {
    const { clock, cli, call } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind === KIND.REQUEST) answer(cli, frame.header.id)
      },
    })
    await call('/first')
    await clock.advance(IDLE_RECONNECT_MS + 1)
    await call('/second')
    expect(cli.connections).toHaveLength(2)
    expect(cli.connections[0].ended).toBe(true)
    expect(cli.requests().map((f) => Boolean(f.header.environment))).toEqual([
      true,
      true,
    ])
  })

  test('a response still streaming keeps its connection past the idle limit', async () => {
    let streamId
    const { clock, cli, call } = await start({
      behave: (frame, cli) => {
        if (frame.header.kind !== KIND.REQUEST) return
        if (frame.header.path === '/events') {
          streamId = frame.header.id
          cli.send({ kind: KIND.ACCEPTED, id: streamId })
          cli.send({
            kind: KIND.RESPONSE_START,
            id: streamId,
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
          return
        }
        answer(cli, frame.header.id, { pieces: ['ok'] })
      },
    })
    const events = call('/events')
    await until(() => streamId, 'the stream')
    await clock.advance(IDLE_RECONNECT_MS + 1)
    expect((await call('/other')).body.toString()).toBe('ok')
    expect(cli.connections).toHaveLength(1)
    cli.send({ kind: KIND.STREAM_DATA, id: streamId, n: 0 }, Buffer.from('x'))
    cli.send({ kind: KIND.STREAM_END, id: streamId, count: 1 })
    expect((await events).body.toString()).toBe('x')
  })

  test('pacer limits 2 MB of request frames on one connection to the web profile', async () => {
    expect(WEB_PACING).toEqual({
      messagesPerSecond: 45,
      bytesPerSecond: 400 * 1024,
      byteBurst: 128 * 1024,
    })
    const clock = manualClock(T0)
    const cli = fakeCli({ clock })
    const link = createLink({
      sessionId: SESSION,
      key: KEY,
      environmentId: 'e1',
      endpoint: ENDPOINT,
      region: 'us-east-1',
      credentials: async () => BROKER,
      connect: cli.connect,
      now: clock.now,
      timers: clock.timers,
    })
    const state = await link.ready(3000)
    const frames = 32
    const sends = Array.from({ length: frames }, (_, i) =>
      link.publish(
        state,
        { kind: KIND.REQUEST, id: `r${i}` },
        Buffer.alloc(WEB_BODY_BYTES),
      ),
    )
    await clock.advance(10_000)
    expect(await Promise.all(sends)).toEqual(sends.map(() => true))
    const published = cli.published
    expect(published).toHaveLength(frames)
    const total = published.reduce((sum, p) => sum + p.bytes, 0)
    expect(total).toBeGreaterThan(2 * 1024 * 1024)
    let bytes = 0
    for (const { at, bytes: size } of published) {
      bytes += size
      // Never ahead of the burst plus the byte rate.
      expect(bytes).toBeLessThanOrEqual(
        WEB_PACING.byteBurst +
          (WEB_PACING.bytesPerSecond * (at - T0)) / 1000 +
          size,
      )
    }
    const took = published.at(-1).at - T0
    expect(took).toBeGreaterThanOrEqual(
      ((total - WEB_PACING.byteBurst - WEB_BODY_BYTES * 2) /
        WEB_PACING.bytesPerSecond) *
        1000,
    )
    expect(took).toBeLessThanOrEqual((total / WEB_PACING.bytesPerSecond) * 1000)
    link.close()
  })
})
