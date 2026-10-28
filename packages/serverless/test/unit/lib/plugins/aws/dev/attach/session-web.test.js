import { afterAll, afterEach, expect, jest, test } from '@jest/globals'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { connectToSession } from '../../../../../../../lib/plugins/aws/dev/control/client.js'
import { runDevSession } from '../../../../../../../lib/plugins/aws/dev/attach/session.js'
import {
  MAX_REQUEST_BUSY_MS,
  createWebRuntime,
  readWebApps,
  selectSessionWebApps,
  webAppsOf,
} from '../../../../../../../lib/plugins/aws/dev/attach/session-web.js'
import { CREDENTIALS_PATH } from '../../../../../../../lib/plugins/aws/dev/web/relay.js'
import { createLocalOnlyCredentials } from '../../../../../../../lib/plugins/aws/dev/web/local-credentials.js'
import {
  KIND,
  createOpener,
  createSealer,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'
import { selectionOf } from '../../../../../../../lib/plugins/aws/dev/state/session-state.js'
import {
  buildPermissionPolicy,
  buildTrustPolicy,
} from '../../../../../../../lib/plugins/aws/dev/attach/broker.js'
import {
  ACCOUNT,
  artifact,
  countingTimers,
  fakeIam,
  fakeIot,
  fakeLambda,
  fakeLambdaWeb,
  fakeLog,
  fakeProcess,
  fakeProvider,
  fakeServerless,
  memoryState,
  recordingProgress,
  testSessionId,
} from './fakes.js'
import { runWithoutColor } from '../without-color.js'
import { fakeTty } from '../local/tty.js'
import {
  DETAILED_OFF,
  DETAILED_ON,
} from '../../../../../../../lib/plugins/aws/dev/local/hotkeys.js'

runWithoutColor()

const LOCAL = {
  node: { available: true, command: 'node', version: '24.21.0' },
}
const SESSION = testSessionId(1)
const KEY = Buffer.alloc(32, 7)
const ROLE = {
  AWS_ACCESS_KEY_ID: 'ASIAWEBROLE',
  AWS_SECRET_ACCESS_KEY: 'web-role-secret',
  AWS_SESSION_TOKEN: 'web-role-token',
}
const BRIDGE = { bucket: 'deployment-bucket', key: 'bridge/abc.zip' }

/** A deployed web function: `main` on the revision CloudFormation made. */
const deployedWebFunction = () => ({
  revisions: {
    'rev-cfn': {
      description: 'deployed',
      buildConfig: {
        codeConfig: {
          s3Object: { bucket: 'deployment-bucket', key: 'app.zip' },
        },
        runtimeConfig: { runtime: 'nodejs24.x' },
      },
      serviceConfig: {
        executionRoleArn: 'arn:aws:iam::123456789012:role/web',
        environmentVariables: {
          AWS_LAMBDA_NODEJS_ENTRYPOINT: 'server.js',
          TABLE: 'orders',
        },
      },
    },
  },
  endpoints: {
    main: {
      authType: 'ApplicationManaged',
      revisionWeights: [{ revisionId: 'rev-cfn', weight: 100 }],
    },
  },
})
const deployedWeb = (keys) =>
  fakeLambdaWeb(
    Object.fromEntries(
      keys.map((key) => [`svc-dev-${key}`, deployedWebFunction()]),
    ),
  )
const devModeLeft = (lambdaWeb) =>
  [...lambdaWeb.state.entries()].map(([name, web]) => ({
    name,
    revisions: [...web.revisions.keys()],
    endpoints: [...web.endpoints.keys()],
    main: web.endpoints.get('main').revisionWeights,
  }))
const untouched = (keys) =>
  keys.map((key) => ({
    name: `svc-dev-${key}`,
    revisions: ['rev-cfn'],
    endpoints: ['main'],
    main: [{ revisionId: 'rev-cfn', weight: 100 }],
  }))

/** The web apps' servers, listeners and credentials endpoint, in memory. */
const fakeWebDeps = ({ fetch, handler, nodeVersion = '24.21.0' } = {}) => {
  const servers = new Map()
  const proxies = new Map()
  const registrations = []
  const deps = {
    servers,
    proxies,
    registrations,
    // A real HTTP server on 127.0.0.1 that answers with its web app's key and the request.
    nodeVersion,
    createServer: ({ key, start, env, onLine }) => {
      const listener = http.createServer(
        handler ??
          ((req, res) => {
            res.writeHead(200, { 'content-type': 'text/plain' })
            res.end(`${key} ${req.method} ${req.url} ${req.headers.host}`)
          }),
      )
      const server = {
        key,
        port: null,
        serving: false,
        onLine,
        start: jest.fn(async () => {
          await new Promise((resolve) =>
            listener.listen(0, '127.0.0.1', resolve),
          )
          server.port = listener.address().port
          server.started = start
          server.env = env({ port: server.port, hostname: '127.0.0.1' })
          server.serving = true
        }),
        reload: jest.fn(async () => true),
        stop: jest.fn(async () => {
          server.serving = false
          if (!listener.listening) return
          listener.closeAllConnections()
          await new Promise((resolve) => listener.close(resolve))
        }),
      }
      servers.set(key, server)
      return server
    },
    startProxy: async ({ key, server }) => {
      const proxy = {
        port: server.port + 1000,
        url: `http://127.0.0.1:${server.port + 1000}`,
        close: jest.fn(async () => {}),
      }
      proxies.set(key, proxy)
      return proxy
    },
    openResources: async () => ({
      configFiles: {
        config: '/tmp/session/aws-config',
        credentials: '/tmp/session/aws-credentials',
        boto: '/tmp/session/boto-config',
      },
      credentials: {
        register: (id) => {
          const registration = {
            id,
            updates: [],
            uri: `http://127.0.0.1:9/credentials/${id}`,
            token: 'credentials-token',
            update(credentials) {
              registration.updates.push(credentials)
            },
          }
          registrations.push(registration)
          return registration
        },
        unregister() {},
      },
      close: jest.fn(async () => {}),
    }),
    fetch: fetch ?? (async () => ({ status: 204 })),
    // The configuration file a session of web apps alone watches, in memory.
    configWatches: [],
    configFile: async () => '/service/serverless.yml',
    watchFile: (file, handlers) => {
      const watch = { file, ...handlers, close: jest.fn(async () => {}) }
      deps.configWatches.push(watch)
      return watch
    },
  }
  return deps
}

/** A relay connection whose published frames are kept and whose receiver a test can reach. */
const fakeRelayConnection = () => {
  const connection = {
    published: [],
    receiver: () => {},
    transport: {
      publish: async (message) => {
        connection.published.push(message)
        return true
      },
    },
    credentials: { current: () => ({ accessKeyId: 'AKID' }) },
    setReceiver(fn) {
      connection.receiver = fn
    },
    onReconnected() {},
    quiet() {},
    async stop() {},
  }
  return connection
}

let sessions = []
afterEach(async () => {
  const ended = sessions.map((session) => session.ended())
  for (const session of sessions) {
    if (!session.ended()) session.proc.emit('SIGINT', 'SIGINT')
  }
  const live = await Promise.all(sessions.map((session) => session.timersLeft))
  sessions = []
  expect(ended).toEqual(ended.map(() => true))
  expect(live).toEqual(live.map(() => 0))
})

const start = ({
  functions = {},
  live = {},
  webApps = {},
  lambdaWeb,
  options = {},
  web = fakeWebDeps(),
  connection = fakeRelayConnection(),
  iam = fakeIam(),
  sessionId = SESSION,
  // The other sessions that answer as running.
  liveSessions = [],
  deps = {},
  // null: the real session file and event log, in `serviceDir`.
  state: givenState = memoryState(),
  serviceDir,
  // A person at a terminal `columns` wide: the session's keys are on.
  tty = false,
  columns = 80,
  provider = fakeProvider(),
  serviceProvider,
}) => {
  const logger = fakeLog({ interactive: tty })
  const serverless = fakeServerless({ functions })
  serverless.service.webApps = webApps
  if (serviceProvider) serverless.service.provider = serviceProvider
  if (serviceDir) serverless.serviceDir = serviceDir
  const lambda = fakeLambda(
    Object.fromEntries(
      Object.entries(live).map(([key, config]) => [`svc-dev-${key}`, config]),
    ),
  )
  const proc = fakeProcess()
  if (tty) {
    proc.stdin = fakeTty()
    proc.stdout.isTTY = true
    proc.stderr.isTTY = true
    proc.stderr.columns = columns
  }
  const timers = countingTimers()
  const state = givenState
  const progress = recordingProgress()
  const laptops = []
  let ready
  const whenReady = new Promise((resolve) => {
    ready = resolve
  })
  const result = runDevSession({
    serverless,
    provider,
    options,
    deps: {
      clients: { lambda, iam, iot: fakeIot(), lambdaWeb },
      logger,
      progress,
      sleep: async () => {},
      owner: 'alice@mbp',
      sessionId,
      sessionKey: KEY,
      processRef: proc,
      readArtifact: async (arch) => artifact(arch),
      stackExists: async () => true,
      onReady: ready,
      watchIntervalMs: 3_600_000,
      timers,
      detectLocal: async () => LOCAL,
      startLaptop: async (args) => {
        laptops.push(args)
        return { stop: async () => {} }
      },
      connectRelay: async () => connection,
      checkSessionsLiveness: async ({ sessionIds }) =>
        new Map(
          sessionIds.map((id) => [
            id,
            liveSessions.includes(id) ? 'live' : 'gone',
          ]),
        ),
      openSideChannel: async () => ({ enabled: true, sweep: async () => 0 }),
      s3: { fake: 's3' },
      state,
      uploadBridge: async () => BRIDGE,
      web,
      ...deps,
    },
  })
  const timersLeft = result.then(
    () => timers.live(),
    () => timers.live(),
  )
  let ended = false
  result.then(
    () => {
      ended = true
    },
    () => {
      ended = true
    },
  )
  sessions.push({ timersLeft, proc, ended: () => ended })
  return {
    serverless,
    lambda,
    lambdaWeb,
    logger,
    proc,
    state,
    result,
    whenReady,
    laptops,
    web,
    connection,
    progress,
  }
}

/** A clock the test moves by hand: a stop signal more than half a second after the first forces. */
const handClock = () => {
  let time = 1_790_000_000_000
  return {
    now: () => time,
    advance: (ms) => {
      time += ms
    },
  }
}

/** Answers what a web bridge sends through the session's relay, as the bridge would hear it. */
const bridgeOf = (connection) => {
  const seal = createSealer({ key: KEY })
  const open = createOpener({ key: KEY })
  const topics = topicsOf(SESSION)
  // An opener takes each frame once (replays are dropped): each message is opened once here.
  const opened = new Map()
  const framesFor = (id) =>
    connection.published
      .map((message) => {
        if (!opened.has(message)) {
          opened.set(message, open(message.topic, message.payload))
        }
        return opened.get(message)
      })
      .filter((frame) => frame?.header.id === id)
  return {
    framesFor,
    /** A request offered by the dev revision of `fn`; resolves once it is answered. */
    async offer(header) {
      const id = header.id
      connection.receiver(
        topics.up,
        seal(
          topics.up,
          {
            kind: KIND.REQUEST,
            env: 'e0123456789ab',
            sentAt: Date.now(),
            headers: {},
            ...header,
          },
          Buffer.alloc(0),
        ),
      )
      const until = Date.now() + 5_000
      for (;;) {
        const kinds = framesFor(id).map((frame) => frame.header.kind)
        if (
          kinds.includes(KIND.STREAM_END) ||
          kinds.includes(KIND.NEED_ENVIRONMENT) ||
          kinds.includes(KIND.NOT_IN_DEV)
        ) {
          return framesFor(id)
        }
        if (Date.now() > until) throw new Error(`no answer to ${id}`)
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    },
  }
}

test('a mixed service attaches functions and web apps in one session', async () => {
  const lambdaWeb = deployedWeb(['web', 'admin'])
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: {
      web: { dev: { command: 'npm run dev' } },
      admin: { dev: { command: 'npm run admin' } },
    },
    lambdaWeb,
    options: { 'local-only': ['admin'] },
  })
  await s.whenReady
  // The function is attached as before.
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(SESSION)
  // web: main moved to the dev revision, the fallback on the clone.
  const web = lambdaWeb.state.get('svc-dev-web')
  const devRevision = web.endpoints.get('main').revisionWeights[0].revisionId
  expect(
    web.revisions.get(devRevision).serviceConfig.environmentVariables,
  ).toMatchObject({
    SLS_DEV_SESSION: SESSION,
    SLS_DEV_REVISION_ROLE: 'dev',
    SLS_DEV_RESTORE_REVISION: 'rev-cfn',
    TABLE: 'orders',
  })
  expect(web.revisions.get(devRevision).buildConfig.codeConfig).toEqual({
    s3Object: BRIDGE,
  })
  expect([...web.endpoints.keys()].sort()).toEqual(['main', 'sls-dev-fallback'])
  // admin (--local-only): its own endpoint; main untouched.
  const admin = lambdaWeb.state.get('svc-dev-admin')
  expect(admin.endpoints.get('main').revisionWeights).toEqual([
    { revisionId: 'rev-cfn', weight: 100 },
  ])
  expect([...admin.endpoints.keys()].sort()).toEqual(['main', 'sls-dev-local'])
  // One laptop runtime, for the function alone.
  expect(
    s.laptops.map(({ functions }) => functions.map(({ key }) => key)),
  ).toEqual([['api']])
  // A server and a local listener per web app, with the deployed variables and the session's
  // credentials endpoint and empty AWS config files.
  expect([...s.web.servers.keys()].sort()).toEqual(['admin', 'web'])
  for (const server of s.web.servers.values()) {
    expect(server.start).toHaveBeenCalledTimes(1)
    expect(server.env).toMatchObject({
      TABLE: 'orders',
      PORT: String(server.port),
      HOSTNAME: '127.0.0.1',
      AWS_REGION: 'us-east-1',
      AWS_CONTAINER_CREDENTIALS_FULL_URI: expect.stringMatching(
        /^http:\/\/127\.0\.0\.1:9\/credentials\//,
      ),
      AWS_CONFIG_FILE: '/tmp/session/aws-config',
    })
    expect(server.env).not.toHaveProperty('SLS_DEV_SESSION')
  }
  expect(s.web.servers.get('web').started).toEqual({
    source: 'config',
    command: 'npm run dev',
    cwd: undefined,
  })
  expect([...s.web.proxies.keys()].sort()).toEqual(['admin', 'web'])

  // A request on web's real URL comes through the relay to its server.
  const bridge = bridgeOf(s.connection)
  const frames = await bridge.offer({
    id: 'r-web',
    fn: 'svc-dev-web',
    method: 'GET',
    path: '/',
    environment: ROLE,
  })
  expect(frames.map((frame) => frame.header.kind)).toEqual([
    KIND.ACCEPTED,
    KIND.RESPONSE_START,
    KIND.STREAM_DATA,
    KIND.STREAM_END,
  ])
  const port = s.web.servers.get('web').port
  expect(frames[1].header.status).toBe(200)
  expect(frames[2].body.toString()).toBe(`web GET / 127.0.0.1:${port}`)
  // Its role credentials reached web's credentials endpoint.
  const webRegistration = s.web.registrations.find((registration) =>
    s.web.servers
      .get('web')
      .env.AWS_CONTAINER_CREDENTIALS_FULL_URI.endsWith(registration.id),
  )
  expect(webRegistration.updates).toEqual([
    {
      accessKeyId: ROLE.AWS_ACCESS_KEY_ID,
      secretAccessKey: ROLE.AWS_SECRET_ACCESS_KEY,
      sessionToken: ROLE.AWS_SESSION_TOKEN,
    },
  ])

  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  // Everything Dev Mode made is gone; main serves the deployed revision again.
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['web', 'admin']))
  expect(
    s.lambda.state.get('svc-dev-api').Environment?.Variables?.SLS_DEV_SESSION,
  ).toBeUndefined()
  for (const server of s.web.servers.values()) {
    expect(server.stop).toHaveBeenCalled()
  }
  for (const proxy of s.web.proxies.values()) {
    expect(proxy.close).toHaveBeenCalled()
  }
  expect(s.logger.text()).toContain(
    'Dev Mode off · 1 function and 2 web apps restored',
  )
  const ended = s.state.records.find(
    (record) => record.type === 'session.ended',
  )
  expect(ended.restore).toMatchObject({ restored: 3, failed: 0 })
  // The web apps among them, so `dev stop` can name them apart from the functions.
  expect(ended.web_apps).toMatchObject({ restored: 2, failed: 0 })
})

