import { afterEach, describe, expect, test } from '@jest/globals'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import net from 'net'
import {
  LOCAL_SERVER_DOWN,
  createLocalWebServer,
  createWebAppCredentials,
  restartDelay,
  scriptPath,
} from '../../../../../../../lib/plugins/aws/dev/web/local-server.js'
import { webAppEnvironment } from '../../../../../../../lib/plugins/aws/dev/local/environment.js'
import { createCredentialsServer } from '../../../../../../../lib/plugins/aws/dev/local/credentials.js'
import { baseEnv, cleanTempDirs, tempDir, write } from '../local/helpers.js'

const NODE = JSON.stringify(process.execPath)
const FILES = {
  config: '/tmp/s/aws-config',
  credentials: '/tmp/s/aws-credentials',
  boto: '/tmp/s/boto-config',
}
const LOOPBACK = {
  uri: 'http://127.0.0.1:4000/credentials/w1',
  token: 'loopback-token',
}

const servers = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop()
  cleanTempDirs()
})

const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (check, ms = 10_000) => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting')
    await settle(10)
  }
}
const canConnect = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

const quietLogger = () => {
  const lines = { notice: [], warning: [], debug: [] }
  return {
    lines,
    notice: (text) => lines.notice.push(text),
    warning: (text) => lines.warning.push(text),
    debug: (text) => lines.debug.push(text),
  }
}
const recordingEvents = () => {
  const emitted = []
  return { emitted, emit: (type, fields) => emitted.push([type, fields]) }
}
/** Real timers that remember every delay they were asked for. */
const recordingTimers = () => {
  const delays = []
  return {
    delays,
    setTimeout: (fn, ms) => {
      delays.push(ms)
      return setTimeout(fn, ms)
    },
    clearTimeout: (id) => clearTimeout(id),
  }
}
/** A chokidar stand-in: `change(file)` reports a saved file. */
const fakeWatch = () => {
  const emitter = new EventEmitter()
  const watch = () => {
    setImmediate(() => emitter.emit('ready'))
    return {
      on: (...args) => emitter.on(...args),
      once: (...args) => emitter.once(...args),
      close: async () => {},
    }
  }
  return { watch, change: (file) => emitter.emit('all', 'change', file) }
}

const LISTEN = `require('http').createServer((q, s) => s.end(process.env.HOSTNAME + ' ' + process.pid)).listen(Number(process.env.PORT), process.env.HOSTNAME)`

const make = (over = {}) => {
  const logger = quietLogger()
  const events = recordingEvents()
  const timers = over.timers ?? recordingTimers()
  const server = createLocalWebServer({
    key: 'web',
    serviceDir: over.serviceDir ?? tempDir('sls-dev-web-server-'),
    env: ({ port, hostname }) => ({
      ...baseEnv(),
      PORT: String(port),
      HOSTNAME: hostname,
    }),
    logger,
    events,
    timers,
    probeIntervalMs: 20,
    ...over,
  })
  servers.push(server)
  return { server, logger, events, timers }
}

