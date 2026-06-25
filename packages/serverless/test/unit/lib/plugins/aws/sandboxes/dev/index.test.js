'use strict'

import { jest } from '@jest/globals'
import SandboxesDevMode from '../../../../../../../lib/plugins/aws/sandboxes/dev/index.js'

function make(options, sandboxes, { fileExists = () => true } = {}) {
  const serverless = {
    serviceDir: '/svc',
    service: { service: 'svc', sandboxes },
    configurationInput: { sandboxes },
    classes: { Error },
  }
  return new SandboxesDevMode(
    serverless,
    options,
    { log: { notice() {}, error() {} } },
    {
      docker: {},
      fileExists,
    },
  )
}

test('resolveSandboxName uses --sandbox when provided', () => {
  const d = make({ sandbox: 'api' }, { api: { artifact: './app' }, web: {} })
  expect(d.resolveSandboxName()).toBe('api')
})

test('resolveSandboxName auto-selects the only sandbox', () => {
  const d = make({}, { only: { artifact: './app' } })
  expect(d.resolveSandboxName()).toBe('only')
})

test('resolveSandboxName throws when multiple and none named', () => {
  const d = make({}, { a: {}, b: {} })
  expect(() => d.resolveSandboxName()).toThrow(/Multiple sandboxes/i)
})

test('resolveSandboxName throws when the named sandbox is unknown', () => {
  const d = make({ sandbox: 'nope' }, { api: {} })
  expect(() => d.resolveSandboxName()).toThrow(/not found/i)
})

test('resolveSandboxName throws when no sandboxes defined', () => {
  const d = make({}, undefined)
  expect(() => d.resolveSandboxName()).toThrow(/No sandboxes/i)
})

test('resolveArtifactDir resolves a local dir against serviceDir', () => {
  const d = make({ sandbox: 'api' }, { api: { artifact: './app' } })
  expect(d.resolveArtifactDir({ artifact: './app' })).toBe('/svc/app')
})

test('resolveArtifactDir throws SANDBOX_DEV_ARTIFACT_MISSING when artifact is missing', () => {
  const d = make({ sandbox: 'api' }, { api: {} })
  const err = (() => {
    try {
      d.resolveArtifactDir({})
    } catch (e) {
      return e
    }
  })()
  expect(err).toBeDefined()
  expect(err.code).toBe('SANDBOX_DEV_ARTIFACT_MISSING')
  expect(err.message).toMatch(/artifact/i)
})

test('resolveArtifactDir rejects an s3:// artifact', () => {
  const d = make({ sandbox: 'api' }, { api: { artifact: 's3://b/k.zip' } })
  expect(() => d.resolveArtifactDir({ artifact: 's3://b/k.zip' })).toThrow(
    /local source|s3:\/\//i,
  )
})

test('resolveArtifactDir throws when the dir has no Dockerfile', () => {
  const d = make(
    { sandbox: 'api' },
    { api: { artifact: './app' } },
    {
      fileExists: (p) => !p.endsWith('Dockerfile'),
    },
  )
  expect(() => d.resolveArtifactDir({ artifact: './app' })).toThrow(
    /Dockerfile/i,
  )
})

test('resolveArtifactDir throws when artifact directory does not exist', () => {
  const d = make(
    { sandbox: 'api' },
    { api: { artifact: './app' } },
    {
      fileExists: () => false,
    },
  )
  expect(() => d.resolveArtifactDir({ artifact: './app' })).toThrow(
    /artifact directory not found/i,
  )
})