test('Ctrl+C restores web apps and functions', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const gate = lambdaWeb.gate('createEndpoint', { applied: true })
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
  })
  await gate.reached
  // Half done: the clone exists, the fallback endpoint exists but has not answered, main is as
  // deployed, and the function is attached.
  expect(lambdaWeb.state.get('svc-dev-web').revisions.size).toBe(2)
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(SESSION)
  s.proc.emit('SIGINT', 'SIGINT')
  gate.release()
  expect(await s.result).toBe(0)
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['web']))
  // The attach took no step after the stop: no dev revision, main never moved.
  const writes = lambdaWeb.calls.map(([method]) => method)
  expect(writes.filter((method) => method === 'createRevision')).toHaveLength(1)
  expect(writes).not.toContain('updateEndpointWeights')
  expect(
    s.lambda.state.get('svc-dev-api').Environment?.Variables?.SLS_DEV_SESSION,
  ).toBeUndefined()
  // Nothing ran: no server started.
  expect(s.web.servers.size).toBe(0)
})

/**
 * Holds `method` calls for which `when(input)` holds, before they reach AWS; from the moment the
 * process exits (a forced exit), every call fails as if it was never sent: the CLI is gone.
 * `revive()` lets a later session (a new CLI) use the same web functions.
 */
const holdAndDie = (lambdaWeb, proc, method, when = () => true) => {
  let release
  let reached
  let revived = false
  const held = new Promise((resolve) => (release = resolve))
  const reachedPromise = new Promise((resolve) => (reached = resolve))
  for (const name of Object.keys(lambdaWeb)) {
    const call = lambdaWeb[name]
    if (typeof call !== 'function' || name === 'gate') continue
    lambdaWeb[name] = async (input) => {
      if (name === method && when(input)) {
        reached()
        await held
      }
      if (proc.exits.length && !revived) throw new Error('the CLI has exited')
      return call(input)
    }
  }
  return {
    reached: reachedPromise,
    release: () => release(),
    revive: () => {
      revived = true
    },
  }
}

