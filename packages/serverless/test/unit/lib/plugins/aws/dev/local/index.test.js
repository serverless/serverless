import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { pathToFileURL, fileURLToPath } from 'url'
import { nodeAdapter } from '../../../../../../../lib/plugins/aws/dev/local/adapters/node.js'
import {
  baseEnv,
  cleanTempDirs,
  run,
  tempDir,
  waitFor,
  write,
} from './helpers.js'
import { startLaptopRuntime } from '../../../../../../../lib/plugins/aws/dev/local/index.js'
import { countingTimers, fakeLog, recordingProgress } from '../attach/fakes.js'
import {
  guardedLogger,
  guardedProgress,
} from '../../../../../../../lib/plugins/aws/dev/attach/session-support.js'
import {
  createOpener,
  createSealer,
  topicsOf,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'
import { runWithoutColor } from '../without-color.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

const serviceDir = path.join(path.sep, 'svc')
const LOCAL = {
  node: { available: true, command: 'node', version: '24.21.0' },
  python: { available: true, command: 'python3', version: '3.13.8' },
}
const live = (Runtime, Timeout = 6) => ({ Runtime, Timeout })
const fakeServerless = ({
  functions = {
    api: { handler: 'handler.api' },
    py: { handler: 'app.handler' },
  },
  configurationInput = {},
} = {}) => ({
  serviceDir,
  configurationFilename: 'serverless.yml',
  configurationInput,
  service: { provider: {}, getFunction: (key) => functions[key] },
  pluginManager: { plugins: [] },
})
const fakeRuntime = () => {
  const runtime = {
    started: 0,
    stopped: 0,
    reloads: [],
    async start() {
      runtime.started += 1
    },
    async stop() {
      runtime.stopped += 1
    },
    reload(keys) {
      runtime.reloads.push(keys)
    },
  }
  return runtime
}
// Like chokidar, the fake ends its first scan soon after it starts, unless told to never end it.
const fakeWatch = ({ scans = true } = {}) => {
  const emitter = Object.assign(new EventEmitter(), {
    closed: false,
    async close() {
      this.closed = true
    },
  })
  const watch = jest.fn(() => {
    if (scans) setImmediate(() => emitter.emit('ready'))
    return emitter
  })
  return { emitter, watch }
}

jest.setTimeout(60_000)
const started = []
afterEach(async () => {
  for (const { laptop, timers } of started.splice(0)) {
    await laptop.stop()
    expect(timers.live()).toBe(0)
  }
  cleanTempDirs()
})

const start = async ({
  functions = [
    { key: 'api', live: live('nodejs24.x') },
    { key: 'py', live: live('python3.13', 30) },
  ],
  serverless = fakeServerless(),
  build = { ok: true, ms: 12 },
  runtime = fakeRuntime(),
  options = {},
  deps = {},
  events,
  recorder,
  onSpinnerDone,
  spinner,
  webStarts,
  scans = true,
  logger = fakeLog(),
} = {}) => {
  const timers = countingTimers()
  const { emitter, watch } = fakeWatch({ scans })
  const builds = []
  // Like the dev build, a good build reports the functions it built unless the result says.
  const createBuild = jest.fn(({ functionKeys }) => ({
    async run() {
      builds.push(functionKeys)
      const result = await (typeof build === 'function'
        ? build(builds.length)
        : build)
      return {
        built: result.ok ? (result.functions ?? functionKeys) : [],
        ...result,
      }
    },
  }))
  const createRuntime = jest.fn(() => runtime)
  let laptop
  try {
    laptop = await startLaptopRuntime({
      serverless,
      options,
      functions,
      localRuntimes: LOCAL,
      logger,
      timers,
      processRef: new EventEmitter(),
      env: {},
      ...(events && { events }),
      ...(recorder && { recorder }),
      ...(onSpinnerDone && { onSpinnerDone }),
      ...(spinner && { spinner }),
      ...(webStarts && { webStarts }),
      deps: {
        createRuntime,
        createBuild,
        watch,
        // The reload spinner's texts land in the logger's lines.
        progress: recordingProgress(logger),
        ...deps,
      },
    })
  } catch (error) {
    expect(timers.live()).toBe(0)
    throw error
  }
  started.push({ laptop, timers })
  return {
    laptop,
    logger,
    emitter,
    watch,
    builds,
    createBuild,
    createRuntime,
    runtime,
  }
}

describe('startLaptopRuntime', () => {
  test('starts the runtime with one entry per function, from the deployed configuration', async () => {
    const { createRuntime, runtime } = await start()
    expect(runtime.started).toBe(1)
    const [{ functions, serviceDir: dir }] = createRuntime.mock.calls[0]
    expect(dir).toBe(serviceDir)
    expect([...functions.keys()]).toEqual(['api', 'py'])
    expect(functions.get('py')).toMatchObject({
      key: 'py',
      runtime: 'python3.13',
      timeout: 30,
      local: LOCAL.python,
      config: { handler: 'app.handler' },
    })
    expect(functions.get('api').adapter.name).toBe('node')
  })

  test('says once at start-up which flags of the deployed NODE_OPTIONS do not run on this machine, by name only', async () => {
    const withEnv = (Runtime, Variables) => ({
      Runtime,
      Timeout: 6,
      Environment: { Variables },
    })
    const { logger } = await start({
      functions: [
        {
          key: 'api',
          live: withEnv('nodejs24.x', {
            NODE_OPTIONS:
              '--require /opt/otel/register.js --inspect=0.0.0.0:9229 --max-old-space-size=256',
          }),
        },
        {
          key: 'worker',
          live: withEnv('nodejs22.x', {
            NODE_OPTIONS: '--import=data:text/javascript,secret --require=x',
          }),
        },
        {
          key: 'tuned',
          live: withEnv('nodejs24.x', { NODE_OPTIONS: '--enable-source-maps' }),
        },
        // Not a Node.js handler: its NODE_OPTIONS is not the handler's.
        {
          key: 'py',
          live: withEnv('python3.13', { NODE_OPTIONS: '--require y' }),
        },
      ],
      serverless: fakeServerless({
        functions: {
          api: { handler: 'a.handler' },
          worker: { handler: 'w.handler' },
          tuned: { handler: 't.handler' },
          py: { handler: 'app.handler' },
        },
      }),
    })
    const notices = logger.lines.filter(
      (line) => line.level === 'debug' && line.text.includes('NODE_OPTIONS'),
    )
    expect(notices).toEqual([
      {
        level: 'debug',
        text: 'Dev Mode leaves --inspect and --import out of the deployed NODE_OPTIONS of api and worker on this machine: only runtime settings and preloads of your own files in the service directory apply here, not other flags that load code or open a debugger. It also leaves out --require of the deployed NODE_OPTIONS of worker, which loads a package: packages are not loaded from the deployed configuration; load them from a file in your service, such as ./instrumentation.js. It also leaves out --require of the deployed NODE_OPTIONS of api, which does not name a file in the service directory.',
      },
    ])
    for (const secret of ['/opt/otel', '0.0.0.0', 'data:', 'secret', 'py']) {
      expect(notices[0].text).not.toContain(secret)
    }
    // The warning names them only; the reasons are the debug line above.
    expect(logger.lines.filter((line) => line.level === 'warning')).toEqual([
      {
        level: 'warning',
        text: 'Not applied on this machine: --inspect, --import and --require (api and worker); load packages from a file in your service, such as ./instrumentation.js.',
      },
    ])
  })

  test('names the deployed library loader variables that do not apply on this machine in the same line, by name only', async () => {
    const withEnv = (Runtime, Variables) => ({
      Runtime,
      Timeout: 6,
      Environment: { Variables },
    })
    const { logger } = await start({
      functions: [
        {
          key: 'api',
          live: withEnv('nodejs24.x', {
            NODE_OPTIONS: '--require /opt/x.js',
            LD_PRELOAD: '/opt/lib/libhook.so',
          }),
        },
        {
          key: 'py',
          live: withEnv('python3.13', {
            DYLD_INSERT_LIBRARIES: '/opt/lib/hook.dylib',
          }),
        },
      ],
    })
    const notices = logger.lines.filter(
      (line) =>
        line.level === 'debug' && line.text.startsWith('Dev Mode leaves'),
    )
    expect(notices).toEqual([
      {
        level: 'debug',
        text: "Dev Mode leaves --require out of the deployed NODE_OPTIONS of api on this machine: it does not name a file in the service directory. It also leaves out LD_PRELOAD and DYLD_INSERT_LIBRARIES of api and py: library loader settings made for Lambda's file system do not apply here.",
      },
    ])
    expect(notices[0].text).not.toContain('/opt/lib')
    const { logger: variablesOnly } = await start({
      functions: [
        {
          key: 'py',
          live: withEnv('python3.13', { LD_LIBRARY_PATH: '/opt/lib' }),
        },
      ],
    })
    expect(
      variablesOnly.lines.filter(
        (line) =>
          line.level === 'debug' && line.text.startsWith('Dev Mode leaves'),
      ),
    ).toEqual([
      {
        level: 'debug',
        text: "Dev Mode leaves LD_LIBRARY_PATH of py out on this machine: library loader settings made for Lambda's file system do not apply here.",
      },
    ])
  })

  test('names the deployed proxy, certificate, TLS and Python start-up variables that do not apply on this machine, by name only', async () => {
    const withEnv = (Runtime, Variables) => ({
      Runtime,
      Timeout: 6,
      Environment: { Variables },
    })
    const { logger } = await start({
      functions: [
        {
          key: 'api',
          live: withEnv('nodejs24.x', {
            HTTPS_PROXY: 'http://10.0.0.5:3128',
            LD_PRELOAD: '/opt/lib/libhook.so',
            GREETING: 'hello',
          }),
        },
        {
          key: 'py',
          live: withEnv('python3.13', {
            REQUESTS_CA_BUNDLE: '/var/task/ca.pem',
            Https_Proxy: 'http://10.0.0.5:3128',
          }),
        },
      ],
    })
    const notices = logger.lines.filter(
      (line) =>
        line.level === 'debug' && line.text.startsWith('Dev Mode leaves'),
    )
    expect(notices).toEqual([
      {
        level: 'debug',
        text: "Dev Mode leaves LD_PRELOAD of api out on this machine: library loader settings made for Lambda's file system do not apply here. It also leaves out HTTPS_PROXY, REQUESTS_CA_BUNDLE and Https_Proxy of api and py: they set, for Lambda, the function's proxy, certificate, TLS or OpenSSL settings, how it resolves host names, what runs at start-up, or where Node.js or Python read or write files of their own; this machine's own proxy, certificate, TLS, OpenSSL, host-name, Python installation, Python debugger (PYTHONBREAKPOINT), Python bytecode cache and Node.js coverage settings apply here.",
      },
    ])
    for (const value of ['10.0.0.5', '/var/task', '/opt/lib']) {
      expect(notices[0].text).not.toContain(value)
    }
  })

  test("a preload of the developer's own file is not named; a package or a file outside the service directory is", async () => {
    const root = tempDir()
    const dir = path.join(root, 'svc')
    write(dir, {
      'otel.cjs': '',
      'lib/tracing.mjs': '',
      'node_modules/dd-trace/init.js': '',
    })
    write(root, { 'outside.mjs': '' })
    const withNodeOptions = (NODE_OPTIONS) => ({
      Runtime: 'nodejs24.x',
      Timeout: 6,
      Environment: { Variables: { NODE_OPTIONS } },
    })
    const { logger } = await start({
      functions: [
        {
          key: 'api',
          live: withNodeOptions(
            '--require ./otel.cjs --import /var/task/lib/tracing.mjs',
          ),
        },
        {
          key: 'worker',
          live: withNodeOptions('-r dd-trace/init --import ../outside.mjs'),
        },
      ],
      serverless: {
        ...fakeServerless({
          functions: {
            api: { handler: 'a.handler' },
            worker: { handler: 'w.handler' },
          },
        }),
        serviceDir: dir,
      },
    })
    expect(
      logger.lines.filter(
        (line) =>
          line.level === 'debug' && line.text.startsWith('Dev Mode leaves'),
      ),
    ).toEqual([
      {
        level: 'debug',
        text: 'Dev Mode leaves -r out of the deployed NODE_OPTIONS of worker on this machine: packages are not loaded from the deployed configuration; load them from a file in your service, such as ./instrumentation.js. It also leaves out --import of the deployed NODE_OPTIONS of worker, which does not name a file in the service directory.',
      },
    ])
  })

  test("names a runtime setting this machine's Node.js refuses in NODE_OPTIONS", async () => {
    const { logger } = await start({
      functions: [
        {
          key: 'api',
          live: {
            Runtime: 'nodejs24.x',
            Timeout: 6,
            Environment: {
              Variables: {
                NODE_OPTIONS: '--max-semi-space-size=16 --enable-source-maps',
              },
            },
          },
        },
      ],
      deps: { allowedNodeFlags: new Set(['--enable-source-maps']) },
    })
    expect(
      logger.lines.filter(
        (line) =>
          line.level === 'debug' && line.text.startsWith('Dev Mode leaves'),
      ),
    ).toEqual([
      {
        level: 'debug',
        text: "Dev Mode leaves --max-semi-space-size out of the deployed NODE_OPTIONS of api on this machine: this machine's Node.js does not accept it in NODE_OPTIONS.",
      },
    ])
  })

  test('gives each reason its own clause: code-loading flags, preloads outside the service directory, flags this Node.js refuses, loader variables', async () => {
    const { logger } = await start({
      functions: [
        {
          key: 'api',
          live: {
            Runtime: 'nodejs24.x',
            Timeout: 6,
            Environment: {
              Variables: {
                NODE_OPTIONS:
                  '--import=data:text/javascript,x --require /opt/x.js --max-semi-space-size=16 --trace-env',
                LD_PRELOAD: '/opt/lib/libhook.so',
              },
            },
          },
        },
      ],
      deps: {
        allowedNodeFlags: new Set([
          '--enable-source-maps',
          '--require',
          '--import',
        ]),
      },
    })
    expect(
      logger.lines.filter(
        (line) =>
          line.level === 'debug' && line.text.startsWith('Dev Mode leaves'),
      ),
    ).toEqual([
      {
        level: 'debug',
        text: "Dev Mode leaves --import out of the deployed NODE_OPTIONS of api on this machine: only runtime settings and preloads of your own files in the service directory apply here, not other flags that load code or open a debugger. It also leaves out --require of the deployed NODE_OPTIONS of api, which does not name a file in the service directory. It also leaves out --max-semi-space-size and --trace-env of the deployed NODE_OPTIONS of api, which this machine's Node.js does not accept in NODE_OPTIONS. It also leaves out LD_PRELOAD of api: library loader settings made for Lambda's file system do not apply here.",
      },
    ])
    expect(logger.text()).not.toContain('\u001b[')
  })

  test('says nothing about NODE_OPTIONS when every deployed flag applies', async () => {
    const { logger } = await start({
      functions: [
        {
          key: 'api',
          live: {
            Runtime: 'nodejs24.x',
            Timeout: 6,
            Environment: {
              Variables: { NODE_OPTIONS: '--enable-source-maps' },
            },
          },
        },
      ],
    })
    expect(logger.text()).not.toContain('NODE_OPTIONS')
  })

  test('builds the Node.js functions before the first invocation, and says what runs when that build failed', async () => {
    const { builds, logger } = await start({
      build: {
        ok: false,
        ms: 5,
        error: new Error('Build failed with 1 error'),
      },
    })
    expect(builds).toEqual([['api']])
    expect(logger.lines).toContainEqual({
      level: 'warning',
      text: [
        'Build failed. api has no good build yet and runs from its source files until a build succeeds.',
        '  Build failed with 1 error',
        '  Fix the file to reload.',
      ].join('\n'),
    })
    expect(logger.text()).not.toContain('last good build')
  })

  test('a service without Node.js functions builds nothing', async () => {
    const { createBuild } = await start({
      functions: [{ key: 'py', live: live('python3.13') }],
    })
    expect(createBuild).not.toHaveBeenCalled()
  })

  test('a saved file rebuilds, reloads every function and says so', async () => {
    const { emitter, runtime, logger, builds } = await start()
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
    expect(
      await waitFor(() => builds.length === 2 && runtime.reloads.length > 0),
    ).toBe(true)
    expect(builds).toHaveLength(2)
    expect(runtime.reloads).toEqual([['api', 'py']])
    expect(logger.text()).toContain('src/api.ts changed')
    expect(logger.text()).toMatch(/⟳ Reloaded \(\d+ms\)$/m)
  })

  test('reloadNow rebuilds and reloads every function, as a file change does', async () => {
    const records = []
    const events = { emit: (type, fields) => records.push({ type, ...fields }) }
    const spinnerDone = jest.fn()
    const { laptop, runtime, logger, builds } = await start({
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      events,
      onSpinnerDone: spinnerDone,
    })
    await laptop.reloadNow()
    // The spinner is gone: the session's keys take the terminal back.
    expect(spinnerDone).toHaveBeenCalledTimes(1)
    // The first build, then this one.
    expect(builds).toHaveLength(2)
    expect(runtime.reloads).toEqual([['api']])
    expect(logger.lines).toContainEqual({
      level: 'progress',
      namespace: 'dev-reload',
      text: 'Reloading',
    })
    expect(logger.text()).toContain('⟳ Reloaded (')
    expect(records[0]).toEqual({
      type: 'reload.start',
      files: 0,
      functions: ['api'],
    })
  })

  test('a key reload waits for the reload under way: two builds never run at once', async () => {
    let release
    let running = 0
    let most = 0
    const { laptop, emitter, builds, runtime } = await start({
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      build: async (n) => {
        running += 1
        most = Math.max(most, running)
        if (n === 2) await new Promise((resolve) => (release = resolve))
        running -= 1
        return { ok: true, ms: 1 }
      },
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
    expect(await waitFor(() => builds.length === 2)).toBe(true)
    const keyed = laptop.reloadNow()
    release()
    await keyed
    expect(builds).toHaveLength(3)
    expect(most).toBe(1)
    expect(runtime.reloads).toEqual([['api'], ['api']])
  })

  test('a reload whose failure could not be reported does not stop the reloads after it', async () => {
    let ends = 0
    const events = {
      emit: (type) => {
        if (type === 'reload.end' && ++ends === 1) {
          throw new Error('the event log is gone')
        }
      },
    }
    const { laptop, builds, runtime, logger } = await start({
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      events,
      build: (n) => {
        if (n === 2) throw new Error('the build crashed')
        return { ok: true, ms: 1 }
      },
    })
    await laptop.reloadNow()
    await laptop.reloadNow()
    expect(builds).toHaveLength(3)
    expect(runtime.reloads).toEqual([['api']])
    expect(logger.text()).toContain('Dev Mode could not finish a reload')
    await expect(laptop.stop()).resolves.toBeUndefined()
  })

  test('the reload chain never rejects, not even when its debug line cannot be written', async () => {
    const events = {
      emit: (type) => {
        if (type === 'reload.end') throw new Error('the event log is gone')
      },
    }
    const { laptop, builds, logger } = await start({
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      events,
      build: (n) => {
        if (n === 2) throw new Error('the build crashed')
        return { ok: true, ms: 1 }
      },
    })
    logger.debug = () => {
      throw new Error('the terminal is gone')
    }
    await expect(laptop.reloadNow()).resolves.toBeUndefined()
    await expect(laptop.reloadNow()).resolves.toBeUndefined()
    expect(builds).toHaveLength(3)
    await expect(laptop.stop()).resolves.toBeUndefined()
  })

  test('reloads asked for while one waits join it: a held r key is one more rebuild', async () => {
    let release
    const { laptop, emitter, builds, runtime, logger } = await start({
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      build: async (n) => {
        if (n === 2) await new Promise((resolve) => (release = resolve))
        return { ok: true, ms: 1 }
      },
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
    expect(await waitFor(() => builds.length === 2)).toBe(true)
    const repeats = [laptop.reloadNow(), laptop.reloadNow(), laptop.reloadNow()]
    release()
    await Promise.all(repeats)
    expect(builds).toHaveLength(3)
    expect(runtime.reloads).toEqual([['api'], ['api']])
    expect(
      logger.lines.filter(
        (line) => line.level === 'progress' && line.text === 'Reloading',
      ),
    ).toHaveLength(1)
  })

  test('the start waits for the watcher to finish its first scan', async () => {
    const timers = countingTimers()
    const { emitter, watch } = fakeWatch({ scans: false })
    let done = false
    const starting = startLaptopRuntime({
      serverless: fakeServerless(),
      functions: [{ key: 'py', live: live('python3.13') }],
      localRuntimes: LOCAL,
      logger: fakeLog(),
      timers,
      processRef: new EventEmitter(),
      env: {},
      deps: { createRuntime: () => fakeRuntime(), watch },
    }).then((laptop) => {
      done = true
      return laptop
    })
    expect(await waitFor(() => watch.mock.calls.length === 1)).toBe(true)
    await new Promise((resolve) => setImmediate(resolve))
    expect(done).toBe(false)
    emitter.emit('ready')
    const laptop = await starting
    started.push({ laptop, timers })
    expect(timers.live()).toBe(0)
  })

  test('a watcher that never finishes its first scan does not hold up the start', async () => {
    const { laptop, logger } = await start({
      functions: [{ key: 'py', live: live('python3.13') }],
      scans: false,
      deps: { watchReadyMs: 20 },
    })
    expect(laptop.runtime).toBeDefined()
    expect(
      logger.lines.filter((line) => line.level === 'debug').map((l) => l.text),
    ).toEqual([
      'Dev Mode is still scanning the service directory for changes; saves are seen once the scan ends.',
    ])
  })

  test('toggleDetailed switches the invocation output', async () => {
    const { laptop } = await start()
    expect(laptop.toggleDetailed()).toBe(true)
    expect(laptop.toggleDetailed()).toBe(false)
  })

  test('setDetailed sets the invocation output to the state the session gives', async () => {
    const { laptop } = await start()
    expect(laptop.setDetailed(true)).toBe(true)
    expect(laptop.toggleDetailed()).toBe(false)
    expect(laptop.setDetailed(false)).toBe(false)
    // Nothing shows: clearing the reload spinner is harmless.
    expect(() => laptop.clearSpinner()).not.toThrow()
  })

  test('a reload is recorded: its start, then its end with the functions that reloaded', async () => {
    const records = []
    const events = { emit: (type, fields) => records.push({ type, ...fields }) }
    const { emitter } = await start({
      events,
      build: (n) =>
        n === 1
          ? { ok: true, ms: 1 }
          : {
              ok: false,
              functions: ['api'],
              error: new Error('Expected ";"\n  at src/api.ts:3'),
            },
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
    expect(await waitFor(() => records.length === 2)).toBe(true)
    expect(records).toEqual([
      { type: 'reload.start', files: 1, functions: ['api', 'py'] },
      {
        type: 'reload.end',
        ok: false,
        functions: ['py'],
        ms: expect.any(Number),
        error: 'Expected ";"',
      },
    ])
  })

  test('a reload record keeps no URL from the build error', async () => {
    const records = []
    const events = { emit: (type, fields) => records.push({ type, ...fields }) }
    const { emitter } = await start({
      events,
      build: (n) =>
        n === 1
          ? { ok: true, ms: 1 }
          : {
              ok: false,
              functions: ['api'],
              error: new Error(
                'Could not fetch https://registry.example.com/pkg?token=abc for src/api.ts',
              ),
            },
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
    expect(await waitFor(() => records.length === 2)).toBe(true)
    expect(records[1].error).toBe('Could not fetch <url> for src/api.ts')
  })

  test('the recorder hears every invocation call after the output, and its failure stays a debug line', async () => {
    const heard = []
    const recorder = {
      start: (details) => heard.push(['start', details.requestId]),
      log: () => {
        throw new Error('disk full')
      },
      end: (details) => heard.push(['end', details.requestId]),
      workerExited: (details) =>
        heard.push(['workerExited', details.requestId]),
    }
    const { createRuntime, logger } = await start({ recorder })
    const { output } = createRuntime.mock.calls[0][0]
    output.start({ functionKey: 'api', requestId: 'req-1', event: {} })
    output.log({ functionKey: 'api', requestId: 'req-1', text: 'hello' })
    output.end({
      functionKey: 'api',
      requestId: 'req-1',
      event: {},
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
    expect(heard).toEqual([
      ['start', 'req-1'],
      ['end', 'req-1'],
    ])
    expect(logger.text()).toContain('hello')
    expect(logger.lines).toContainEqual({
      level: 'debug',
      text: "Dev Mode could not record an invocation's log: disk full",
    })
  })

  const invoke = (output, requestId) => {
    output.start({ functionKey: 'api', requestId, event: {} })
    output.end({
      functionKey: 'api',
      requestId,
      event: {},
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
  }

  test('an invocation after a section that ended with a blank line gets no second one', async () => {
    // The session's logger: it prints one blank line between sections, never two.
    const base = fakeLog()
    base.blankLine = () => base.lines.push({ level: 'blank', text: '' })
    const { createRuntime, logger } = await start({
      logger: guardedLogger(base),
    })
    const { output } = createRuntime.mock.calls[0][0]
    invoke(output, 'req-1')
    // The s key's status block ends with a blank line.
    logger.notice('Dev Mode on · dev · 2 functions · 1 invocation, no errors')
    logger.gap()
    invoke(output, 'req-2')
    expect(base.lines.map((line) => line.level)).toEqual([
      'blank',
      'notice',
      'notice',
      'notice',
      'blank',
      'notice',
      'notice',
    ])
  })

  /** The session's spinner over a recording one, with its spacing switch recorded too. */
  const recordingSpinner = (base, logger) =>
    guardedProgress(
      {
        notice: (text) => base.lines.push({ level: 'spinner', text }),
        remove: () => base.lines.push({ level: 'removed', text: '' }),
      },
      () => false,
      {
        gap: () => logger.gap(),
        setBlankLineAbove: (on) =>
          base.lines.push({
            level: 'spacing',
            text: on ? 'blank line above' : 'right under the lines',
          }),
      },
    )
  const end = (output, requestId) =>
    output.end({
      functionKey: 'api',
      requestId,
      event: {},
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })

  test('Ctrl+C during a long invocation shows its hint at once, right under the invocation lines', async () => {
    const base = fakeLog()
    base.blankLine = () => base.lines.push({ level: 'blank', text: '' })
    const logger = guardedLogger(base)
    const spinner = recordingSpinner(base, logger)
    const { createRuntime } = await start({ logger, spinner })
    const { output } = createRuntime.mock.calls[0][0]
    output.start({ functionKey: 'api', requestId: 'req-1', event: {} })
    // The first Ctrl+C: the stop's spinner shows at once.
    spinner.notice(
      'Restoring 1 function · press Ctrl+C again to exit without waiting',
    )
    output.log({ requestId: 'req-1', text: 'working' })
    spinner.notice('Restoring 1 function (1/1)')
    end(output, 'req-1')
    expect(base.lines.map(({ level, text }) => `${level}: ${text}`)).toEqual([
      'spacing: right under the lines',
      'blank: ',
      'notice: → λ api ── direct invoke · req-1',
      'spinner: Restoring 1 function · press Ctrl+C again to exit without waiting',
      'notice: req-1 │ working',
      'spinner: Restoring 1 function (1/1)',
      'notice: ← λ api (ok) 1ms · req-1',
      // Once no invocation runs, the spinner moves below a blank line.
      'spacing: blank line above',
      'removed: ',
      'blank: ',
      'spinner: Restoring 1 function (1/1)',
    ])
  })

  test('the first invocation gets one blank line before it, after the key hint', async () => {
    const base = fakeLog()
    base.blankLine = () => base.lines.push({ level: 'blank', text: '' })
    const { createRuntime, logger } = await start({
      logger: guardedLogger(base),
    })
    logger.aside(
      'Press h for keys, Ctrl+C or q to restore your functions and exit.',
    )
    const { output } = createRuntime.mock.calls[0][0]
    invoke(output, 'req-1')
    expect(base.lines.map((line) => line.level)).toEqual([
      'aside',
      'blank',
      'notice',
      'notice',
    ])
  })

  test('an invocation while the session spinner shows (a restore) takes its line, and the spinner stays under it', async () => {
    const base = fakeLog()
    base.blankLine = () => base.lines.push({ level: 'blank', text: '' })
    const logger = guardedLogger(base)
    const spinner = recordingSpinner(base, logger)
    const { createRuntime } = await start({ logger, spinner })
    const { output } = createRuntime.mock.calls[0][0]
    // The restore's spinner, with the blank line it keeps above itself.
    logger.gap()
    spinner.notice('Restoring 1 function (0/1)')
    output.start({ functionKey: 'api', requestId: 'req-1', event: {} })
    output.log({ requestId: 'req-1', text: 'working' })
    end(output, 'req-1')
    expect(base.lines.map(({ level, text }) => `${level}: ${text}`)).toEqual([
      'blank: ',
      'spinner: Restoring 1 function (0/1)',
      'spacing: right under the lines',
      'notice: → λ api ── direct invoke · req-1',
      'notice: req-1 │ working',
      'notice: ← λ api (ok) 1ms · req-1',
      'spacing: blank line above',
      'removed: ',
      'blank: ',
      'spinner: Restoring 1 function (0/1)',
    ])
    // Once the restore is done, a later invocation only switches the spacing back and forth.
    spinner.remove()
    base.lines.splice(0)
    invoke(output, 'req-2')
    expect(base.lines.map(({ level }) => level)).toEqual([
      'spacing',
      'notice',
      'notice',
      'spacing',
    ])
  })

  test('an invocation after an earlier one that starts under the reload spinner gets one blank line before it', async () => {
    let finish
    const base = fakeLog()
    base.blankLine = () => base.lines.push({ level: 'blank', text: '' })
    const progress = {
      get: () => ({
        notice: (text) => base.lines.push({ level: 'spinner', text }),
        remove: () => base.lines.push({ level: 'removed', text: '' }),
      }),
    }
    const { laptop, createRuntime } = await start({
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      logger: guardedLogger(base),
      build: (n) =>
        n === 1
          ? { ok: true, ms: 1 }
          : new Promise((resolve) => (finish = () => resolve({ ok: true }))),
      deps: { progress },
    })
    const { output } = createRuntime.mock.calls[0][0]
    invoke(output, 'req-1')
    const reloading = laptop.reloadNow()
    expect(await waitFor(() => finish !== undefined)).toBe(true)
    invoke(output, 'req-2')
    // The blank line comes before the spinner, which then keeps no blank line of its own above
    // itself; the next invocation needs none more.
    expect(base.lines.map((line) => line.level)).toEqual([
      'blank',
      'notice',
      'notice',
      'blank',
      'spinner',
      'removed',
      'notice',
      'notice',
    ])
    finish()
    await reloading
  })

  test('an invocation that starts while the reload spinner shows takes its place, so its lines stay together', async () => {
    let finish
    const spinnerDone = jest.fn()
    const lines = []
    const progress = {
      get: () => ({
        notice: (text) => lines.push(`spinner: ${text}`),
        remove: () => lines.push('spinner removed'),
      }),
    }
    const { laptop, createRuntime } = await start({
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      build: (n) =>
        n === 1
          ? { ok: true, ms: 1 }
          : new Promise((resolve) => (finish = () => resolve({ ok: true }))),
      onSpinnerDone: spinnerDone,
      deps: { progress },
    })
    const { output } = createRuntime.mock.calls[0][0]
    const reloading = laptop.reloadNow()
    expect(await waitFor(() => finish !== undefined)).toBe(true)
    lines.length = 0
    output.start({ functionKey: 'api', requestId: 'req-1', event: {} })
    // The spinner is gone before the invocation's first line, and the keys take the terminal back.
    expect(lines).toEqual(['spinner removed'])
    expect(spinnerDone).toHaveBeenCalledTimes(1)
    output.end({
      functionKey: 'api',
      requestId: 'req-1',
      event: {},
      reply: { kind: 'response', body: Buffer.from('{}') },
      durationMs: 1,
    })
    // It does not come back for the rest of this reload.
    expect(lines).toEqual(['spinner removed'])
    finish()
    await reloading
  })

  test('a failed rebuild reloads only the functions it does not build, without repeating what esbuild printed', async () => {
    const { emitter, runtime, logger } = await start({
      build: (n) =>
        n === 1
          ? { ok: true, ms: 1 }
          : {
              ok: false,
              ms: 1,
              // esbuild has already printed this compile error.
              error: Object.assign(new Error('Expected ";"'), {
                code: 'ESBULD_BUILD_ERROR',
              }),
            },
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'handler.js'))
    expect(await waitFor(() => runtime.reloads.length > 0)).toBe(true)
    expect(runtime.reloads).toEqual([['py']])
    expect(logger.lines).toContainEqual({
      level: 'warning',
      text: 'Build failed. api keeps running the last good build.\n  Fix the file to reload.',
    })
    expect(logger.text()).not.toContain('Expected ";"')
  })

  test.each([
    [
      'ESBUILD_CONFIG_ERROR',
      'Your build config file must export a function or an object.',
      '  Fix the build configuration file and restart "serverless dev": configuration changes do not reload.',
    ],
    [
      'ESBUILD_OUT_EXTENSION_UNSUPPORTED',
      'build.esbuild.outExtension ".cjs" is not supported.',
      '  Fix serverless.yml and restart "serverless dev": configuration changes do not reload.',
    ],
    [
      undefined,
      'Cannot read properties of undefined (reading "entry")',
      '  Fix the file to reload.',
    ],
  ])(
    'a failed rebuild that esbuild did not print (%s) shows why',
    async (code, message, fix) => {
      const { emitter, runtime, logger } = await start({
        build: (n) =>
          n === 1
            ? { ok: true, ms: 1 }
            : {
                ok: false,
                ms: 1,
                error: Object.assign(new Error(message), { code }),
              },
      })
      emitter.emit('all', 'change', path.join(serviceDir, 'handler.js'))
      expect(await waitFor(() => runtime.reloads.length > 0)).toBe(true)
      expect(logger.lines).toContainEqual({
        level: 'warning',
        text: [
          'Build failed. api keeps running the last good build.',
          `  ${message}`,
          fix,
        ].join('\n'),
      })
    },
  )

  test('the runtime runs the build output of the functions a build built, from then on', async () => {
    const { emitter, runtime, createRuntime } = await start({
      functions: [
        { key: 'api', live: live('nodejs24.x') },
        { key: 'plain', live: live('nodejs24.x') },
      ],
      build: (n) =>
        n === 1
          ? { ok: false, ms: 1, error: new Error('boom'), built: [] }
          : n === 2
            ? { ok: true, ms: 1, functions: ['api'], built: ['api'] }
            : { ok: false, ms: 1, error: new Error('boom'), built: [] },
    })
    const { isBuilt } = createRuntime.mock.calls[0][0]
    expect([isBuilt('api'), isBuilt('plain')]).toEqual([false, false])
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
    expect(await waitFor(() => runtime.reloads.length === 1)).toBe(true)
    expect([isBuilt('api'), isBuilt('plain')]).toEqual([true, false])
    // A failed build keeps the last good output.
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
    expect(await waitFor(() => runtime.reloads.length === 2)).toBe(true)
    expect([isBuilt('api'), isBuilt('plain')]).toEqual([true, false])
  })

  describe('a failed build names only the functions the build covers', () => {
    const three = [
      { key: 'api', live: live('nodejs24.x') },
      { key: 'plain', live: live('nodejs24.x') },
      { key: 'py', live: live('python3.13', 30) },
    ]

    test('first build: a covered function never built runs from source; others are not named', async () => {
      const { logger } = await start({
        functions: three,
        build: {
          ok: false,
          ms: 1,
          error: new Error('boom'),
          functions: ['api'],
        },
      })
      expect(logger.lines).toContainEqual({
        level: 'warning',
        text: [
          'Build failed. api has no good build yet and runs from its source files until a build succeeds.',
          '  boom',
          '  Fix the file to reload.',
        ].join('\n'),
      })
      expect(logger.text()).not.toContain('plain')
    })

    test('after a good build: the covered function keeps it; the others still reload', async () => {
      const { emitter, runtime, logger } = await start({
        functions: three,
        build: (n) =>
          n === 1
            ? { ok: true, ms: 1, functions: ['api'] }
            : {
                ok: false,
                ms: 1,
                error: new Error('boom'),
                functions: ['api'],
              },
      })
      emitter.emit('all', 'change', path.join(serviceDir, 'plain.mjs'))
      expect(await waitFor(() => runtime.reloads.length > 0)).toBe(true)
      expect(runtime.reloads).toEqual([['plain', 'py']])
      expect(logger.lines).toContainEqual({
        level: 'warning',
        text: [
          'Build failed. api keeps running the last good build.',
          '  boom',
          '  Fix the file to reload.',
        ].join('\n'),
      })
      expect(logger.text()).toMatch(/⟳ Reloaded plain and py \(\d+ms\)/)
    })

    test('a build that covers no function says that none is held back, and every function reloads', async () => {
      const { emitter, runtime, logger } = await start({
        functions: three,
        build: { ok: false, ms: 1, error: new Error('boom'), functions: [] },
      })
      expect(logger.lines).toContainEqual({
        level: 'warning',
        text: [
          'Build failed.',
          '  boom',
          "  No function runs this build's output, so none is held back.",
        ].join('\n'),
      })
      emitter.emit('all', 'change', path.join(serviceDir, 'plain.mjs'))
      expect(await waitFor(() => runtime.reloads.length > 0)).toBe(true)
      expect(runtime.reloads).toEqual([['api', 'plain', 'py']])
    })
  })

  test('a serverless.yml change says what needs a deploy and reloads nothing', async () => {
    const { emitter, runtime, logger } = await start()
    emitter.emit('all', 'change', path.join(serviceDir, 'serverless.yml'))
    expect(
      await waitFor(() => logger.text().includes('serverless.yml changed')),
    ).toBe(true)
    expect(runtime.reloads).toEqual([])
    expect(logger.lines).toContainEqual({
      level: 'warning',
      text: 'serverless.yml changed: run "serverless deploy" for environment, IAM, events or functions; restart "serverless dev" for a new handler path.',
    })
  })

  test('a watcher error is reported once', async () => {
    const { emitter, logger } = await start()
    emitter.emit('error', new Error('EMFILE'))
    emitter.emit('error', new Error('EMFILE'))
    expect(
      logger.lines.filter((line) =>
        line.text.startsWith('The file watcher reported an error'),
      ),
    ).toHaveLength(1)
  })

  test('a runtime that cannot start is stopped and reported', async () => {
    const runtime = fakeRuntime()
    const timers = countingTimers()
    runtime.start = async () => {
      throw new Error('listen EACCES 127.0.0.1')
    }
    await expect(
      startLaptopRuntime({
        serverless: fakeServerless(),
        functions: [{ key: 'api', live: live('nodejs24.x') }],
        localRuntimes: LOCAL,
        logger: fakeLog(),
        timers,
        processRef: new EventEmitter(),
        env: {},
        deps: { createRuntime: () => runtime },
      }),
    ).rejects.toMatchObject({
      code: 'DEV_MODE_LOCAL_RUNTIME_FAILED',
      message:
        'Dev Mode could not start the Lambda Runtime API on this machine (listen EACCES 127.0.0.1).',
    })
    expect(runtime.stopped).toBe(1)
    expect(timers.live()).toBe(0)
  })

  test('stop closes the watcher and then the runtime', async () => {
    const { laptop, emitter, runtime } = await start()
    await laptop.stop()
    expect(emitter.closed).toBe(true)
    expect(runtime.stopped).toBe(1)
  })

  test('starts the test feed only under SLS_DEV_TEST_FEED=1, in .serverless/dev, and stops it first', async () => {
    const order = []
    const startFeed = jest.fn(async () => ({
      stop: async () => order.push('feed'),
    }))
    const runtime = fakeRuntime()
    const stopRuntime = runtime.stop
    runtime.stop = async () => {
      order.push('runtime')
      await stopRuntime()
    }
    const timers = countingTimers()
    const laptop = await startLaptopRuntime({
      serverless: fakeServerless(),
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      localRuntimes: LOCAL,
      logger: fakeLog(),
      timers,
      processRef: new EventEmitter(),
      env: { SLS_DEV_TEST_FEED: '1' },
      deps: {
        createRuntime: () => runtime,
        createBuild: () => ({ run: async () => ({ ok: true, ms: 0 }) }),
        watch: fakeWatch().watch,
        startFeed,
      },
    })
    expect(startFeed).toHaveBeenCalledWith({
      runtime,
      dir: path.join(serviceDir, '.serverless', 'dev'),
    })
    await laptop.stop()
    expect(order).toEqual(['feed', 'runtime'])
    expect(timers.live()).toBe(0)
  })

  test('no test feed without SLS_DEV_TEST_FEED=1', async () => {
    const startFeed = jest.fn()
    const timers = countingTimers()
    const laptop = await startLaptopRuntime({
      serverless: fakeServerless(),
      functions: [{ key: 'api', live: live('nodejs24.x') }],
      localRuntimes: LOCAL,
      logger: fakeLog(),
      timers,
      processRef: new EventEmitter(),
      env: { SLS_DEV_TEST_FEED: 'yes' },
      deps: {
        createRuntime: fakeRuntime,
        createBuild: () => ({ run: async () => ({ ok: true, ms: 0 }) }),
        watch: fakeWatch().watch,
        startFeed,
      },
    })
    expect(startFeed).not.toHaveBeenCalled()
    await laptop.stop()
    expect(timers.live()).toBe(0)
  })

  test('a test feed that cannot start stops the watcher and the runtime', async () => {
    const runtime = fakeRuntime()
    const { emitter, watch } = fakeWatch()
    const timers = countingTimers()
    await expect(
      startLaptopRuntime({
        serverless: fakeServerless(),
        functions: [{ key: 'api', live: live('nodejs24.x') }],
        localRuntimes: LOCAL,
        logger: fakeLog(),
        timers,
        processRef: new EventEmitter(),
        env: { SLS_DEV_TEST_FEED: '1' },
        deps: {
          createRuntime: () => runtime,
          createBuild: () => ({ run: async () => ({ ok: true, ms: 0 }) }),
          watch,
          startFeed: async () => {
            throw new Error('listen EADDRNOTAVAIL')
          },
        },
      }),
    ).rejects.toThrow('listen EADDRNOTAVAIL')
    expect(emitter.closed).toBe(true)
    expect(runtime.stopped).toBe(1)
    expect(timers.live()).toBe(0)
  })

  describe('with the relay', () => {
    const sessionKey = Buffer.alloc(32, 5)
    const sessionId = 's_0123456789ab'
    const up = topicsOf(sessionId).up
    const bridge = createSealer({ key: sessionKey })
    const invokeFrame = (id) =>
      bridge(
        up,
        {
          kind: 'invoke',
          env: 'e1',
          fn: 'svc-dev-api',
          id,
          sentAt: Date.now(),
          remainingMs: 5_000,
          headers: { 'lambda-runtime-aws-request-id': id },
          environment: {},
        },
        Buffer.from('{}'),
      )
    const countFrame = () =>
      bridge(
        up,
        { kind: 'passed', env: 'e1' },
        Buffer.from(
          JSON.stringify({
            since: 1,
            counts: [{ fn: 'svc-dev-api', reason: 'offline', n: 2 }],
          }),
        ),
      )
    const startWithRelay = async () => {
      const sent = []
      const passed = []
      const open = createOpener({ key: sessionKey })
      const invoked = []
      const order = []
      let receive = null
      const runtime = fakeRuntime()
      runtime.invoke = async (request) => {
        invoked.push(request)
        return { kind: 'response', body: Buffer.from('{"ok":1}') }
      }
      const stopRuntime = runtime.stop
      runtime.stop = async () => {
        order.push('runtime')
        await stopRuntime()
      }
      const timers = countingTimers()
      const laptop = await startLaptopRuntime({
        serverless: fakeServerless(),
        functions: [{ key: 'api', live: live('nodejs24.x') }],
        localRuntimes: LOCAL,
        logger: fakeLog(),
        timers,
        processRef: new EventEmitter(),
        env: {},
        relay: {
          connection: {
            transport: {
              publish: async (message) => {
                sent.push(open(message.topic, message.payload))
                return true
              },
            },
            setReceiver: (fn) => {
              order.push('receiving')
              receive = fn
            },
            onReconnected: () => {},
          },
          sessionId,
          sessionKey,
          deployedNames: new Map([['svc-dev-api', 'api']]),
          sideChannel: { enabled: false, reason: 'off' },
          onNotRun: () => {},
          onPassed: (details) => passed.push(details),
        },
        deps: {
          createRuntime: () => runtime,
          createBuild: () => ({
            run: async () => {
              order.push('built')
              return { ok: true, ms: 0 }
            },
          }),
          watch: fakeWatch().watch,
        },
      })
      return {
        laptop,
        sent,
        passed,
        invoked,
        order,
        timers,
        runtime,
        receive: (...args) => receive(...args),
      }
    }

    test('relayed frames reach the runtime and the relay stops accepting before the runtime stops', async () => {
      const { laptop, sent, invoked, order, timers, receive } =
        await startWithRelay()
      // Invocations reach this machine once the first build is done.
      expect(order).toEqual(['built', 'receiving'])
      receive(up, invokeFrame('r1'))
      await waitFor(() => sent.length === 2)
      expect(invoked[0]).toMatchObject({
        functionKey: 'api',
        environmentId: 'e1',
      })
      expect(sent.map((frame) => frame.header.kind)).toEqual([
        'accepted',
        'response',
      ])
      laptop.stopAccepting()
      receive(up, invokeFrame('r2'))
      await waitFor(() => sent.length === 3)
      expect(sent[2].header).toEqual({ kind: 'not_in_dev', id: 'r2' })
      expect(invoked).toHaveLength(1)
      await laptop.drain(1_000)
      await laptop.stop()
      expect(order).toEqual(['built', 'receiving', 'runtime'])
      expect(timers.live()).toBe(0)
    })

    test("a bridge's count reaches the session", async () => {
      const { laptop, passed, receive } = await startWithRelay()
      receive(up, countFrame())
      await waitFor(() => passed.length === 1)
      expect(passed[0]).toMatchObject({ functionKey: 'api', count: 2 })
      await laptop.stop()
    })

    test('stop ends an invocation that outlived the drain, and its result is sent before stop resolves', async () => {
      const { laptop, sent, receive, runtime } = await startWithRelay()
      let endWorker
      runtime.invoke = () =>
        new Promise((resolve) => {
          // The worker's exit reaches the invocation a moment after the runtime stopped it.
          endWorker = () =>
            setTimeout(
              () =>
                resolve({
                  kind: 'error',
                  errorType: 'Runtime.ExitError',
                  body: Buffer.from('{"errorType":"Runtime.ExitError"}'),
                }),
              30,
            )
        })
      const stopRuntime = runtime.stop
      runtime.stop = async () => {
        endWorker()
        await stopRuntime()
      }
      receive(up, invokeFrame('long'))
      await waitFor(() => sent.length === 1)
      laptop.stopAccepting()
      await laptop.drain(20)
      expect(sent.map((frame) => frame.header.kind)).toEqual(['accepted'])
      await laptop.stop()
      expect(sent.map((frame) => frame.header.kind)).toEqual([
        'accepted',
        'error',
      ])
    })

    test('stop alone stops accepting first', async () => {
      const { laptop, sent, invoked, receive } = await startWithRelay()
      expect(laptop.relay).toBeTruthy()
      await laptop.stop()
      receive(up, invokeFrame('late'))
      await waitFor(() => sent.length === 1)
      expect(sent[0].header).toEqual({ kind: 'not_in_dev', id: 'late' })
      expect(invoked).toHaveLength(0)
    })
  })

  test('a rebuild that fails once the stop has begun says nothing: Ctrl+C reaches the build too', async () => {
    let release
    const { laptop, logger, emitter, builds } = await start({
      build: (n) =>
        n === 1
          ? { ok: true, ms: 1 }
          : new Promise((resolve) => {
              release = () =>
                resolve({
                  ok: false,
                  ms: 1,
                  error: new Error('The service is no longer running'),
                })
            }),
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'handler.js'))
    await waitFor(() => builds.length === 2)
    laptop.stopAccepting()
    release()
    await laptop.stop()
    expect(logger.text()).not.toMatch(/Build failed|no longer running/)
  })

  test('without the relay, stopAccepting and drain do nothing', async () => {
    const { laptop } = await start()
    expect(laptop.relay).toBe(null)
    laptop.stopAccepting()
    await laptop.drain(1_000)
  })

  test.each([
    'ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH',
    'ESBUILD_OUT_EXTENSION_UNSUPPORTED',
    'ESBUILD_TSCONFIG_NOT_FOUND',
    'ESBUILD_HANDLER_NOT_BUILT',
  ])(
    'a build failure from the configuration (%s) asks for a restart, which a save does not replace',
    async (code) => {
      const serverless = fakeServerless()
      serverless.configurationFilename = 'serverless.ts'
      const { logger } = await start({
        serverless,
        build: {
          ok: false,
          ms: 1,
          error: Object.assign(new Error('Set "format: esm"'), { code }),
        },
      })
      expect(logger.lines).toContainEqual({
        level: 'warning',
        text: [
          'Build failed. api has no good build yet and runs from its source files until a build succeeds.',
          '  Set "format: esm"',
          '  Fix serverless.ts and restart "serverless dev": configuration changes do not reload.',
        ].join('\n'),
      })
      expect(logger.text()).not.toContain('Fix the file to reload.')
    },
  )
})

test('builds every attached Node.js function, including MCP server functions', async () => {
  const serverless = fakeServerless({
    functions: { api: { handler: 'h.h' }, tools: { handler: 'tools.handler' } },
  })
  serverless.pluginManager.plugins.push({
    validated: { servers: [{ name: 'tools', server: 'tools.ts' }] },
  })
  const { builds, createBuild } = await start({
    serverless,
    functions: [
      { key: 'api', live: live('nodejs24.x') },
      { key: 'tools', live: live('nodejs24.x') },
    ],
    options: { function: ['api', 'tools'] },
  })
  expect(builds).toEqual([['api', 'tools']])
  expect(createBuild.mock.calls[0][0].options).toEqual({
    function: ['api', 'tools'],
  })
})

test('a real esbuild compile error appears exactly once, with one Dev Mode summary', async () => {
  // esbuild writes its error block straight to the process's stderr, so the session runs in a
  // child process and everything written there is counted.
  const dir = write(tempDir(), {
    'package.json': '{"name":"svc","private":true}\n',
    'typed.ts': 'export const handler = async () => {\n',
  })
  const url = (relative) =>
    pathToFileURL(fileURLToPath(new URL(relative, import.meta.url))).href
  const script = `
    import { EventEmitter } from 'events'
    import Esbuild from ${JSON.stringify(url('../../../../../../../lib/plugins/esbuild/index.js'))}
    import { startLaptopRuntime } from ${JSON.stringify(url('../../../../../../../lib/plugins/aws/dev/local/index.js'))}
    import { countingTimers } from ${JSON.stringify(url('../attach/fakes.js'))}
    const dir = process.cwd()
    const functions = { typed: { handler: 'typed.handler' } }
    const serverless = {
      serviceDir: dir,
      config: { serviceDir: dir },
      configurationFilename: 'serverless.yml',
      service: {
        service: 'svc',
        provider: { runtime: 'nodejs24.x' },
        package: {},
        functions,
        getFunction: (key) => functions[key],
        getAllFunctions: () => Object.keys(functions),
      },
      pluginManager: { plugins: [], cliOptions: {} },
    }
    const esbuild = new Esbuild(serverless, {})
    serverless.pluginManager.plugins.push(esbuild)
    serverless.pluginManager.spawn = async () =>
      esbuild.hooks['before:dev-build:build']()
    const write = (line) => process.stderr.write(line + String.fromCharCode(10))
    const timers = countingTimers()
    const laptop = await startLaptopRuntime({
      serverless,
      functions: [{ key: 'typed', live: { Runtime: 'nodejs24.x' } }],
      localRuntimes: {},
      logger: { notice: write, warning: write },
      timers,
      processRef: new EventEmitter(),
      env: {},
      deps: {
        createRuntime: () => ({ start: async () => {}, stop: async () => {} }),
        watch: () => {
          const watcher = Object.assign(new EventEmitter(), { close: async () => {} })
          setImmediate(() => watcher.emit('ready'))
          return watcher
        },
      },
    })
    await laptop.stop()
    process.stdout.write(JSON.stringify({ timersLeft: timers.live() }))
  `
  const result = await run(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: dir, env: baseEnv() },
  )
  expect({ code: result.code, stdout: result.stdout }).toEqual({
    code: 0,
    stdout: JSON.stringify({ timersLeft: 0 }),
  })
  const count = (text) => result.stderr.split(text).length - 1
  expect(count('Unexpected end of file')).toBe(1)
  expect(count('Build failed.')).toBe(1)
  expect(result.stderr).toContain(
    'Build failed. typed has no good build yet and runs from its source files until a build succeeds.\n  Fix the file to reload.',
  )
})

test('stop is idempotent and waits for a pending build without reloading stopped handlers', async () => {
  let release
  const { laptop, emitter, runtime, builds } = await start({
    build: async (n) => {
      if (n === 2)
        await new Promise((resolve) => {
          release = resolve
        })
      return { ok: true, ms: 1 }
    },
  })
  emitter.emit('all', 'change', path.join(serviceDir, 'handler.js'))
  expect(await waitFor(() => builds.length === 2)).toBe(true)
  const stopping = laptop.stop()
  expect(runtime.stopped).toBe(0)
  release()
  await Promise.all([stopping, laptop.stop()])
  expect(runtime.reloads).toEqual([])
  expect(runtime.stopped).toBe(1)
})

test('a watcher that cannot start stops the runtime', async () => {
  const runtime = fakeRuntime()
  await expect(
    start({
      runtime,
      deps: {
        watch: () => {
          throw new Error('EMFILE')
        },
      },
    }),
  ).rejects.toThrow('EMFILE')
  expect(runtime.stopped).toBe(1)
})

test('a build plugin failure outside esbuild is shown instead of a reload', async () => {
  const Esbuild = (
    await import('../../../../../../../lib/plugins/esbuild/index.js')
  ).default
  const dir = write(tempDir(), {
    'package.json': '{"name":"svc","private":true}\n',
    'typed.ts': 'export const handler = async () => 1\n',
  })
  const functions = { typed: { handler: 'typed.handler' } }
  const serverless = {
    serviceDir: dir,
    config: { serviceDir: dir },
    configurationFilename: 'serverless.yml',
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs24.x' },
      package: {},
      // A CommonJS build cannot emit `.mjs` files: the plugin refuses before esbuild runs.
      build: { esbuild: { bundle: false, outExtension: { '.js': '.mjs' } } },
      functions,
      getFunction: (key) => functions[key],
      getAllFunctions: () => Object.keys(functions),
    },
    pluginManager: { plugins: [], cliOptions: {} },
  }
  const esbuild = new Esbuild(serverless, {})
  serverless.pluginManager.plugins.push(esbuild)
  serverless.pluginManager.spawn = async () =>
    esbuild.hooks['before:dev-build:build']()
  const { emitter, logger, runtime } = await start({
    serverless,
    functions: [{ key: 'typed', live: live('nodejs24.x') }],
    deps: { createBuild: undefined },
  })
  emitter.emit('all', 'change', path.join(dir, 'typed.ts'))
  expect(await waitFor(() => runtime.reloads.length > 0)).toBe(true)
  expect(runtime.reloads).toEqual([[]])
  const failures = logger.lines.filter((line) =>
    line.text.startsWith('Build failed.'),
  )
  expect(failures).toHaveLength(2)
  for (const { level, text } of failures) {
    expect(level).toBe('warning')
    expect(text).toContain(
      '  Emitting ".mjs" files requires the esbuild format',
    )
    // The fix is in serverless.yml, which a save does not reload.
    expect(text.split('\n').pop()).toBe(
      '  Fix serverless.yml and restart "serverless dev": configuration changes do not reload.',
    )
  }
  expect(logger.text()).not.toContain('⟳ Reloaded')
})

test('awaits real esbuild output before the first adapter prepares a TypeScript handler', async () => {
  const Esbuild = (
    await import('../../../../../../../lib/plugins/esbuild/index.js')
  ).default
  const dir = write(tempDir(), {
    'package.json': '{"name":"svc","private":true}\n',
    'typed.ts':
      'enum Shape { Circle = "circle" }\nexport const handler = async () => Shape.Circle\n',
  })
  const functions = { typed: { handler: 'typed.handler' } }
  const serverless = {
    serviceDir: dir,
    config: { serviceDir: dir },
    configurationFilename: 'serverless.yml',
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs24.x' },
      package: {},
      functions,
      getFunction: (key) => functions[key],
      getAllFunctions: () => Object.keys(functions),
    },
    pluginManager: { plugins: [], cliOptions: {} },
  }
  const esbuild = new Esbuild(serverless, {})
  serverless.pluginManager.plugins.push(esbuild)
  serverless.pluginManager.spawn = async () =>
    esbuild.hooks['before:dev-build:build']()
  const { laptop, createRuntime } = await start({
    serverless,
    functions: [{ key: 'typed', live: live('nodejs24.x') }],
    deps: { createBuild: undefined },
  })
  const { isBuilt } = createRuntime.mock.calls[0][0]
  expect(isBuilt('typed')).toBe(true)
  const prepared = await nodeAdapter.prepare({
    serverless,
    serviceDir: dir,
    functionKey: 'typed',
    functionConfig: functions.typed,
    built: isBuilt('typed'),
  })
  expect(prepared.handlerFile).toBe(
    path.join(dir, '.serverless', 'build', 'typed.js'),
  )
  expect(prepared.loader).toBe(null)
  expect(fs.readFileSync(prepared.handlerFile, 'utf8')).toContain('circle')
  await laptop.stop()
})

test('without bundling, the runtime runs the .mjs and .cjs files esbuild emits for .mts and .cts handlers', async () => {
  const Esbuild = (
    await import('../../../../../../../lib/plugins/esbuild/index.js')
  ).default
  const dir = write(tempDir(), {
    'package.json': '{"name":"svc","private":true}\n',
    'esm.mts': 'export const handler = async (): Promise<string> => "esm"\n',
    'cjs.cts': 'export const handler = async (): Promise<string> => "cjs"\n',
  })
  const functions = {
    esm: { handler: 'esm.handler' },
    cjs: { handler: 'cjs.handler' },
  }
  const serverless = {
    serviceDir: dir,
    config: { serviceDir: dir },
    configurationFilename: 'serverless.yml',
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs24.x' },
      package: {},
      build: { esbuild: { bundle: false } },
      functions,
      getFunction: (key) => functions[key],
      getAllFunctions: () => Object.keys(functions),
    },
    pluginManager: { plugins: [], cliOptions: {} },
  }
  const esbuild = new Esbuild(serverless, {})
  serverless.pluginManager.plugins.push(esbuild)
  serverless.pluginManager.spawn = async () =>
    esbuild.hooks['before:dev-build:build']()
  const { laptop, createRuntime } = await start({
    serverless,
    functions: [
      { key: 'esm', live: live('nodejs24.x') },
      { key: 'cjs', live: live('nodejs24.x') },
    ],
    deps: { createBuild: undefined },
  })
  const { isBuilt, builtFile } = createRuntime.mock.calls[0][0]
  for (const [key, file] of [
    ['esm', 'esm.mjs'],
    ['cjs', 'cjs.cjs'],
  ]) {
    expect(isBuilt(key)).toBe(true)
    expect(builtFile(key)).toBe(file)
    const prepared = await nodeAdapter.prepare({
      serverless,
      serviceDir: dir,
      functionKey: key,
      functionConfig: functions[key],
      built: isBuilt(key),
      builtFile: builtFile(key),
    })
    expect(prepared.handlerFile).toBe(
      path.join(dir, '.serverless', 'build', file),
    )
    expect(fs.readFileSync(prepared.handlerFile, 'utf8')).toContain(key)
  }
  await laptop.stop()
})

test('a later build that marks a function built without naming its file clears the file an earlier one named', async () => {
  // A build plugin calling `markBuilt('api', 'src/api.mjs')`, then `markBuilt('api')`.
  const { emitter, builds, createRuntime } = await start({
    build: (n) =>
      n === 1
        ? { ok: true, ms: 1, files: { api: 'src/api.mjs' } }
        : { ok: true, ms: 1, files: {} },
  })
  const { isBuilt, builtFile } = createRuntime.mock.calls[0][0]
  expect(builtFile('api')).toBe('src/api.mjs')
  emitter.emit('all', 'change', path.join(serviceDir, 'src', 'api.ts'))
  expect(await waitFor(() => builds.length === 2)).toBe(true)
  // The adapter then looks for the handler module by its extension, as for a build that never
  // named one.
  expect(await waitFor(() => builtFile('api') === null)).toBe(true)
  expect(isBuilt('api')).toBe(true)
})

// `capable` raises the logger to full colour first (as on a terminal), so the agent and NO_COLOR
// rows fail on their own condition, not because the child's output is a pipe.
test.each([
  ['terminal', {}, true, true],
  ['agent', {}, true, false],
  ['no-color', { NO_COLOR: '1' }, true, false],
  ['pipes', {}, false, false],
  ['force', { FORCE_COLOR: '1' }, false, true],
])(
  '%s decides colour for invocation lines and detailed dumps',
  async (mode, env, capable, colored) => {
    const facadeUrl = pathToFileURL(
      fileURLToPath(
        new URL(
          '../../../../../../../lib/plugins/aws/dev/local/index.js',
          import.meta.url,
        ),
      ),
    ).href
    const loggerUrl = pathToFileURL(
      fileURLToPath(
        new URL(
          '../../../../../../../../util/src/logger/index.js',
          import.meta.url,
        ),
      ),
    ).href
    const timersUrl = new URL('../attach/fakes.js', import.meta.url).href
    const script = `
    import { EventEmitter } from 'events'
    import { startLaptopRuntime } from ${JSON.stringify(facadeUrl)}
    import { applyAgentSession, setColorSettingsForTests } from ${JSON.stringify(loggerUrl)}
    import { countingTimers } from ${JSON.stringify(timersUrl)}
    ${capable ? 'setColorSettingsForTests({ chalkLevel: 3, colorSupportLevel: 3 })' : ''}
    // The CLI applies its colour rule once at start-up, for every session.
    applyAgentSession({ agent: { isAgent: ${mode === 'agent'} }, env: process.env })
    const lines = []
    const timers = countingTimers()
    let output
    const emitter = Object.assign(new EventEmitter(), { close: async () => {} })
    const laptop = await startLaptopRuntime({
      serverless: { serviceDir: process.cwd(), service: { getFunction: () => ({ handler: 'h.h' }) } },
      options: { detailed: true }, functions: [{ key: 'api', live: { Runtime: 'nodejs24.x' } }],
      localRuntimes: {}, logger: { notice: (line) => lines.push(line), warning: () => {} },
      timers, processRef: new EventEmitter(), env: {},
      deps: { createRuntime: (args) => { output = args.output; return { start: async () => {}, stop: async () => {} } }, createBuild: () => ({ run: async () => ({ ok: true }) }), watch: () => { setImmediate(() => emitter.emit('ready')); return emitter } },
    })
    output.start({ functionKey: 'api', requestId: 'abc-123', event: { data: 42 }, newWorker: true })
    output.log({ requestId: 'abc-123', text: 'hello' })
    output.end({ functionKey: 'api', requestId: 'abc-123', event: {}, reply: { kind: 'response', body: Buffer.from('{"value":42}') }, durationMs: 2 })
    await laptop.stop()
    process.stdout.write(JSON.stringify({ lines, timersLeft: timers.live() }))
  `
    const result = await run(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: process.cwd(), env: { ...baseEnv(), ...env } },
    )
    expect({ code: result.code, stderr: result.stderr }).toEqual({
      code: 0,
      stderr: '',
    })
    const { lines, timersLeft } = JSON.parse(result.stdout)
    expect(timersLeft).toBe(0)
    expect(lines).toHaveLength(5)
    expect(lines.some((line) => line.includes('\u001b['))).toBe(colored)
    expect(lines[1].includes('\u001b[')).toBe(colored)
    expect(lines[4].includes('\u001b[')).toBe(colored)
  },
)

test('start-up removes the test feed file a session whose process is gone left behind', async () => {
  const gone = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', ''], {
      stdio: 'ignore',
      env: baseEnv(),
      windowsHide: true,
    })
    child.on('exit', () => resolve(child.pid))
  })
  const dir = write(tempDir(), {
    'serverless.yml': 'service: svc\n',
    '.serverless/dev/test-feed.json': JSON.stringify({
      url: 'http://127.0.0.1:1/invoke',
      token: 'old',
      pid: gone,
    }),
  })
  const serverless = fakeServerless()
  serverless.serviceDir = dir
  await start({ serverless })
  expect(
    fs.existsSync(path.join(dir, '.serverless', 'dev', 'test-feed.json')),
  ).toBe(false)
})

test("start-up keeps a running session's test feed file", async () => {
  const dir = write(tempDir(), {
    'serverless.yml': 'service: svc\n',
    '.serverless/dev/test-feed.json': JSON.stringify({ pid: process.pid }),
  })
  const serverless = fakeServerless()
  serverless.serviceDir = dir
  await start({ serverless })
  expect(
    fs.existsSync(path.join(dir, '.serverless', 'dev', 'test-feed.json')),
  ).toBe(true)
})

test('recognizes the configuration extension omitted by the source runner', async () => {
  const serverless = fakeServerless()
  serverless.configurationFilename = 'serverless'
  const dir = write(tempDir(), { 'serverless.yml': 'service: svc\n' })
  serverless.serviceDir = dir
  const { emitter, runtime, logger } = await start({ serverless })
  emitter.emit('all', 'change', path.join(dir, 'serverless.yml'))
  expect(
    await waitFor(() =>
      logger.text().includes('run "serverless deploy" for environment'),
    ),
  ).toBe(true)
  expect(runtime.reloads).toEqual([])
  expect(logger.lines).toContainEqual({
    level: 'warning',
    text: 'serverless.yml changed: run "serverless deploy" for environment, IAM, events or functions; restart "serverless dev" for a new handler path.',
  })
})

test.each(['serverless.yaml', 'serverless.toml', 'service.config.ts'])(
  'resolves an extensionless configuration stem to the existing %s file',
  async (filename) => {
    const serverless = fakeServerless()
    const dir = write(tempDir(), { [filename]: 'configuration fixture\n' })
    serverless.serviceDir = dir
    serverless.configurationFilename = path.parse(filename).name
    const { emitter, runtime, logger } = await start({ serverless })
    emitter.emit('all', 'change', path.join(dir, filename))
    expect(
      await waitFor(() =>
        logger.text().includes('run "serverless deploy" for environment'),
      ),
    ).toBe(true)
    expect(logger.text()).toContain(filename + ' changed:')
    expect(runtime.reloads).toEqual([])
  },
)

test('with web apps, their output directories do not reload the functions; their entries do', async () => {
  const { watch } = await start({
    webStarts: [
      { source: 'config', command: 'next dev', cwd: serviceDir },
      {
        source: 'entry',
        entryFile: path.join(serviceDir, 'server.mjs'),
        cwd: serviceDir,
      },
    ],
  })
  const { ignored } = watch.mock.calls[0][1]
  expect(ignored(path.join(serviceDir, '.next', 'server', 'page.js'))).toBe(
    true,
  )
  expect(ignored(path.join(serviceDir, '.nuxt', 'x.mjs'))).toBe(true)
  expect(ignored(path.join(serviceDir, 'dist', 'index.js'))).toBe(true)
  expect(ignored(path.join(serviceDir, 'server.mjs'))).toBe(false)
  expect(ignored(path.join(serviceDir, 'handler.js'))).toBe(false)
})

test('a web app run from a subdirectory by its dev.command: its dot-directories do not reload the functions', async () => {
  const { watch } = await start({
    webStarts: [
      { source: 'config', command: 'cd apps/web && nuxt dev', cwd: serviceDir },
    ],
  })
  const { ignored } = watch.mock.calls[0][1]
  expect(
    ignored(path.join(serviceDir, 'apps', 'web', '.nuxt', 'dist', 'x.mjs')),
  ).toBe(true)
  expect(ignored(path.join(serviceDir, 'apps', 'web', 'app.vue'))).toBe(false)
})

test('without web apps the functions watch as before: .next, .output, dist and build reload', async () => {
  const { watch } = await start()
  const { ignored } = watch.mock.calls[0][1]
  for (const dir of ['.next', '.output', 'dist', 'build']) {
    expect(ignored(path.join(serviceDir, dir, 'index.js'))).toBe(false)
  }
  expect(ignored(path.join(serviceDir, 'apps', 'web', '.nuxt', 'x.mjs'))).toBe(
    false,
  )
  expect(ignored(path.join(serviceDir, '.serverless', 'a.js'))).toBe(true)
})

test('watches an explicit config path by basename inside the actual service directory', async () => {
  const serverless = fakeServerless()
  const dir = write(tempDir(), {
    'chosen.config.mjs': 'export default {}\n',
    'chosen.config.yml': 'service: other\n',
  })
  serverless.serviceDir = dir
  serverless.configurationFilename = 'chosen.config'
  const { emitter, runtime, logger } = await start({
    serverless,
    options: { config: path.join('nested', 'chosen.config.mjs') },
  })
  emitter.emit('all', 'change', path.join(dir, 'chosen.config.mjs'))
  expect(
    await waitFor(() =>
      logger.text().includes('run "serverless deploy" for environment'),
    ),
  ).toBe(true)
  expect(logger.text()).toContain('chosen.config.mjs changed:')
  expect(runtime.reloads).toEqual([])
})

test('preserves a full configuration filename even when another supported extension exists', async () => {
  const serverless = fakeServerless()
  const dir = write(tempDir(), {
    'custom.yml': 'service: svc\n',
    'custom.yml.js': 'export default {}\n',
  })
  serverless.serviceDir = dir
  serverless.configurationFilename = 'custom.yml'
  const { emitter, runtime, logger } = await start({ serverless })
  emitter.emit('all', 'change', path.join(dir, 'custom.yml'))
  expect(
    await waitFor(() =>
      logger.text().includes('run "serverless deploy" for environment'),
    ),
  ).toBe(true)
  expect(logger.text()).toContain('custom.yml changed:')
  expect(runtime.reloads).toEqual([])
})

// Creating a symbolic link can need extra privileges on Windows.
;(process.platform === 'win32' ? test.skip : test)(
  'an unreadable configuration file found from the stem is named with its extension',
  async () => {
    const dir = tempDir()
    // A link to itself: stat fails with ELOOP, not ENOENT.
    fs.symlinkSync('serverless.yml', path.join(dir, 'serverless.yml'))
    const serverless = fakeServerless()
    serverless.serviceDir = dir
    serverless.configurationFilename = 'serverless'
    const createRuntime = jest.fn()
    await expect(
      startLaptopRuntime({
        serverless,
        functions: [],
        localRuntimes: {},
        logger: fakeLog(),
        timers: countingTimers(),
        env: {},
        deps: { createRuntime },
      }),
    ).rejects.toMatchObject({
      code: 'DEV_MODE_CONFIG_FILE_UNREADABLE',
      message: `Dev Mode could not read the service configuration file ${path.join(dir, 'serverless.yml')} (ELOOP).`,
    })
    expect(createRuntime).not.toHaveBeenCalled()
  },
)

test('a configuration resolution failure starts no runtime and leaves no timers', async () => {
  // A name no file system accepts fails the same way everywhere. (A path through a regular file
  // fails with ENOTDIR on POSIX, but Windows reports it as missing, which is not a failure.)
  const dir = tempDir()
  const serverless = fakeServerless()
  serverless.serviceDir = dir
  serverless.configurationFilename = 'serverless\0.yml'
  const timers = countingTimers()
  const createRuntime = jest.fn()
  await expect(
    startLaptopRuntime({
      serverless,
      functions: [],
      localRuntimes: {},
      logger: fakeLog(),
      timers,
      env: {},
      deps: { createRuntime },
    }),
  ).rejects.toMatchObject({
    code: 'DEV_MODE_CONFIG_FILE_UNREADABLE',
    message: `Dev Mode could not read the service configuration file ${path.join(dir, 'serverless\0.yml')} (ERR_INVALID_ARG_VALUE).`,
  })
  expect(createRuntime).not.toHaveBeenCalled()
  expect(timers.live()).toBe(0)
})