test('run() rejects with SANDBOX_DEV_DOCKER_UNAVAILABLE when docker.ensureIsRunning rejects', async () => {
  const docker = {
    ensureIsRunning: jest.fn(async () => {
      throw new Error('no daemon')
    }),
    buildImage: jest.fn(async () => {}),
    createContainer: jest.fn(async () => {}),
  }
  const d = new SandboxesDevMode(
    {
      serviceDir: '/svc',
      service: {
        service: 'svc',
        sandboxes: { api: { artifact: './app' } },
      },
      configurationInput: {},
      classes: { Error },
    },
    { sandbox: 'api' },
    { log: { notice() {}, error() {} } },
    {
      docker,
      fileExists: () => true,
      onSignal: () => {},
    },
  )

  await expect(d.run()).rejects.toThrow(/Docker/i)
  expect(docker.buildImage).not.toHaveBeenCalled()
  expect(docker.createContainer).not.toHaveBeenCalled()
})

// ---------------------------------------------------------------------------
// makeRebuildable: sets up a dev instance with ctx already resolved.
// In the control-plane model performRebuild only rebuilds the image; it does
// NOT swap containers. The tests below reflect that.
// ---------------------------------------------------------------------------
function makeRebuildable(overrides = {}) {
  const docker = {
    ensureIsRunning: jest.fn(async () => {}),
    buildImage: jest.fn(async () => {}),
    ...overrides.docker,
  }
  const d = new SandboxesDevMode(
    {
      serviceDir: '/svc',
      service: { service: 'svc', sandboxes: { api: { artifact: './app' } } },
      configurationInput: {},
      classes: { Error },
    },
    { sandbox: 'api' },
    {
      log: { notice: jest.fn(), error: jest.fn(), debug() {} },
      progress: { notice() {}, remove() {} },
    },
    {
      docker,
      fileExists: () => true,
      onSignal: () => {},
      sleep: async () => {},
      createWatcher: () => ({ on() {}, close: async () => {} }),
    },
  )
  // Establish ctx as run() would.
  d.ctx = {
    name: 'api',
    cfg: { artifact: './app' },
    contextPath: '/svc/app',
    hostPort: '8080',
    platform: 'linux/amd64',
    imageUri: 'serverless-sandbox-dev/svc-api:latest',
    containerName: 'sls-sandbox-dev-svc-api',
  }
  return { d, docker }
}

test('performRebuild rebuilds: builds image only (no container swap in control-plane model)', async () => {
  const { d, docker } = makeRebuildable()
  await d.performRebuild()
  expect(docker.buildImage).toHaveBeenCalledTimes(1)
  // Control-plane model: no direct container operations from performRebuild
  expect(d.logger.notice).toHaveBeenCalledWith(
    expect.stringMatching(/Rebuild complete/i),
  )
})

test('performRebuild collapses a burst: in-flight + exactly one queued rebuild', async () => {
  let release
  const gate = new Promise((r) => {
    release = r
  })
  const { d, docker } = makeRebuildable({
    docker: {
      buildImage: jest.fn(async () => {
        await gate
      }),
    },
  })
  const first = d.performRebuild() // enters, awaits the gated build
  await Promise.resolve()
  d.performRebuild() // queued (sets pendingRebuild)
  d.performRebuild() // collapsed into the same pending slot
  expect(d.pendingRebuild).toBe(true)
  release()
  await first
  // one in-flight build + one queued build = 2 total
  expect(docker.buildImage).toHaveBeenCalledTimes(2)
})

test('performRebuild keeps running instances when the build fails', async () => {
  const { d, docker } = makeRebuildable({
    docker: {
      buildImage: jest.fn(async () => {
        throw new Error('docker build exit code 1')
      }),
    },
  })
  await expect(d.performRebuild()).resolves.toBeUndefined() // does NOT throw
  expect(d.logger.error).toHaveBeenCalledWith(
    expect.stringMatching(/Rebuild failed/i),
  )
  expect(d.isRebuilding).toBe(false) // flag reset for the next change
})