test('a second Ctrl+C between the clone and its endpoint exits 3 naming the web app; main is never moved, and the next session removes the clone', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const clock = handClock()
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    deps: { now: clock.now, elapsed: clock.now },
  })
  const hold = holdAndDie(lambdaWeb, s.proc, 'createEndpoint')
  await hold.reached
  // The clone exists; its endpoint was not asked for yet.
  s.proc.emit('SIGINT', 'SIGINT')
  clock.advance(501)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(s.proc.exits).toEqual([3])
  expect(s.logger.text()).toContain('Not restored: svc-dev-api, web (web app).')
  expect(s.logger.text()).toContain(
    'They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
  )
  hold.release()
  await s.result
  // What the exit left: the clone alone, which no endpoint serves; main never moved.
  const web = lambdaWeb.state.get('svc-dev-web')
  expect([...web.endpoints.keys()]).toEqual(['main'])
  expect(web.endpoints.get('main').revisionWeights).toEqual([
    { revisionId: 'rev-cfn', weight: 100 },
  ])
  expect(web.revisions.size).toBe(2)
  const [clone] = [...web.revisions.values()].filter(
    ({ revisionId }) => revisionId !== 'rev-cfn',
  )
  expect(clone.description).toBe(
    `Serverless Dev Mode clone for session ${SESSION}`,
  )

  // The next session finds it (its session has ended) and removes it before it attaches.
  hold.revive()
  const next = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    sessionId: testSessionId(2),
  })
  await next.whenReady
  expect(web.revisions.has(clone.revisionId)).toBe(false)
  next.proc.emit('SIGINT', 'SIGINT')
  expect(await next.result).toBe(0)
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['web']))
})

test("a running session's clone that no endpoint serves yet is left alone", async () => {
  const lambdaWeb = deployedWeb(['web'])
  const other = testSessionId(9)
  const clone = lambdaWeb.state.get('svc-dev-web').revisions.get('rev-cfn')
  lambdaWeb.state.get('svc-dev-web').revisions.set('rev-inflight', {
    ...structuredClone(clone),
    revisionId: 'rev-inflight',
    description: `Serverless Dev Mode clone for session ${other}`,
    serviceConfig: {
      ...structuredClone(clone.serviceConfig),
      environmentVariables: {
        ...clone.serviceConfig.environmentVariables,
        SLS_DEV_REVISION_ROLE: 'clone',
      },
    },
  })
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    liveSessions: [other],
  })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  const web = lambdaWeb.state.get('svc-dev-web')
  expect([...web.revisions.keys()].sort()).toEqual(['rev-cfn', 'rev-inflight'])
  expect(
    lambdaWeb.calls.filter(([method]) => method.startsWith('delete')),
  ).toEqual([])
})

test('a web app a running session of someone else holds is not restored first: it stays theirs', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const other = testSessionId(9)
  const { attachWebApp } =
    await import('../../../../../../../lib/plugins/aws/dev/web/attach.js')
  const { devRevisionId } = await attachWebApp({
    lambdaWeb,
    functionName: 'svc-dev-web',
    bridge: BRIDGE,
    session: {
      id: other,
      owner: 'bob@desk',
      attachedAt: 1,
      broker: { arn: 'arn:aws:iam::123456789012:role/b', externalId: 'x' },
      key: 'k',
      iotEndpoint: 'iot',
    },
  })
  const before = JSON.stringify(devModeLeft(lambdaWeb))
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    liveSessions: [other],
  })
  await s.whenReady
  expect(s.web.servers.size).toBe(0)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(JSON.stringify(devModeLeft(lambdaWeb))).toBe(before)
  expect(
    lambdaWeb.state.get('svc-dev-web').endpoints.get('main').revisionWeights,
  ).toEqual([{ revisionId: devRevisionId, weight: 100 }])
})

test('--on-exit keep during a half-done attach keeps the attached web apps and removes what the other created', async () => {
  const lambdaWeb = deployedWeb(['web', 'admin'])
  const proc = { exits: [] }
  const hold = holdAndDie(
    lambdaWeb,
    proc,
    'createEndpoint',
    ({ endpointName }) => endpointName === 'sls-dev-fallback',
  )
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: {
      web: { dev: { command: 'npm run dev' } },
      admin: { dev: { command: 'npm run admin' } },
    },
    lambdaWeb,
    options: { 'local-only': ['admin'], 'on-exit': 'keep' },
  })
  await hold.reached
  // admin's attach is done once its endpoint is active.
  const until = Date.now() + 5_000
  while (
    !lambdaWeb.calls.some(
      ([method, { functionName }]) =>
        method === 'waitEndpointActive' && functionName === 'svc-dev-admin',
    )
  ) {
    if (Date.now() > until) throw new Error('admin never attached')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  await new Promise((resolve) => setTimeout(resolve, 10))
  s.proc.emit('SIGINT', 'SIGINT')
  hold.release()
  expect(await s.result).toBe(0)
  // web: everything its attach created is gone, main as deployed.
  expect(devModeLeft(lambdaWeb)[0]).toEqual(untouched(['web'])[0])
  // admin stays in Dev Mode: its dev revision behind sls-dev-local.
  const admin = lambdaWeb.state.get('svc-dev-admin')
  expect([...admin.endpoints.keys()].sort()).toEqual(['main', 'sls-dev-local'])
  expect(admin.revisions.size).toBe(2)
  // The function stays attached too.
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(SESSION)
})

test('a web function the session may not read: web apps run the deployed code, functions run here; with web apps alone the session fails', async () => {
  const denied = () =>
    Object.assign(
      new Error('not authorized to perform: lambda:ListWebFunctionEndpoints'),
      { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } },
    )
  const lambdaWeb = deployedWeb(['web'])
  lambdaWeb.failures.listEndpoints = [denied()]
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
  })
  await s.whenReady
  expect(
    s.logger.lines
      .filter(({ level }) => level === 'warning')
      .map(({ text }) => text),
  ).toEqual([
    'Web apps run the deployed code: your AWS credentials need lambda:ListWebFunctionEndpoints, lambda:ListWebFunctionRevisions, lambda:GetWebFunctionRevision on their web functions to run them here.',
  ])
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(SESSION)
  expect(s.web.servers.size).toBe(0)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['web']))

  const alone = deployedWeb(['web'])
  alone.failures.listEndpoints = [denied()]
  const failed = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: alone,
  })
  await expect(failed.result).rejects.toMatchObject({
    code: 'DEV_MODE_WEB_ACCESS_DENIED',
  })
})

test('a session that fails while its web app servers start restores the web apps and the functions', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const web = fakeWebDeps()
  web.openResources = async () => {
    throw new Error('no temporary directory')
  }
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    web,
  })
  await expect(s.result).rejects.toThrow('no temporary directory')
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['web']))
  expect(
    s.lambda.state.get('svc-dev-api').Environment?.Variables?.SLS_DEV_SESSION,
  ).toBeUndefined()
})

test('web-apps-only service reaches ready', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
  })
  await s.whenReady
  expect(s.laptops).toEqual([])
  expect(s.lambda.calls ?? []).toEqual([])
  expect(
    s.state.records.some((record) => record.type === 'session.ready'),
  ).toBe(true)
  expect(s.logger.text()).not.toContain('Nothing to attach')
  expect(s.web.servers.get('web').start).toHaveBeenCalled()
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['web']))
})

test('a --local-only session gets the role credentials through its own relay; a denied request leaves the session running', async () => {
  const lambdaWeb = deployedWeb(['admin', 'blog'])
  const connection = fakeRelayConnection()
  const bridge = bridgeOf(connection)
  const requests = []
  const web = fakeWebDeps({
    // As the dev revision behind sls-dev-local: the request goes through the session's relay.
    fetch: async (url, init) => {
      requests.push({ url, init })
      if (url.includes('svc-dev-blog')) return { status: 403 }
      const id = `c-${requests.length}`
      const frames = await bridge.offer({
        id,
        fn: 'svc-dev-admin',
        method: 'GET',
        path: new URL(url).pathname,
        environment: ROLE,
      })
      const start = frames.find(
        (frame) => frame.header.kind === KIND.RESPONSE_START,
      )
      return { status: start?.header.status ?? 502 }
    },
  })
  const made = []
  web.localCredentials = (options) => {
    const credentials = createLocalOnlyCredentials(options)
    made.push(credentials)
    return credentials
  }
  const s = start({
    webApps: {
      admin: { dev: { command: 'npm run admin' } },
      blog: { dev: { command: 'npm run blog' } },
    },
    lambdaWeb,
    options: { 'local-only': ['admin', 'blog'] },
    web,
    connection,
  })
  await s.whenReady
  const until = Date.now() + 5_000
  while (
    made[0]?.stateOf('admin') !== 'ready' ||
    made[0]?.stateOf('blog') !== 'denied'
  ) {
    if (Date.now() > until) throw new Error('credentials never settled')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(requests.map(({ url }) => url).sort()).toEqual([
    `https://sls-dev-local-svc-dev-admin.web.test${CREDENTIALS_PATH}`,
    `https://sls-dev-local-svc-dev-blog.web.test${CREDENTIALS_PATH}`,
  ])
  expect(requests[0].init.headers.authorization).toMatch(
    /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/us-east-1\/lambda\/aws4_request/,
  )
  // The relay answered it itself: 204, nothing reached the local server.
  const answered = bridge.framesFor('c-1').map((frame) => frame.header.kind)
  expect(answered).toEqual([
    KIND.ACCEPTED,
    KIND.RESPONSE_START,
    KIND.STREAM_END,
  ])
  const adminRegistration = s.web.registrations.find((registration) =>
    s.web.servers
      .get('admin')
      .env.AWS_CONTAINER_CREDENTIALS_FULL_URI.endsWith(registration.id),
  )
  expect(adminRegistration.updates).toHaveLength(1)
  // Both keep running; main of each untouched.
  expect(s.web.servers.get('blog').start).toHaveBeenCalled()
  for (const key of ['admin', 'blog']) {
    expect(
      lambdaWeb.state.get(`svc-dev-${key}`).endpoints.get('main')
        .revisionWeights,
    ).toEqual([{ revisionId: 'rev-cfn', weight: 100 }])
  }
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['admin', 'blog']))
})