describe('webAppEnvironment', () => {
  test('PORT and HOSTNAME set, AWS key variables absent, credentials URI present', () => {
    const { env } = webAppEnvironment({
      machine: {
        PATH: '/usr/bin',
        HOME: '/Users/alice',
        AWS_ACCESS_KEY_ID: 'AKIAMACHINE',
        AWS_SECRET_ACCESS_KEY: 'machine-secret',
        AWS_PROFILE: 'mine',
        AWS_SESSION_TOKEN: 'machine-token',
      },
      deployed: {
        TABLE: 'orders',
        AWS_ACCESS_KEY_ID: 'AKIADEPLOYED',
        AWS_LAMBDA_RUNTIME_API: '169.254.100.1:9001',
        _HANDLER: 'index.handler',
        SLS_DEV_SESSION: 's_0123',
      },
      credentials: LOOPBACK,
      configFiles: FILES,
      port: 4321,
      serviceDir: '/svc',
      platform: 'linux',
    })
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/Users/alice',
      TABLE: 'orders',
      PORT: '4321',
      HOSTNAME: '127.0.0.1',
      AWS_CONTAINER_CREDENTIALS_FULL_URI: LOOPBACK.uri,
      AWS_CONTAINER_AUTHORIZATION_TOKEN: LOOPBACK.token,
      AWS_SHARED_CREDENTIALS_FILE: FILES.credentials,
      AWS_CONFIG_FILE: FILES.config,
    })
    for (const name of [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'AWS_PROFILE',
      'AWS_LAMBDA_RUNTIME_API',
      '_HANDLER',
      'LAMBDA_TASK_ROOT',
      'SLS_DEV_SESSION',
      'AWS_LAMBDA_HTTP_ENDPOINT',
    ]) {
      expect(env).not.toHaveProperty(name)
    }
  })

  test('a prebuilt zip gets AWS_LAMBDA_HTTP_ENDPOINT', () => {
    const { env } = webAppEnvironment({
      machine: {},
      deployed: { AWS_LAMBDA_HTTP_ENDPOINT: '0.0.0.0:8080' },
      credentials: LOOPBACK,
      configFiles: FILES,
      port: 4321,
      hostname: '127.0.0.1',
      prebuiltZip: true,
      platform: 'linux',
    })
    expect(env.AWS_LAMBDA_HTTP_ENDPOINT).toBe('127.0.0.1:4321')
  })

  test('the developer keys stay out on Windows whatever their case', () => {
    const { env } = webAppEnvironment({
      machine: { Path: 'C:\\Windows', aws_access_key_id: 'AKIAMACHINE' },
      deployed: { port: '80' },
      credentials: LOOPBACK,
      configFiles: FILES,
      port: 4321,
      platform: 'win32',
    })
    expect(Object.keys(env).map((name) => name.toUpperCase())).not.toContain(
      'AWS_ACCESS_KEY_ID',
    )
    expect(env.PORT).toBe('4321')
    expect(env).not.toHaveProperty('port')
  })
})

describe('createWebAppCredentials', () => {
  test('serves the role credentials the relay forwards, newest first', async () => {
    const credentialsServer = createCredentialsServer()
    await credentialsServer.listen()
    try {
      const credentials = createWebAppCredentials({ credentialsServer })
      const { uri, token } = credentials.register('web')
      const read = async () =>
        fetch(uri, { headers: { authorization: token } }).then(
          async (response) => ({
            status: response.status,
            body: await response.json(),
          }),
        )
      expect((await read()).status).toBe(503)
      credentials.update('web', {
        AWS_ACCESS_KEY_ID: 'ASIAOLD',
        AWS_SECRET_ACCESS_KEY: 'old-secret',
        AWS_SESSION_TOKEN: 'old-token',
      })
      credentials.update('web', {
        AWS_ACCESS_KEY_ID: 'ASIANEW',
        AWS_SECRET_ACCESS_KEY: 'new-secret',
        AWS_SESSION_TOKEN: 'new-token',
      })
      expect(await read()).toMatchObject({
        status: 200,
        body: {
          AccessKeyId: 'ASIANEW',
          SecretAccessKey: 'new-secret',
          Token: 'new-token',
        },
      })
      // A web app that is not registered is ignored.
      expect(() => credentials.update('other', {})).not.toThrow()
      credentials.unregister('web')
      expect((await read()).status).toBe(404)
    } finally {
      await credentialsServer.close()
    }
  })
})

describe('restartDelay', () => {
  test('doubles from the first delay and stops at the cap', () => {
    const backoff = { initialMs: 1_000, maxMs: 30_000 }
    expect(
      [0, 1, 2, 3, 4, 5, 6, 40].map((n) => restartDelay(n, backoff)),
    ).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
  })
})

describe('scriptPath', () => {
  test('puts node_modules/.bin of the directory and its parents first', () => {
    const env = scriptPath(
      { PATH: '/usr/bin' },
      { cwd: '/repo/apps/web', platform: 'linux' },
    )
    expect(env.PATH).toBe(
      [
        '/repo/apps/web/node_modules/.bin',
        '/repo/apps/node_modules/.bin',
        '/repo/node_modules/.bin',
        '/node_modules/.bin',
        '/usr/bin',
      ].join(':'),
    )
  })

  test('keeps the name Windows stores it under', () => {
    const env = scriptPath(
      { Path: 'C:\\Windows' },
      { cwd: 'C:\\repo', platform: 'win32' },
    )
    expect(env).toEqual({
      Path: 'C:\\repo\\node_modules\\.bin;C:\\node_modules\\.bin;C:\\Windows',
    })
  })
})