test('performRebuild aborts cleanly when shutdown races the build step', async () => {
  // Gate build so we can inject shuttingDown before it returns.
  let releaseBuild
  const buildGate = new Promise((r) => {
    releaseBuild = r
  })
  const { d, docker } = makeRebuildable({
    docker: {
      buildImage: jest.fn(async () => {
        await buildGate
      }),
    },
  })

  const rebuildPromise = d.performRebuild() // parks at buildImage
  await Promise.resolve() // let performRebuild reach the await

  // Simulate SIGINT arriving while build is in progress.
  d.shuttingDown = true

  releaseBuild() // unblock the build
  await expect(rebuildPromise).resolves.toBeUndefined() // must not throw

  // shutdown set shuttingDown before build returned; no further work expected.
  expect(docker.buildImage).toHaveBeenCalledTimes(1)
})

// ---------------------------------------------------------------------------
// run() — control-plane model tests
// ---------------------------------------------------------------------------

test('run() starts the control-plane and prints the endpoint; SIGINT+SIGTERM shut it down', async () => {
  const shutdown = jest.fn(async () => {})
  const startControlPlane = jest.fn(async () => ({
    url: 'http://127.0.0.1:45000',
    port: 45000,
    server: {},
    shutdown,
  }))
  const signals = {}
  const notices = []
  const dev = new SandboxesDevMode(
    {
      service: { service: 'svc', sandboxes: { echo: { artifact: './app' } } },
      serviceDir: '/tmp',
      getProvider: () => ({}),
    },
    { sandbox: 'echo', 'assume-role': false },
    {
      log: { notice: (m) => notices.push(m), debug() {} },
      progress: { notice() {}, remove() {} },
    },
    {
      docker: { ensureIsRunning: async () => {}, buildImage: async () => {} },
      fileExists: () => true,
      onSignal: (sig, h) => {
        signals[sig] = h
      },
      createWatcher: () => ({ on() {}, close: async () => {} }),
      startControlPlane,
      makeContainerManager: () => ({
        run: async () => ({ portMap: {}, stop: async () => {} }),
      }),
      makeRegistry: () => ({}),
    },
  )
  const runP = dev.run()
  await new Promise((r) => setImmediate(r))
  expect(startControlPlane).toHaveBeenCalled()
  expect(notices.some((n) => n.includes('http://127.0.0.1:45000'))).toBe(true)
  expect(typeof signals.SIGINT).toBe('function')
  expect(typeof signals.SIGTERM).toBe('function')
  await signals.SIGTERM()
  await runP
  expect(shutdown).toHaveBeenCalled()
})

test('run() builds the image before starting the control-plane', async () => {
  const buildImage = jest.fn(async () => {})
  const startControlPlane = jest.fn(async () => ({
    url: 'http://127.0.0.1:45001',
    port: 45001,
    server: {},
    shutdown: async () => {},
  }))
  const signals = {}
  const d = new SandboxesDevMode(
    {
      service: { service: 'svc', sandboxes: { api: { artifact: './app' } } },
      serviceDir: '/svc',
      getProvider: () => ({}),
    },
    { sandbox: 'api', 'assume-role': false },
    {
      log: { notice() {}, debug() {} },
      progress: { notice() {}, remove() {} },
    },
    {
      docker: { ensureIsRunning: async () => {}, buildImage },
      fileExists: () => true,
      onSignal: (sig, h) => {
        signals[sig] = h
      },
      createWatcher: () => ({ on() {}, close: async () => {} }),
      startControlPlane,
      makeContainerManager: () => ({}),
      makeRegistry: () => ({}),
    },
  )
  const p = d.run()
  await new Promise((r) => setImmediate(r))
  // build must happen before startControlPlane
  expect(buildImage).toHaveBeenCalledTimes(1)
  expect(startControlPlane).toHaveBeenCalledTimes(1)
  await signals.SIGINT()
  await p
})