test('a functions-only service makes no Lambda Web call, from start to restore', async () => {
  const lambdaWeb = fakeLambdaWeb()
  const s = start({ functions: { api: {} }, live: { api: {} }, lambdaWeb })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(lambdaWeb.calls).toEqual([])
  expect(s.web.servers.size).toBe(0)
})

test('web apps not selected are not read; an unknown web app name fails before anything starts', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    options: { 'skip-web-app': ['web'] },
  })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(lambdaWeb.calls).toEqual([])

  const unknown = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: {} },
    lambdaWeb: deployedWeb(['web']),
    options: { 'web-app': ['nope'] },
  })
  await expect(unknown.result).rejects.toMatchObject({
    code: 'DEV_MODE_UNKNOWN_WEB_APP',
  })
})

test('a web app another session of yours left in Dev Mode is restored first, then attached for this session', async () => {
  const lambdaWeb = deployedWeb(['web'])
  // An earlier session's attach, left behind.
  const { attachWebApp } =
    await import('../../../../../../../lib/plugins/aws/dev/web/attach.js')
  await attachWebApp({
    lambdaWeb,
    functionName: 'svc-dev-web',
    bridge: BRIDGE,
    session: {
      id: testSessionId(9),
      owner: 'alice@mbp',
      attachedAt: 1,
      broker: { arn: 'arn:aws:iam::123456789012:role/b', externalId: 'x' },
      key: 'k',
      iotEndpoint: 'iot',
    },
  })
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
  })
  await s.whenReady
  const web = lambdaWeb.state.get('svc-dev-web')
  const served = web.revisions.get(
    web.endpoints.get('main').revisionWeights[0].revisionId,
  )
  expect(served.serviceConfig.environmentVariables).toMatchObject({
    SLS_DEV_SESSION: SESSION,
    SLS_DEV_RESTORE_REVISION: 'rev-cfn',
  })
  // Only this session's clone and dev revision besides the deployed one.
  expect(web.revisions.size).toBe(3)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(devModeLeft(lambdaWeb)).toEqual(untouched(['web']))
})

test("a web app at its quotas only through an earlier session's Dev Mode resources is attached: they go first", async () => {
  const lambdaWeb = deployedWeb(['web'])
  const { attachWebApp } =
    await import('../../../../../../../lib/plugins/aws/dev/web/attach.js')
  // An earlier session's clone, dev revision and sls-dev-fallback, left behind.
  await attachWebApp({
    lambdaWeb,
    functionName: 'svc-dev-web',
    bridge: BRIDGE,
    session: {
      id: testSessionId(9),
      owner: 'alice@mbp',
      attachedAt: 1,
      broker: { arn: 'arn:aws:iam::123456789012:role/b', externalId: 'x' },
      key: 'k',
      iotEndpoint: 'iot',
    },
  })
  const web = lambdaWeb.state.get('svc-dev-web')
  const deployedRevision = web.revisions.get('rev-cfn')
  // 49 revisions and 10 endpoints: 47 and 9 of them stay, and Dev Mode adds 2 and 1.
  for (let i = 0; i < 46; i++) {
    web.revisions.set(`rev-old-${i}`, {
      ...structuredClone(deployedRevision),
      revisionId: `rev-old-${i}`,
    })
  }
  for (let i = 0; i < 8; i++) {
    web.endpoints.set(`extra-${i}`, {
      endpointName: `extra-${i}`,
      state: 'Active',
      revisionWeights: [{ revisionId: 'rev-cfn', weight: 100 }],
    })
  }
  expect([web.revisions.size, web.endpoints.size]).toEqual([49, 10])

  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
  })
  await s.whenReady
  const served = web.revisions.get(
    web.endpoints.get('main').revisionWeights[0].revisionId,
  )
  expect(served.serviceConfig.environmentVariables).toMatchObject({
    SLS_DEV_SESSION: SESSION,
    SLS_DEV_RESTORE_REVISION: 'rev-cfn',
  })
  expect([web.revisions.size, web.endpoints.size]).toEqual([49, 10])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect([web.revisions.size, web.endpoints.size]).toEqual([47, 9])
})

test('readWebApps: rows by selection, start source and AWS state, with no read of unselected web apps', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const serverless = fakeServerless({ functions: {} })
  serverless.service.webApps = {
    web: { dev: { command: 'next dev' } },
    built: { entry: '.next/standalone/server.js' },
    fresh: { dev: { command: 'vite' } },
    off: { dev: { command: 'vite' } },
  }
  const webApps = webAppsOf(serverless, fakeProvider())
  const selection = selectSessionWebApps({
    webApps,
    options: { 'skip-web-app': ['off'] },
  })
  const covered = []
  const { rows, details } = await readWebApps({
    lambdaWeb,
    webApps,
    selection,
    serviceDir: '/service',
    liveness: {
      known: new Map(),
      cover: async (ids) => covered.push(...ids),
    },
    context: { sessionId: SESSION, owner: 'alice@mbp' },
  })
  expect(
    rows.map(({ webApp, mode, reason }) => [webApp, mode, reason]),
  ).toEqual([
    ['web', 'dev', undefined],
    ['built', 'skipped', 'not_deployed'],
    ['fresh', 'skipped', 'not_deployed'],
    ['off', 'deployed', 'not_selected'],
  ])
  expect(details.get('web')).toMatchObject({
    functionName: 'svc-dev-web',
    start: { source: 'config', command: 'next dev' },
    found: null,
  })
  expect(
    lambdaWeb.calls.some(([, input]) => input.functionName === 'svc-dev-off'),
  ).toBe(false)
  expect(covered).toEqual([])
})

test('the web runtime exposes each web app state; role credentials that came before the servers are handed to them', async () => {
  const deps = fakeWebDeps({ fetch: async () => ({ status: 403 }) })
  const runtime = createWebRuntime({
    serverless: { serviceDir: '/service' },
    region: 'us-east-1',
    logger: fakeLog(),
    timers: countingTimers(),
    processRef: { env: {}, pid: 1 },
    developerCredentials: async () => ({
      accessKeyId: 'AKID',
      secretAccessKey: 'secret',
    }),
    deps,
  })
  const rows = [
    { webApp: 'web', mode: 'dev', notes: [] },
    { webApp: 'admin', mode: 'local', notes: [] },
  ]
  const details = new Map([
    ['web', { functionName: 'svc-dev-web', start: { source: 'config' } }],
    ['admin', { functionName: 'svc-dev-admin', start: { source: 'config' } }],
  ])
  const relay = runtime.relayOptions({ rows, details })
  expect(relay.functions).toEqual(
    new Map([
      ['svc-dev-web', 'web'],
      ['svc-dev-admin', 'admin'],
    ]),
  )
  expect(relay.localOnly).toEqual(new Set(['admin']))
  expect(relay.isServing('web')).toBe(false)
  relay.credentials.update('web', ROLE)
  await runtime.start({
    rows,
    details,
    results: new Map([
      ['web', { deployedVariables: { A: '1' } }],
      ['admin', { deployedVariables: {}, localUrl: 'https://local.web.test' }],
    ]),
  })
  expect(relay.isServing('web')).toBe(true)
  expect(deps.registrations[0].updates).toEqual([
    {
      accessKeyId: ROLE.AWS_ACCESS_KEY_ID,
      secretAccessKey: ROLE.AWS_SECRET_ACCESS_KEY,
      sessionToken: ROLE.AWS_SESSION_TOKEN,
    },
  ])
  await new Promise((resolve) => setImmediate(resolve))
  expect(Object.fromEntries(runtime.state)).toEqual({
    web: expect.objectContaining({
      mode: 'dev',
      credentials: 'relayed',
      localUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
    }),
    admin: expect.objectContaining({ mode: 'local', credentials: 'denied' }),
  })
  await runtime.stop()
  for (const server of deps.servers.values())
    expect(server.stop).toHaveBeenCalled()
})