describe('createLocalWebServer', () => {
  test('a command that listens on PORT is ready and serving', async () => {
    const { server, events } = make({
      start: { source: 'config', command: `${NODE} -e "${LISTEN}"` },
    })
    expect(server.serving).toBe(false)
    await server.start()
    expect(await server.ready).toBe(true)
    expect(server.serving).toBe(true)
    expect(server.note).toBeNull()
    expect(Number.isInteger(server.port) && server.port > 0).toBe(true)
    const text = await fetch(`http://127.0.0.1:${server.port}/`).then((r) =>
      r.text(),
    )
    expect(text.startsWith('127.0.0.1 ')).toBe(true)
    expect(events.emitted).toContainEqual([
      'server.started',
      { web_app: 'web', port: server.port, source: 'config' },
    ])
  })

  test('stop ends the whole process tree the command started', async () => {
    const dir = tempDir('sls-dev-web-tree-')
    write(dir, { 'listen.js': LISTEN })
    // A shell that starts the server as its child and waits for it.
    const { server, events } = make({
      serviceDir: dir,
      start: {
        source: 'config',
        command: `${NODE} listen.js & wait`,
        cwd: dir,
      },
    })
    await server.start()
    expect(await server.ready).toBe(true)
    const port = server.port
    await server.stop()
    expect(server.serving).toBe(false)
    await waitFor(() =>
      events.emitted.some(([type]) => type === 'server.exited'),
    )
    // The listener, a grandchild of the CLI, is gone too.
    let open = true
    for (let i = 0; i < 50 && open; i++) {
      open = await canConnect(port)
      if (open) await settle(20)
    }
    expect(open).toBe(false)
  })

  test('command that never listens: ready resolves false after readyTimeoutMs and the row note is local_server_down', async () => {
    const { server, events, logger } = make({
      start: {
        source: 'config',
        command: `${NODE} -e "setInterval(() => {}, 1000)"`,
      },
      readyTimeoutMs: 300,
    })
    const startedAt = Date.now()
    await server.start()
    expect(await server.ready).toBe(false)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(250)
    expect(server.serving).toBe(false)
    expect(server.note).toEqual({
      reason: LOCAL_SERVER_DOWN,
      message: `web's server on this machine isn't listening on port ${server.port}; requests run the deployed code until it is.`,
    })
    expect(logger.lines.warning.join('\n')).toContain(
      `isn't listening on port ${server.port}`,
    )
    await server.stop()
    expect(events.emitted.map(([type]) => type)).toContain('server.exited')
  })

  test('a server that starts listening late is serving from then on', async () => {
    const late = `setTimeout(() => { ${LISTEN} }, 400)`
    const { server } = make({
      start: { source: 'config', command: `${NODE} -e "${late}"` },
      readyTimeoutMs: 100,
    })
    await server.start()
    expect(await server.ready).toBe(false)
    expect(server.note?.reason).toBe(LOCAL_SERVER_DOWN)
    await waitFor(() => server.serving)
    expect(server.note).toBeNull()
  })

  test('command that exits at once: server.exited emitted, restart backs off', async () => {
    const timers = recordingTimers()
    const { server, events, logger } = make({
      start: { source: 'config', command: `${NODE} -e "process.exit(3)"` },
      timers,
      restartBackoff: { initialMs: 25, maxMs: 100 },
    })
    await server.start()
    expect(await server.ready).toBe(false)
    const exits = () =>
      events.emitted.filter(([type]) => type === 'server.exited')
    await waitFor(() => exits().length >= 5)
    await server.stop()
    expect(exits()[0]).toEqual([
      'server.exited',
      { web_app: 'web', code: 3, signal: null },
    ])
    expect(server.serving).toBe(false)
    expect(server.note?.reason).toBe(LOCAL_SERVER_DOWN)
    // Each restart waits twice as long as the one before, up to the cap.
    const restarts = timers.delays.filter((ms) => [25, 50, 100].includes(ms))
    expect(restarts.slice(0, 5)).toEqual([25, 50, 100, 100, 100])
    // Said once, not once per restart.
    expect(
      logger.lines.warning.filter((line) => line.includes('exited')),
    ).toHaveLength(1)
    const count = exits().length
    await settle(200)
    expect(exits().length).toBe(count)
  })

  test('an entry runs from source with Node.js and restarts on a change', async () => {
    const dir = tempDir('sls-dev-web-entry-')
    write(dir, {
      'server.mjs': `import http from 'http'\n${LISTEN.replace("require('http')", 'http')}\n`,
    })
    const watcher = fakeWatch()
    const { server, events } = make({
      serviceDir: dir,
      start: { source: 'entry', entryFile: `${dir}/server.mjs`, cwd: dir },
      deps: { watch: watcher.watch },
    })
    await server.start()
    expect(await server.ready).toBe(true)
    const first = await fetch(`http://127.0.0.1:${server.port}/`).then((r) =>
      r.text(),
    )
    watcher.change(`${dir}/server.mjs`)
    await waitFor(
      () =>
        events.emitted.filter(([type]) => type === 'server.started').length ===
        2,
    )
    expect(await server.ready).toBe(true)
    const second = await fetch(`http://127.0.0.1:${server.port}/`).then((r) =>
      r.text(),
    )
    expect(second).not.toBe(first)
    expect(
      events.emitted.filter(([type]) => type === 'server.started'),
    ).toEqual([
      [
        'server.started',
        { web_app: 'web', port: server.port, source: 'entry' },
      ],
      [
        'server.started',
        { web_app: 'web', port: server.port, source: 'entry' },
      ],
    ])
  })

  test("an entry's watcher keeps the functions' standing rules: the Framework's output is left out", async () => {
    const dir = tempDir('sls-dev-web-ignored-')
    write(dir, {
      'server.mjs': `import http from 'http'\n${LISTEN.replace("require('http')", 'http')}\n`,
    })
    const watcher = fakeWatch()
    const options = []
    const { server } = make({
      serviceDir: dir,
      start: { source: 'entry', entryFile: `${dir}/server.mjs`, cwd: dir },
      deps: {
        watch: (watched, given) => {
          options.push(given)
          return watcher.watch()
        },
      },
    })
    await server.start()
    expect(await server.ready).toBe(true)
    const [{ ignored }] = options
    expect(ignored(`${dir}/node_modules/x/index.js`)).toBe(true)
    expect(ignored(`${dir}/.serverless/dev/a.json`)).toBe(true)
    expect(ignored(`${dir}/server.mjs`)).toBe(false)
  })

  test('a save is a reload: its records name the web app, and the reloaded line follows once it listens', async () => {
    const dir = tempDir('sls-dev-web-reload-')
    write(dir, {
      'server.mjs': `import http from 'http'\n${LISTEN.replace("require('http')", 'http')}\n`,
    })
    const watcher = fakeWatch()
    const { server, events, logger } = make({
      serviceDir: dir,
      start: { source: 'entry', entryFile: `${dir}/server.mjs`, cwd: dir },
      deps: { watch: watcher.watch },
    })
    await server.start()
    expect(await server.ready).toBe(true)
    watcher.change(`${dir}/server.mjs`)
    await waitFor(() => events.emitted.some(([type]) => type === 'reload.end'))
    const reloads = events.emitted.filter(([type]) =>
      type.startsWith('reload.'),
    )
    expect(reloads).toEqual([
      ['reload.start', { files: 1, web_apps: ['web'] }],
      ['reload.end', { ok: true, web_apps: ['web'], ms: expect.any(Number) }],
    ])
    expect(logger.lines.notice).toContainEqual(
      expect.stringMatching(/^⟳ Reloaded web web \(\d+ms\)$/),
    )
  })

  test('a reload whose server does not listen again says so in its record, with no reloaded line', async () => {
    const { server, events, logger } = make({
      start: {
        source: 'config',
        command: `${NODE} -e "setInterval(() => {}, 1000)"`,
      },
      readyTimeoutMs: 100,
    })
    await server.start()
    expect(await server.ready).toBe(false)
    expect(await server.reload()).toBe(false)
    expect(
      events.emitted.filter(([type]) => type.startsWith('reload.')),
    ).toEqual([
      ['reload.start', { files: 0, web_apps: ['web'] }],
      [
        'reload.end',
        {
          ok: false,
          web_apps: ['web'],
          ms: expect.any(Number),
          error: `web's server on this machine is not listening on port ${server.port}`,
        },
      ],
    ])
    expect(
      logger.lines.notice.filter((line) => line.includes('Reloaded')),
    ).toEqual([])
  })

  test('a reload before the start or after the stop does nothing', async () => {
    const { server, events } = make({
      start: { source: 'config', command: `${NODE} -e "${LISTEN}"` },
    })
    expect(await server.reload()).toBe(false)
    await server.start()
    await server.stop()
    expect(await server.reload()).toBe(false)
    expect(
      events.emitted.filter(([type]) => type.startsWith('reload.')),
    ).toEqual([])
  })

  test('a server that cannot start is said once and tried again', async () => {
    const { server, events, logger } = make({
      start: {
        source: 'config',
        command: 'anything',
        cwd: '/no/such/directory/for/dev/mode',
      },
      restartBackoff: { initialMs: 25, maxMs: 100 },
    })
    await server.start()
    expect(await server.ready).toBe(false)
    await waitFor(
      () =>
        events.emitted.filter(([type]) => type === 'server.exited').length >= 2,
    )
    await server.stop()
    expect(events.emitted).toContainEqual([
      'server.exited',
      { web_app: 'web', code: null, signal: null },
    ])
    expect(logger.lines.warning).toEqual([
      expect.stringContaining("web's server on this machine could not start"),
    ])
  })

  test('saves in a row restart the server without waiting for it to listen', async () => {
    const dir = tempDir('sls-dev-web-saves-')
    write(dir, { 'idle.mjs': 'setInterval(() => {}, 1000)\n' })
    const watcher = fakeWatch()
    const { server, events } = make({
      serviceDir: dir,
      start: { source: 'entry', entryFile: `${dir}/idle.mjs`, cwd: dir },
      readyTimeoutMs: 5_000,
      deps: { watch: watcher.watch },
    })
    const starts = () =>
      events.emitted.filter(([type]) => type === 'server.started').length
    await server.start()
    const startedAt = Date.now()
    watcher.change(`${dir}/idle.mjs`)
    await waitFor(() => starts() === 2)
    await settle(300)
    watcher.change(`${dir}/idle.mjs`)
    await waitFor(() => starts() === 3)
    expect(Date.now() - startedAt).toBeLessThan(4_000)
  })

  test('a restart never reports the server down', async () => {
    const statuses = []
    const { server } = make({
      start: { source: 'config', command: `${NODE} -e "${LISTEN}"` },
      onStatus: (status) => statuses.push(status),
    })
    await server.start()
    expect(await server.ready).toBe(true)
    expect(await server.restart()).toBe(true)
    expect(statuses).toEqual([
      { serving: true, note: null },
      { serving: false, note: null },
      { serving: true, note: null },
    ])
    expect(server.note).toBeNull()
  })

  test("a crash's last output is shown before its exit is", async () => {
    const order = []
    // Node.js can tell a process's exit before the rest of its output was read: `close` follows.
    const child = Object.assign(new EventEmitter(), {
      pid: 4242,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => {},
    })
    const { server } = make({
      start: { source: 'config', command: 'crash' },
      events: { emit: (type) => order.push(type) },
      logger: {
        ...quietLogger(),
        warning: (text) => order.push(`warning: ${text}`),
      },
      onLine: ({ stream, text }) => order.push(`${stream}: ${text}`),
      connect: async () => false,
      restartBackoff: { initialMs: 60_000, maxMs: 60_000 },
      deps: { spawn: () => child, signalProcess: () => {} },
    })
    await server.start()
    child.stderr.write('Error: boom\n')
    await settle()
    child.emit('exit', 1, null)
    child.stderr.write('    at main (server.js:1:1)\n')
    child.stderr.end()
    child.stdout.end()
    await settle()
    child.emit('close', 1, null)
    await waitFor(() => order.includes('server.exited'))
    await server.stop()
    expect(order).toEqual([
      'server.started',
      'stderr: Error: boom',
      'stderr:     at main (server.js:1:1)',
      'server.exited',
      expect.stringMatching(
        /^warning: web's server on this machine exited with code 1/,
      ),
    ])
  })

  test('stop before start and a second stop are harmless', async () => {
    const { server } = make({
      start: { source: 'config', command: `${NODE} -e "${LISTEN}"` },
    })
    await server.stop()
    await server.start()
    expect(await server.ready).toBe(false)
    await server.stop()
  })
})