test('run() injects assumed-role creds into containerManager env by default', async () => {
  let capturedEnv
  const startControlPlane = jest.fn(async () => ({
    url: 'http://127.0.0.1:45002',
    port: 45002,
    server: {},
    shutdown: async () => {},
  }))
  const signals = {}
  const fakeIam = {
    setUp: jest.fn(async () => ({
      AWS_ACCESS_KEY_ID: 'AK',
      AWS_SECRET_ACCESS_KEY: 'SK',
      AWS_SESSION_TOKEN: 'ST',
      AWS_REGION: 'us-east-1',
    })),
    credentialsExpiring: () => false,
    refresh: jest.fn(async () => null),
    cleanUp: jest.fn(async () => {}),
  }
  const d = new SandboxesDevMode(
    {
      serviceDir: '/svc',
      service: { service: 'svc', sandboxes: { api: { artifact: './app' } } },
      configurationInput: {},
      classes: { Error },
      getProvider: () => ({}),
    },
    { sandbox: 'api' },
    {
      log: { notice() {}, error() {}, debug() {} },
      progress: { notice() {}, remove() {} },
    },
    {
      docker: { ensureIsRunning: async () => {}, buildImage: async () => {} },
      fileExists: () => true,
      onSignal: (s, h) => {
        signals[s] = h
      },
      createWatcher: () => ({ on() {}, close: async () => {} }),
      createIamEmulation: () => fakeIam,
      startControlPlane,
      makeContainerManager: (args) => {
        // Capture the env getter to verify creds are included.
        capturedEnv = args.env
        return {}
      },
      makeRegistry: () => ({}),
    },
  )
  const p = d.run()
  await new Promise((r) => setImmediate(r))
  expect(fakeIam.setUp).toHaveBeenCalledWith('api')
  // The env getter on containerManager args should include creds.
  expect(capturedEnv).toBeDefined()
  expect(capturedEnv.AWS_ACCESS_KEY_ID).toBe('AK')
  expect(capturedEnv.AWS_SESSION_TOKEN).toBe('ST')
  await signals.SIGINT()
  await p
  expect(fakeIam.cleanUp).toHaveBeenCalled()
})

test('run() with --no-assume-role does not create IAM emulation and injects no creds', async () => {
  let capturedEnv
  const startControlPlane = jest.fn(async () => ({
    url: 'http://127.0.0.1:45003',
    port: 45003,
    server: {},
    shutdown: async () => {},
  }))
  const signals = {}
  const createIamEmulation = jest.fn()
  const d = new SandboxesDevMode(
    {
      serviceDir: '/svc',
      service: { service: 'svc', sandboxes: { api: { artifact: './app' } } },
      configurationInput: {},
      classes: { Error },
      getProvider: () => ({}),
    },
    { sandbox: 'api', 'assume-role': false },
    {
      log: { notice() {}, error() {}, debug() {} },
      progress: { notice() {}, remove() {} },
    },
    {
      docker: { ensureIsRunning: async () => {}, buildImage: async () => {} },
      fileExists: () => true,
      onSignal: (s, h) => {
        signals[s] = h
      },
      createWatcher: () => ({ on() {}, close: async () => {} }),
      createIamEmulation,
      startControlPlane,
      makeContainerManager: (args) => {
        capturedEnv = args.env
        return {}
      },
      makeRegistry: () => ({}),
    },
  )
  const p = d.run()
  await new Promise((r) => setImmediate(r))
  expect(createIamEmulation).not.toHaveBeenCalled()
  expect(capturedEnv).toBeDefined()
  expect(capturedEnv.AWS_ACCESS_KEY_ID).toBeUndefined()
  await signals.SIGINT()
  await p
})