test('a session records its web app selection, and one with another selection is another scope', () => {
  expect(selectionOf({ function: ['api'] })).toEqual({
    only: ['api'],
    skip: [],
  })
  expect(
    selectionOf({ 'local-only': ['admin'], 'web-app': ['web', 'web'] }),
  ).toEqual({
    only: [],
    skip: [],
    web_apps: { only: ['web'], skip: [], local_only: ['admin'] },
  })
})

const BROKER = 'serverless-dev-broker-us-east-1'
/** The IAM role an earlier release created: its trust lists functions only. */
const narrowRole = ({ widenDenied = false } = {}) => {
  const iam = fakeIam()
  const at = {
    identity: { accountId: ACCOUNT, partition: 'aws' },
    region: 'us-east-1',
  }
  iam.roles.set(BROKER, {
    RoleName: BROKER,
    Path: '/',
    Arn: `arn:aws:iam::${ACCOUNT}:role/${BROKER}`,
    // Old enough not to count as new.
    CreateDate: new Date('2026-01-01T00:00:00Z'),
    AssumeRolePolicyDocument: JSON.stringify(
      buildTrustPolicy({ ...at, externalId: 'ab'.repeat(16), web: false }),
    ),
  })
  iam.policies.set(`${BROKER}/serverless-dev-broker`, buildPermissionPolicy(at))
  if (widenDenied) {
    iam.updateAssumeRolePolicyError = Object.assign(
      new Error('not authorized to perform: iam:UpdateAssumeRolePolicy'),
      { name: 'AccessDenied' },
    )
  }
  return iam
}

test('a role whose trust is widened now says its updated trust may take a while', async () => {
  const iam = narrowRole()
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    iam,
  })
  await s.whenReady
  expect(
    iam.calls.filter(([op]) => op === 'updateAssumeRolePolicy'),
  ).toHaveLength(1)
  expect(s.logger.text()).toContain(
    "The IAM role's updated trust policy can take up to 3 minutes to work; until then some web app requests run the deployed code.",
  )
  expect(s.logger.text()).not.toContain('The new IAM role')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a trust that cannot be widened: web apps run the deployed code, functions run here', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    iam: narrowRole({ widenDenied: true }),
  })
  await s.whenReady
  expect(
    s.logger.lines.some(
      ({ level, text }) =>
        level === 'warning' && text.includes('iam:UpdateAssumeRolePolicy'),
    ),
  ).toBe(true)
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(SESSION)
  expect(
    lambdaWeb.calls.filter(([method]) => method.startsWith('create')),
  ).toEqual([])
  expect(s.web.servers.size).toBe(0)
  expect(s.logger.text()).not.toContain('can take up to 3 minutes')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)

  // With web apps alone there is nothing to run: the session fails with the reason.
  const alone = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    iam: narrowRole({ widenDenied: true }),
  })
  await expect(alone.result).rejects.toMatchObject({
    code: 'DEV_MODE_BROKER_UPDATE_DENIED',
  })
})

// What a session shows and reports about its web apps (output, status, records).

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
})
const tempServiceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  tempDirs.push(dir)
  return dir
}
/** The session's lines from the ready line to the stop hint, the ready time made constant. */
const readyLines = (logger) => {
  const lines = logger.lines.filter((line) => line.level !== 'debug')
  const from = lines.findIndex((line) => line.text.startsWith('Dev Mode on'))
  const to = lines.findIndex((line) => /^Press .*Ctrl\+C/.test(line.text))
  return lines
    .slice(from, to + 1)
    .map(({ level, text }) => [level, text.replace(/\(\d+\.\ds\)/, '(1.0s)')])
}

test('a functions-only session prints, records and reports exactly what it did before web apps', async () => {
  const serviceDir = tempServiceDir()
  const s = start({
    functions: { api: {}, report: {} },
    live: { api: {}, report: {} },
    options: { 'skip-function': ['report'] },
    lambdaWeb: fakeLambdaWeb(),
    state: null,
    serviceDir,
  })
  await s.whenReady
  expect(readyLines(s.logger)).toEqual([
    ['success', 'Dev Mode on · 1 of 2 functions (1.0s)'],
    [
      'notice',
      [
        'Function  Mode      Why',
        'api       dev',
        'report    deployed  not selected (--skip-function)',
      ].join('\n'),
    ],
    [
      'aside',
      'The new IAM role can take up to 3 minutes to work; until then some invocations run the deployed code.',
    ],
    ['aside', 'Press Ctrl+C to restore your functions and exit.'],
  ])
  const session = await connectToSession({ serviceDir })
  const { body } = await session.status()
  expect(Object.keys(body)).toEqual([
    'state',
    'session_id',
    'pid',
    'owner',
    'service',
    'stage',
    'region',
    'detached',
    'started_at',
    'ready_at',
    'invocations',
    'functions',
    'endpoints',
    // The lines earlier CLI versions read, and the rows this one prints (see endpointListsOf).
    'endpoint_text',
    'endpoint_rows',
    'cursor',
  ])
  expect(body.functions).toEqual([
    { name: 'api', mode: 'dev' },
    {
      name: 'report',
      mode: 'deployed',
      reason: 'not_selected',
      why: 'not selected (--skip-function)',
    },
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  const records = fs
    .readFileSync(
      path.join(serviceDir, '.serverless', 'dev', 'session.ndjson'),
      'utf8',
    )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const ready = records.find((record) => record.type === 'session.ready')
  expect(Object.keys(ready).sort()).toEqual(
    [
      'attach_ms',
      'functions',
      'ready_ms',
      'seq',
      'session_id',
      'ts',
      'type',
      'v',
    ].sort(),
  )
  expect(ready.functions).toEqual({ dev: 1, deployed: 1, skipped: 0 })
  expect(records.map((record) => record.type)).not.toContain('web_app.mode')
})

test('a mixed session lists its web apps in the mode table and under web apps: with their real and local URLs', async () => {
  const lambdaWeb = deployedWeb(['web', 'admin'])
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: {
      web: { dev: { command: 'npm run dev' } },
      admin: { dev: { command: 'npm run admin' } },
    },
    lambdaWeb,
    options: { 'local-only': ['admin'] },
  })
  await s.whenReady
  const local = (key) => s.web.proxies.get(key).url
  expect(readyLines(s.logger)).toEqual([
    ['success', 'Dev Mode on · 1 of 1 function and 2 of 2 web apps (1.0s)'],
    [
      'notice',
      [
        'Name             Mode   Why',
        'api              dev',
        'web (web app)    dev',
        'admin (web app)  local  on its local URL only (--local-only); its real URL serves the deployed code',
      ].join('\n'),
    ],
    [
      'notice',
      [
        'web apps:',
        '  web    https://main-svc-dev-web.web.test',
        `         ${local('web')}`,
        `  admin  ${local('admin')}  (local only)`,
      ].join('\n'),
    ],
    // The fake account has no role yet: the session creates it.
    [
      'aside',
      'The new IAM role can take up to 3 minutes to work; until then some invocations and web app requests run the deployed code.',
    ],
    ['aside', 'Press Ctrl+C to restore your functions and web apps and exit.'],
  ])
  expect(s.logger.text()).not.toContain('Hot reload works')
  // The records: one web_app.mode per web app, and session.ready counts them.
  expect(
    s.state.records.filter((record) => record.type === 'web_app.mode'),
  ).toEqual([
    {
      type: 'web_app.mode',
      web_app: 'web',
      mode: 'dev',
      reason: undefined,
      why: undefined,
      notes: undefined,
    },
    {
      type: 'web_app.mode',
      web_app: 'admin',
      mode: 'local',
      reason: undefined,
      // As dev status says it.
      why: 'on its local URL only (--local-only); its real URL serves the deployed code',
      notes: undefined,
    },
  ])
  expect(
    s.state.records.find((record) => record.type === 'session.ready'),
  ).toMatchObject({
    functions: { dev: 1, deployed: 0, skipped: 0 },
    web_apps: { dev: 1, local: 1, deployed: 0, skipped: 0 },
  })
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('the start lists an API route under endpoints and a web app under web apps, with its custom domain, as the stack and the configuration give them', async () => {
  const API = 'https://abcde12345.execute-api.us-east-1.amazonaws.com'
  const SITE = 'https://siteexample12345.mrc.lambda-web.us-east-1.on.aws'
  const outputs = [
    { OutputKey: 'HttpApiUrl', OutputValue: API },
    { OutputKey: 'SiteWebFunctionUrl', OutputValue: SITE },
  ]
  const s = start({
    functions: { hello: { events: [{ httpApi: 'GET /hello' }] } },
    live: { hello: {} },
    webApps: { site: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['site']),
    serviceProvider: { domain: { name: 'www.example.com', webApp: 'site' } },
    provider: {
      ...fakeProvider(),
      request: async (service, method) => {
        if (`${service}.${method}` !== 'CloudFormation.describeStacks') {
          throw new Error(`unexpected ${service}.${method}`)
        }
        return { Stacks: [{ Outputs: outputs }] }
      },
    },
    deps: { stackExists: undefined },
  })
  await s.whenReady
  const local = s.web.proxies.get('site').url
  expect(
    readyLines(s.logger).filter(
      ([, text]) =>
        text.startsWith('endpoints:') || text.startsWith('web apps:'),
    ),
  ).toEqual([
    ['notice', `endpoints:\n  GET /hello  ${API}/hello`],
    [
      'notice',
      [
        'web apps:',
        `  site  ${SITE}`,
        '        https://www.example.com',
        `        ${local}`,
      ].join('\n'),
    ],
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a --local-only web app alone is listed by its local URL: its real URL does not reach this machine', async () => {
  const s = start({
    webApps: { admin: { dev: { command: 'npm run admin' } } },
    lambdaWeb: deployedWeb(['admin']),
    options: { 'local-only': ['admin'] },
  })
  await s.whenReady
  expect(s.logger.text()).toContain(
    `web apps:\n  admin  ${s.web.proxies.get('admin').url}  (local only)`,
  )
  expect(s.logger.text()).not.toContain('https://main-svc-dev-admin.web.test')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a web-apps-only session names web apps in its ready line and stop hint', async () => {
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
  })
  await s.whenReady
  expect(readyLines(s.logger)).toEqual([
    ['success', 'Dev Mode on · 1 of 1 web app (1.0s)'],
    [
      'notice',
      [
        'web apps:',
        '  web  https://main-svc-dev-web.web.test',
        `       ${s.web.proxies.get('web').url}`,
      ].join('\n'),
    ],
    [
      'aside',
      'The new IAM role can take up to 3 minutes to work; until then some web app requests run the deployed code.',
    ],
    ['aside', 'Press Ctrl+C to restore your web apps and exit.'],
  ])
  expect(s.logger.text()).not.toContain('0 of 0 functions')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.logger.text()).toContain('Dev Mode off · 1 web app restored')
})

test('dev status of a running session lists its web apps with their real and local URLs', async () => {
  const serviceDir = tempServiceDir()
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: {
      web: { dev: { command: 'npm run dev' } },
      admin: { dev: { command: 'npm run admin' } },
      docs: { dev: { command: 'npm run docs' } },
    },
    lambdaWeb: deployedWeb(['web', 'admin']),
    options: { 'local-only': ['admin'] },
    // admin's developer may not call its sls-dev-local endpoint.
    web: fakeWebDeps({ fetch: async () => ({ status: 403 }) }),
    state: null,
    serviceDir,
  })
  await s.whenReady
  const session = await connectToSession({ serviceDir })
  const { body } = await session.status()
  expect(body.web_apps).toEqual([
    {
      name: 'web',
      mode: 'dev',
      url: 'https://main-svc-dev-web.web.test',
      local_url: s.web.proxies.get('web').url,
    },
    {
      name: 'admin',
      mode: 'local',
      why: 'on its local URL only (--local-only); its real URL serves the deployed code; runs without its role credentials: your AWS credentials may not call its endpoint sls-dev-local (lambda:InvokeWebFunctionEndpoint)',
      notes: ['no_role_credentials'],
      url: 'https://main-svc-dev-admin.web.test',
      local_url: s.web.proxies.get('admin').url,
    },
    {
      name: 'docs',
      mode: 'skipped',
      reason: 'not_deployed',
      why: 'not deployed yet (run serverless deploy)',
    },
  ])
  // The denial is said once, as a warning.
  expect(
    s.logger.lines.filter(
      (line) =>
        line.level === 'warning' &&
        line.text.startsWith('The web app admin runs on this machine without'),
    ),
  ).toHaveLength(1)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a relayed web request is recorded, and dev replay sends it to the local server again', async () => {
  const serviceDir = tempServiceDir()
  const connection = fakeRelayConnection()
  const bridge = bridgeOf(connection)
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    connection,
    state: null,
    serviceDir,
  })
  await s.whenReady
  const id = 'b7a6c5d4-0000-4000-8000-000000000001'
  await bridge.offer({
    id,
    fn: 'svc-dev-web',
    method: 'GET',
    path: '/orders?X-Amz-Signature=secret-signature',
    headers: { authorization: 'Bearer secret-token', accept: 'text/html' },
    // The first request of an execution environment brings the role credentials.
    environment: ROLE,
  })
  const dir = path.join(serviceDir, '.serverless', 'dev')
  const until = Date.now() + 5_000
  const ends = () =>
    fs
      .readFileSync(path.join(dir, 'session.ndjson'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((record) => record.type === 'request.end')
  while (ends().length < 1) {
    if (Date.now() > until) throw new Error('no request.end')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  const [end] = ends()
  expect(end).toMatchObject({
    web_app: 'web',
    request_id: id,
    source: 'relay',
    outcome: 'answered',
    status_code: 200,
    path: '/orders?X-Amz-Signature=[redacted]',
  })
  // The request as the file keeps it (the fake server echoes the URL in its response body).
  const saved = JSON.parse(
    fs.readFileSync(path.join(serviceDir, end.file), 'utf8'),
  )
  expect(JSON.stringify(saved.request)).not.toContain('secret-')
  const session = await connectToSession({ serviceDir })
  // dev status counts it and names it, as it does an invocation.
  const status = await session.status()
  expect(status.body.requests).toEqual({ total: 1, failed: 0 })
  expect(status.body.last_request).toMatchObject({
    request_id: id,
    web_app: 'web',
    outcome: 'answered',
  })
  const answer = await session.replay(id, { kind: 'request', timeoutMs: 5_000 })
  expect(answer).toMatchObject({
    status: 200,
    body: {
      kind: 'request',
      replay_of: id,
      web_app: 'web',
      outcome: 'answered',
      status_code: 200,
      path: '/orders',
      note: 'redacted_values_omitted',
      omitted: ['authorization', 'X-Amz-Signature'],
      response: expect.objectContaining({
        body: expect.stringMatching(/^web GET \/orders /),
      }),
    },
  })
  expect(ends().map((record) => record.source)).toEqual(['relay', 'replay'])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('each web request that runs here prints one line when it ends', async () => {
  const serviceDir = tempServiceDir()
  const connection = fakeRelayConnection()
  const bridge = bridgeOf(connection)
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    connection,
    state: null,
    serviceDir,
  })
  await s.whenReady
  const notices = () =>
    s.logger.lines
      .filter((line) => line.level === 'notice')
      .map((line) => line.text)
  const ended = async (shortId) => {
    const until = Date.now() + 5_000
    while (!notices().some((text) => text.endsWith(`· ${shortId}`))) {
      if (Date.now() > until) throw new Error(`no end line for ${shortId}`)
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  const id = 'c1d2e3f4-0000-4000-8000-000000000001'
  await bridge.offer({
    id,
    fn: 'svc-dev-web',
    method: 'GET',
    path: '/orders?X-Amz-Signature=secret-signature',
    environment: ROLE,
  })
  await ended('c1d2e3f4')
  expect(notices()).toContainEqual(
    expect.stringMatching(
      /^← web web ── GET \/orders\?X-Amz-Signature=\[redacted\] \(200\) \d+ms · c1d2e3f4$/,
    ),
  )
  // No arrival line for a request that ends at once.
  expect(notices().some((text) => text.startsWith('→ web'))).toBe(false)
  // A replay names its source.
  const session = await connectToSession({ serviceDir })
  const answer = await session.replay(id, { kind: 'request', timeoutMs: 5_000 })
  const replayed = answer.body.request_id.slice(0, 8)
  expect(notices()).toContainEqual(
    expect.stringMatching(
      new RegExp(
        `^← web web ── GET /orders \\(200\\) \\d+ms · replay · ${replayed}$`,
      ),
    ),
  )
  // A relayed request the local server does not answer runs the deployed code, and says so.
  const closed = http.createServer()
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve))
  const closedPort = closed.address().port
  await new Promise((resolve) => closed.close(resolve))
  const server = s.web.servers.get('web')
  const port = server.port
  server.port = closedPort
  await bridge.offer({
    id: 'd5e6f7a8-0000-4000-8000-000000000002',
    fn: 'svc-dev-web',
    method: 'POST',
    path: '/orders',
  })
  await ended('d5e6f7a8')
  expect(notices()).toContainEqual(
    expect.stringMatching(
      /^← web web ── POST \/orders \(deployed code\) ── its local server could not be reached \(.+\) \d+ms · d5e6f7a8$/,
    ),
  )
  server.port = port
  // The secret of the signed URL is never printed.
  expect(s.logger.text()).not.toContain('secret-signature')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a session that keeps no record still prints its web requests', async () => {
  const connection = fakeRelayConnection()
  const bridge = bridgeOf(connection)
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    connection,
  })
  await s.whenReady
  await bridge.offer({
    id: 'e9f0a1b2-0000-4000-8000-000000000003',
    fn: 'svc-dev-web',
    method: 'GET',
    path: '/',
    environment: ROLE,
  })
  const until = Date.now() + 5_000
  while (!s.logger.text().includes('← web web ── GET / (200)')) {
    if (Date.now() > until) throw new Error('no end line')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(s.logger.text()).toMatch(
    /← web web ── GET \/ \(200\) \d+ms · e9f0a1b2/,
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a web app started from the entry of its prebuilt zip gets AWS_LAMBDA_HTTP_ENDPOINT; one from dev.command does not', async () => {
  const serviceDir = tempServiceDir()
  fs.writeFileSync(path.join(serviceDir, 'server.mjs'), '\n')
  const s = start({
    webApps: {
      zipped: {
        entry: 'server.mjs',
        package: { artifact: 'artifacts/web.zip' },
      },
      web: { dev: { command: 'npm run dev' } },
    },
    lambdaWeb: deployedWeb(['zipped', 'web']),
    state: null,
    serviceDir,
  })
  await s.whenReady
  const zipped = s.web.servers.get('zipped')
  expect(zipped.started).toMatchObject({ source: 'entry' })
  expect(zipped.env).toMatchObject({
    PORT: String(zipped.port),
    HOSTNAME: '127.0.0.1',
    AWS_LAMBDA_HTTP_ENDPOINT: `127.0.0.1:${zipped.port}`,
  })
  expect(s.web.servers.get('web').env).not.toHaveProperty(
    'AWS_LAMBDA_HTTP_ENDPOINT',
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a web app started from a source entry without a prebuilt zip gets no AWS_LAMBDA_HTTP_ENDPOINT', async () => {
  const serviceDir = tempServiceDir()
  fs.writeFileSync(path.join(serviceDir, 'server.mjs'), '\n')
  const s = start({
    webApps: { web: { entry: 'server.mjs' } },
    lambdaWeb: deployedWeb(['web']),
    state: null,
    serviceDir,
  })
  await s.whenReady
  const server = s.web.servers.get('web')
  expect(server.started).toMatchObject({ source: 'entry' })
  expect(server.env).not.toHaveProperty('AWS_LAMBDA_HTTP_ENDPOINT')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a server that does not listen shows local_server_down in its row and status', async () => {
  const serviceDir = tempServiceDir()
  const web = fakeWebDeps()
  const createServer = web.createServer
  web.createServer = (options) => {
    const server = createServer(options)
    // As the local server reports one that did not listen in time.
    const started = server.start
    server.start = jest.fn(async () => {
      await started()
      server.serving = false
      options.onStatus({
        serving: false,
        note: { reason: 'local_server_down', message: 'down' },
      })
    })
    return server
  }
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    web,
    state: null,
    serviceDir,
  })
  await s.whenReady
  const port = s.web.servers.get('web').port
  expect(s.logger.text()).toMatch(
    new RegExp(
      `web \\(web app\\)\\s+dev\\s+its server on this machine is not listening on port ${port}; requests run the deployed code until it is`,
    ),
  )
  const { body } = await (await connectToSession({ serviceDir })).status()
  expect(body.web_apps[0]).toMatchObject({
    name: 'web',
    mode: 'dev',
    notes: ['local_server_down'],
  })
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('nothing that can run: the table names the web apps, and the error names them too', async () => {
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: fakeLambdaWeb(),
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_NOTHING_TO_ATTACH',
    message:
      'No function or web app in this service can run in Dev Mode. The table above says why for each one.',
  })
  expect(s.logger.text()).toMatch(
    /web \(web app\)\s+skipped\s+not deployed yet \(run serverless deploy\)/,
  )
  expect(
    s.state.records.find((record) => record.type === 'web_app.mode'),
  ).toMatchObject({ web_app: 'web', mode: 'skipped', reason: 'not_deployed' })
})