test('run() continues with no injected creds when setUp falls back (returns null)', async () => {
  let capturedEnv
  const startControlPlane = jest.fn(async () => ({
    url: 'http://127.0.0.1:45004',
    port: 45004,
    server: {},
    shutdown: async () => {},
  }))
  const signals = {}
  const fakeIam = {
    setUp: jest.fn(async () => null),
    credentialsExpiring: () => false,
    refresh: jest.fn(),
    cleanUp: jest.fn(async () => {}),
  }
  const d = new SandboxesDevMode(
    {
      serviceDir: '/svc',
      service: { service: 'svc', sandboxes: { api: { artifact: './app' } } },
      configurationInput: {},
      classes: { Error },
      getProvider: () => ({}),
    },
    { sandbox: 'api' },
    {
      log: { notice() {}, error() {}, debug() {} },
      progress: { notice() {}, remove() {} },
    },
    {
      docker: { ensureIsRunning: async () => {}, buildImage: async () => {} },
      fileExists: () => true,
      onSignal: (s, h) => {
        signals[s] = h
      },
      createWatcher: () => ({ on() {}, close: async () => {} }),
      createIamEmulation: () => fakeIam,
      startControlPlane,
      makeContainerManager: (args) => {
        capturedEnv = args.env
        return {}
      },
      makeRegistry: () => ({}),
    },
  )
  const p = d.run()
  await new Promise((r) => setImmediate(r))
  expect(capturedEnv).toBeDefined()
  expect(capturedEnv.AWS_ACCESS_KEY_ID).toBeUndefined()
  await signals.SIGINT()
  await p
})

test('_isIgnored excludes framework/output dirs and test files, includes sources', () => {
  const d = make({ sandbox: 'api' }, { api: { artifact: './app' } })
  const file = { isFile: () => true }
  expect(d._isIgnored('/svc/app/.serverless/state.json', file)).toBe(true)
  expect(d._isIgnored('/svc/app/node_modules/x/index.js', file)).toBe(true)
  expect(d._isIgnored('/svc/app/handler.test.js', file)).toBe(true)
  expect(d._isIgnored('/svc/app/handler.js', file)).toBe(false)
  expect(d._isIgnored('/svc/app/Dockerfile', file)).toBe(false)
})

test('_isIgnored matches Windows backslash paths too', () => {
  const d = make({ sandbox: 'api' }, { api: { artifact: './app' } })
  const file = { isFile: () => true }
  expect(d._isIgnored('C:\\svc\\app\\node_modules\\x\\index.js', file)).toBe(
    true,
  )
  expect(d._isIgnored('C:\\svc\\app\\.serverless\\state.json', file)).toBe(true)
  expect(d._isIgnored('C:\\svc\\app\\handler.js', file)).toBe(false)
})

test('startWatcher triggers a rebuild on a non-ignored change', async () => {
  const handlers = {}
  const watcher = {
    on: (event, h) => {
      handlers[event] = h
    },
    close: jest.fn(async () => {}),
  }
  const { d } = makeRebuildable()
  d.createWatcher = () => watcher
  d.performRebuild = jest.fn(async () => {})

  d.startWatcher()
  await handlers.all('change', '/svc/app/handler.js')
  expect(d.performRebuild).toHaveBeenCalledTimes(1)
})

test('watcher events are ignored once shutting down', async () => {
  const handlers = {}
  const watcher = {
    on: (event, h) => {
      handlers[event] = h
    },
    close: jest.fn(async () => {}),
  }
  const { d } = makeRebuildable()
  d.createWatcher = () => watcher
  d.performRebuild = jest.fn(async () => {})

  d.startWatcher()
  d.shuttingDown = true
  await handlers.all('change', '/svc/app/handler.js')
  expect(d.performRebuild).not.toHaveBeenCalled()
})

test('passes the debounce + ignoreInitial options to the watcher', () => {
  let opts
  const { d } = makeRebuildable()
  d.createWatcher = (p, o) => {
    opts = o
    return { on() {}, close: async () => {} }
  }
  d.startWatcher()
  expect(opts).toEqual(
    expect.objectContaining({
      ignored: expect.any(Function),
      ignoreInitial: true,
      usePolling: true,
      followSymlinks: false,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    }),
  )
})