test('web apps not selected are listed as such, without a Lambda Web call', async () => {
  const lambdaWeb = fakeLambdaWeb()
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: {} },
    lambdaWeb,
    options: { 'skip-web-app': ['web'] },
  })
  await s.whenReady
  expect(lambdaWeb.calls).toEqual([])
  expect(readyLines(s.logger)).toEqual([
    ['success', 'Dev Mode on · 1 of 1 function and 0 of 1 web app (1.0s)'],
    [
      'notice',
      [
        'Name           Mode      Why',
        'api            dev',
        'web (web app)  deployed  not selected (--skip-web-app)',
      ].join('\n'),
    ],
    [
      'aside',
      'The new IAM role can take up to 3 minutes to work; until then some invocations run the deployed code.',
    ],
    ['aside', 'Press Ctrl+C to restore your functions and exit.'],
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('--on-exit keep names the web apps it leaves in Dev Mode', async () => {
  const lambdaWeb = deployedWeb(['web'])
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
    options: { 'on-exit': 'keep' },
  })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.logger.text()).toContain(
    'Left 1 function and 1 web app in Dev Mode (--on-exit keep). They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
  )
  // Kept: main still serves the dev revision; restore-first or dev restore takes it back later.
  expect(
    lambdaWeb.state.get('svc-dev-web').endpoints.get('main').revisionWeights[0]
      .revisionId,
  ).not.toBe('rev-cfn')
})

test('the stop of a mixed session counts functions and web apps apart', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
  })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  const spinner = s.progress.log.lines
    .filter((line) => line.level === 'progress')
    .map((line) => line.text.split(' · ')[0])
  expect(spinner).toEqual(
    expect.arrayContaining([
      'Restoring 1 function and 1 web app',
      'Restoring 1 function and 1 web app (0/2)',
    ]),
  )
})

test('the plan a session shows (--approve, else the debug log) lists the web app changes and the trust it widens', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: {
      web: { dev: { command: 'npm run dev' } },
      admin: { dev: { command: 'npm run admin' } },
    },
    lambdaWeb: deployedWeb(['web', 'admin']),
    options: { 'local-only': ['admin'] },
    iam: narrowRole(),
  })
  await s.whenReady
  const plan = s.logger.lines.find(
    (line) => line.level === 'debug' && line.text.includes('web apps (no'),
  )?.text
  expect(plan).toContain(
    '  • let web apps use IAM role serverless-dev-broker-us-east-1 (adds their web functions to its trust policy)',
  )
  expect(plan).toContain(
    'These changes will be made to 2 web apps (no CloudFormation deploy):\n  • web: create revisions clone and dev, and the endpoint sls-dev-fallback on the clone; main sends its traffic to the dev revision\n  • admin (--local-only): create a dev revision and the endpoint sls-dev-local; main is not changed',
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a role whose trust already serves web apps is not widened in the plan', async () => {
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
  })
  await s.whenReady
  // The fake account had no role: the session created it, already widened.
  const plan = s.logger.lines.find(
    (line) => line.level === 'debug' && line.text.includes('web app (no'),
  )?.text
  expect(plan).toContain('create IAM role')
  expect(plan).not.toContain('let web apps use IAM role')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a web request running on this machine keeps a detached session from being idle, and its records are activity', async () => {
  const serviceDir = tempServiceDir()
  const connection = fakeRelayConnection()
  const bridge = bridgeOf(connection)
  let created = null
  let touches = 0
  let answer = null
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    connection,
    state: null,
    serviceDir,
    options: { 'session-process': true, 'idle-timeout': '60s' },
    web: fakeWebDeps({
      // Answers once the test says so.
      handler: (req, res) => {
        answer = () => {
          res.writeHead(200, { 'content-type': 'text/plain' })
          res.end('done')
        }
      },
    }),
    deps: {
      createIdle: (args) => {
        created = args
        return {
          start() {},
          touch: () => (touches += 1),
          stop() {},
        }
      },
    },
  })
  await s.whenReady
  expect(created.isBusy()).toBe(false)
  const before = touches
  const offered = bridge.offer({
    id: 'f1e2d3c4-0000-4000-8000-000000000009',
    fn: 'svc-dev-web',
    method: 'GET',
    path: '/slow',
    environment: ROLE,
  })
  const until = Date.now() + 5_000
  while (!answer) {
    if (Date.now() > until) throw new Error('the request did not arrive')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(created.isBusy()).toBe(true)
  answer()
  await offered
  while (created.isBusy()) {
    if (Date.now() > until) throw new Error('the request did not end')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  // request.start and request.end: two touches.
  expect(touches - before).toBe(2)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

/** Waits until `check()` holds. */
const eventually = async (check, ms = 5_000) => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('v turns detailed output on and off for web requests too, in a session of web apps alone', async () => {
  const connection = fakeRelayConnection()
  const bridge = bridgeOf(connection)
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    connection,
    tty: true,
    columns: 50,
  })
  await s.whenReady
  const long = `/orders/${'x'.repeat(80)}`
  const arrival = (shortId) =>
    s.logger.lines.find(
      (line) =>
        line.text.startsWith('← web web') && line.text.endsWith(shortId),
    )?.text
  await bridge.offer({
    id: 'a0000001-0000-4000-8000-000000000001',
    fn: 'svc-dev-web',
    method: 'GET',
    path: long,
    environment: ROLE,
  })
  await eventually(() => arrival('a0000001'))
  // Cut to the terminal's width.
  expect(arrival('a0000001')).not.toContain(long)
  s.proc.stdin.write('v')
  expect(s.logger.text()).toContain(DETAILED_ON)
  await bridge.offer({
    id: 'a0000002-0000-4000-8000-000000000002',
    fn: 'svc-dev-web',
    method: 'GET',
    path: long,
  })
  await eventually(() => arrival('a0000002'))
  expect(arrival('a0000002')).toContain(`GET ${long}`)
  s.proc.stdin.write('v')
  expect(s.logger.text()).toContain(DETAILED_OFF)
  await bridge.offer({
    id: 'a0000003-0000-4000-8000-000000000003',
    fn: 'svc-dev-web',
    method: 'GET',
    path: long,
  })
  await eventually(() => arrival('a0000003'))
  expect(arrival('a0000003')).not.toContain(long)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('v sets one detailed setting for the invocations and the web requests of a mixed session', async () => {
  const setDetailed = jest.fn((on) => on)
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    tty: true,
    options: { detailed: true },
    deps: {
      startLaptop: async () => ({ setDetailed, stop: async () => {} }),
    },
  })
  await s.whenReady
  s.proc.stdin.write('v')
  s.proc.stdin.write('v')
  expect(setDetailed.mock.calls).toEqual([[false], [true]])
  expect(
    s.logger.lines
      .filter((line) => [DETAILED_ON, DETAILED_OFF].includes(line.text))
      .map((line) => line.text),
  ).toEqual([DETAILED_OFF, DETAILED_ON])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('r restarts every web app server, also in a session of web apps alone', async () => {
  const s = start({
    webApps: {
      web: { dev: { command: 'npm run dev' } },
      admin: { dev: { command: 'npm run admin' } },
    },
    lambdaWeb: deployedWeb(['web', 'admin']),
    tty: true,
  })
  await s.whenReady
  s.proc.stdin.write('r')
  await eventually(() =>
    [...s.web.servers.values()].every(
      (server) => server.reload.mock.calls.length,
    ),
  )
  for (const server of s.web.servers.values()) {
    expect(server.reload.mock.calls).toEqual([[[]]])
  }
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('r in a mixed session reloads the functions and restarts the web app servers', async () => {
  const reloadNow = jest.fn(async () => {})
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    tty: true,
    deps: {
      startLaptop: async () => ({ reloadNow, stop: async () => {} }),
    },
  })
  await s.whenReady
  s.proc.stdin.write('r')
  await eventually(() => s.web.servers.get('web').reload.mock.calls.length)
  expect(reloadNow).toHaveBeenCalledTimes(1)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test("a web request's line takes the place of a function's reload spinner", async () => {
  const clearSpinner = jest.fn()
  const connection = fakeRelayConnection()
  const bridge = bridgeOf(connection)
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    connection,
    deps: {
      startLaptop: async () => ({ clearSpinner, stop: async () => {} }),
    },
  })
  await s.whenReady
  await bridge.offer({
    id: 'b0000001-0000-4000-8000-000000000001',
    fn: 'svc-dev-web',
    method: 'GET',
    path: '/',
    environment: ROLE,
  })
  await eventually(() => s.logger.text().includes('← web web ── GET / (200)'))
  // The request's one line.
  expect(clearSpinner.mock.calls.length).toBeGreaterThanOrEqual(1)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a session of web apps alone says what a save of the configuration file takes; a mixed one leaves it to the functions', async () => {
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
  })
  await s.whenReady
  expect(s.web.configWatches.map((watch) => watch.file)).toEqual([
    '/service/serverless.yml',
  ])
  await s.web.configWatches[0].onConfigChange(['/service/serverless.yml'])
  expect(
    s.logger.lines
      .filter((line) => line.level === 'warning')
      .map((l) => l.text),
  ).toContain(
    'serverless.yml changed: run "serverless deploy" for environment, IAM or web apps; restart "serverless dev" for a web app\'s new dev.command or entry.',
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.web.configWatches[0].close).toHaveBeenCalled()

  let laptopArgs
  const mixed = start({
    functions: { api: {} },
    live: { api: {} },
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
    deps: {
      startLaptop: async (args) => {
        laptopArgs = args
        return { stop: async () => {} }
      },
    },
  })
  await mixed.whenReady
  expect(mixed.web.configWatches).toEqual([])
  // The functions' line names the web apps too.
  expect(laptopArgs.webApps).toBe(true)
  // Their build output and entries are the web apps' to reload, not the functions'.
  expect(laptopArgs.webStarts).toEqual([
    expect.objectContaining({ source: 'config', command: 'npm run dev' }),
  ])
  mixed.proc.emit('SIGINT', 'SIGINT')
  expect(await mixed.result).toBe(0)
})

test("each line a web app's server writes names the web app", async () => {
  const s = start({
    webApps: {
      web: { dev: { command: 'npm run dev' } },
      admin: { dev: { command: 'npm run admin' } },
    },
    lambdaWeb: deployedWeb(['web', 'admin']),
  })
  await s.whenReady
  s.web.servers
    .get('web')
    .onLine({ webApp: 'web', stream: 'stdout', text: 'ready on 3000' })
  s.web.servers
    .get('admin')
    .onLine({ webApp: 'admin', stream: 'stderr', text: 'Error: boom' })
  expect(s.logger.lines).toContainEqual({
    level: 'notice',
    text: 'web web │ ready on 3000',
  })
  expect(s.logger.lines).toContainEqual({
    level: 'notice',
    text: 'web admin │ Error: boom',
  })
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test("a blank line a web app's server writes prints nothing", async () => {
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb: deployedWeb(['web']),
  })
  await s.whenReady
  const server = s.web.servers.get('web')
  for (const text of ['', '   ', '\t', '\u001b[0m', '\u001b[2m  \u001b[22m']) {
    server.onLine({ webApp: 'web', stream: 'stdout', text })
  }
  server.onLine({ webApp: 'web', stream: 'stdout', text: '  ✓ Ready in 1.2s' })
  const serverLines = s.logger.lines.filter(({ text }) =>
    text.startsWith('web web │'),
  )
  expect(serverLines).toEqual([
    { level: 'notice', text: 'web web │   ✓ Ready in 1.2s' },
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('an entry on a Node.js other than the deployed one is said, as for a function; a dev.command is not', async () => {
  const serviceDir = tempServiceDir()
  fs.writeFileSync(path.join(serviceDir, 'server.mjs'), '\n')
  const s = start({
    webApps: {
      site: { entry: 'server.mjs' },
      web: { dev: { command: 'npm run dev' } },
    },
    lambdaWeb: deployedWeb(['site', 'web']),
    web: fakeWebDeps({ nodeVersion: '26.12.1' }),
    state: null,
    serviceDir,
  })
  await s.whenReady
  expect(
    s.logger.lines.filter(
      (line) => line.level === 'warning' && line.text.startsWith('Node.js'),
    ),
  ).toEqual([
    {
      level: 'warning',
      text: 'Node.js on this machine is 26.12.1; web app site is deployed on nodejs24.x. Results can differ: use Node.js 24 to match.',
    },
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('NODE_OPTIONS settings a web app server does not get here are a debug line, once', async () => {
  const lambdaWeb = deployedWeb(['web'])
  lambdaWeb.state
    .get('svc-dev-web')
    .revisions.get('rev-cfn').serviceConfig.environmentVariables.NODE_OPTIONS =
    '--require dd-trace/init --max-old-space-size=512'
  const s = start({
    webApps: { web: { dev: { command: 'npm run dev' } } },
    lambdaWeb,
  })
  await s.whenReady
  expect(
    s.logger.lines.filter(
      (line) => line.level === 'debug' && line.text.includes('NODE_OPTIONS'),
    ),
  ).toEqual([
    {
      level: 'debug',
      text: expect.stringMatching(
        /^Dev Mode applies only the runtime settings and the service directory preloads of the NODE_OPTIONS of the web app web on this machine; left out: .*--require/,
      ),
    },
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test("a web request keeps the session busy only up to its web app's deployed timeout, or 15 minutes", async () => {
  let time = 1_790_000_000_000
  const runtime = createWebRuntime({
    serverless: { serviceDir: '/service' },
    region: 'us-east-1',
    logger: fakeLog(),
    timers: countingTimers(),
    now: () => time,
    processRef: { env: {}, pid: 1 },
    deps: fakeWebDeps(),
  })
  const rows = [
    { webApp: 'web', mode: 'dev', notes: [] },
    { webApp: 'docs', mode: 'dev', notes: [] },
  ]
  const details = new Map([
    ['web', { functionName: 'svc-dev-web', start: { source: 'config' } }],
    ['docs', { functionName: 'svc-dev-docs', start: { source: 'config' } }],
  ])
  const { recorder } = runtime.relayOptions({ rows, details })
  await runtime.start({
    rows,
    details,
    results: new Map([
      ['web', { deployedVariables: {}, deployedTimeoutSeconds: 30 }],
      // No timeout known: Lambda's limit.
      ['docs', { deployedVariables: {} }],
    ]),
  })
  // An event stream on each: open, and never ended.
  recorder.start({ id: 'a', key: 'web' })
  recorder.start({ id: 'b', key: 'docs' })
  expect(runtime.inFlight()).toBe(2)
  time += 29_999
  expect(runtime.inFlight()).toBe(2)
  time += 1
  expect(runtime.inFlight()).toBe(1)
  time += MAX_REQUEST_BUSY_MS - 30_000
  expect(runtime.inFlight()).toBe(0)
  // A request that ends stops counting at once.
  recorder.start({ id: 'c', key: 'web' })
  expect(runtime.inFlight()).toBe(1)
  recorder.end({ id: 'c', key: 'web' })
  expect(runtime.inFlight()).toBe(0)
  expect(MAX_REQUEST_BUSY_MS).toBe(900_000)
  await runtime.stop()
})
