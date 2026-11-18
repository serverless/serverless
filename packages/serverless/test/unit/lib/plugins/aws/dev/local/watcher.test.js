import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import {
  POLL_INTERVAL_MS,
  createWatcher,
  handlerModulesOf,
  isIgnored,
  pathKey,
} from '../../../../../../../lib/plugins/aws/dev/local/watcher.js'
import { countingTimers } from '../attach/fakes.js'
import { cleanTempDirs, tempDir, waitFor, write } from './helpers.js'

jest.setTimeout(30_000)
const serviceDir = path.join(path.sep, 'svc')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const watchers = []
afterEach(async () => {
  for (const { watcher, timers } of watchers.splice(0)) {
    await watcher.close()
    expect(timers.live()).toBe(0)
  }
  cleanTempDirs()
})

const fakeChokidar = () => {
  const emitter = Object.assign(new EventEmitter(), {
    closed: false,
    async close() {
      this.closed = true
    },
  })
  const watch = jest.fn(() => emitter)
  return { emitter, watch }
}
const start = (options) => {
  const timers = countingTimers()
  const watcher = createWatcher({
    serviceDir,
    configFiles: [],
    onChange: async () => {},
    onConfigChange: async () => {},
    onError: () => {},
    timers,
    debounceMs: 20,
    ...options,
  })
  watchers.push({ watcher, timers })
  return watcher
}

describe('isIgnored', () => {
  test.each([
    [
      'node_modules',
      path.join(serviceDir, 'node_modules', 'x', 'index.js'),
      true,
    ],
    [
      '.serverless',
      path.join(serviceDir, '.serverless', 'build', 'a.js'),
      true,
    ],
    ['.git', path.join(serviceDir, '.git', 'HEAD'), true],
    [
      'without web apps, .next as before',
      path.join(serviceDir, '.next', 'server', 'app', 'page.js'),
      false,
    ],
    [
      'without web apps, .output as before',
      path.join(serviceDir, '.output', 'server', 'index.mjs'),
      false,
    ],
    [
      'dist, which may hold handlers',
      path.join(serviceDir, 'dist', 'handler.js'),
      false,
    ],
    [
      'build, which may hold handlers',
      path.join(serviceDir, 'build', 'handler.js'),
      false,
    ],
    ['.venv', path.join(serviceDir, '.venv', 'lib', 'x.py'), true],
    ['__pycache__', path.join(serviceDir, 'app', '__pycache__', 'x.pyc'), true],
    ['a test file', path.join(serviceDir, 'src', 'a.test.js'), true],
    ['a TypeScript test file', path.join(serviceDir, 'src', 'a.test.ts'), true],
    ['a TypeScript spec file', path.join(serviceDir, 'src', 'a.spec.ts'), true],
    ['a module test file', path.join(serviceDir, 'src', 'a.test.mjs'), true],
    ['a React spec file', path.join(serviceDir, 'src', 'a.spec.tsx'), true],
    [
      'a file only named like a test',
      path.join(serviceDir, 'src', 'test-utils.ts'),
      false,
    ],
    [
      'a Python test file',
      path.join(serviceDir, 'tests', 'handler_test.py'),
      true,
    ],
    ['source', path.join(serviceDir, 'src', 'a.ts'), false],
    ['the service directory itself', serviceDir, false],
    [
      'a path outside the service directory',
      path.join(path.sep, 'elsewhere', 'node_modules', 'a.js'),
      false,
    ],
  ])('%s', (name, file, expected) => {
    expect(isIgnored({ serviceDir, file })).toBe(expected)
  })
})

describe("web apps' output directories", () => {
  const ignored = (parts, { webApps = true, functions = [], stats } = {}) =>
    isIgnored({
      serviceDir,
      file: path.join(serviceDir, ...parts),
      handlerModules: handlerModulesOf({ serviceDir, functions }),
      webApps,
      stats,
    })

  test.each([
    ['.next', 'server', 'app', 'page.js'],
    ['.output', 'server', 'index.mjs'],
    ['.nuxt', 'dist', 'server', 'x.mjs'],
    ['.svelte-kit', 'generated', 'root.js'],
    ['.astro', 'content.d.ts'],
    ['dist', 'assets', 'index.js'],
    ['build', 'index.html'],
  ])(
    'with web apps, writes under %s at the service root do not reload the functions',
    (...parts) => {
      expect(ignored(parts)).toBe(true)
    },
  )

  test('dot-directories at any depth, dist and build at the service root only', () => {
    expect(ignored(['src', '.cache', 'a.js'])).toBe(true)
    expect(ignored(['src', 'dist', 'a.js'])).toBe(false)
    expect(ignored(['src', '.env'])).toBe(false)
    expect(ignored(['distribution', 'a.js'])).toBe(false)
    expect(ignored(['handler.js'])).toBe(false)
    // A dot file is no directory: `.env` still reloads.
    expect(ignored(['.env'])).toBe(false)
    // A dot-directory itself is left out once chokidar says it is one.
    expect(ignored(['.nuxt'], { stats: { isDirectory: () => true } })).toBe(
      true,
    )
  })

  test('a web app in a subdirectory of the service: its dot-directories, not its dist', () => {
    expect(ignored(['apps', 'web', '.nuxt', 'dist', 'x.mjs'])).toBe(true)
    expect(ignored(['apps', 'web', 'pages', 'index.vue'])).toBe(false)
    expect(ignored(['apps', 'web', 'dist', 'x.js'])).toBe(false)
  })

  test('a directory that holds a function handler reloads the functions', () => {
    const nitro = { functions: [{ handler: '.output/server/index.handler' }] }
    expect(ignored(['.output', 'server', 'index.mjs'], nitro)).toBe(false)
    expect(ignored(['.output', 'server', 'chunks', 'x.mjs'], nitro)).toBe(false)
    expect(ignored(['.next', 'x.js'], nitro)).toBe(true)
    const built = { functions: [{ handler: '.build/handler.main' }] }
    expect(ignored(['.build', 'handler.js'], built)).toBe(false)
    expect(ignored(['.build', 'lib', 'db.js'], built)).toBe(false)
    const dist = { functions: [{ handler: 'dist/handler.api' }] }
    expect(ignored(['dist', 'lib', 'db.js'], dist)).toBe(false)
    expect(ignored(['build', 'index.html'], dist)).toBe(true)
    // At any depth, per dot-directory.
    const nested = { functions: [{ handler: 'src/.generated/api.main' }] }
    expect(ignored(['src', '.generated', 'api.js'], nested)).toBe(false)
    expect(ignored(['src', '.generated', '.cache', 'x'], nested)).toBe(true)
    expect(ignored(['src', '.cache', 'x.js'], nested)).toBe(true)
  })

  test('without web apps a Nitro-style handler under .output reloads, as before', () => {
    expect(
      isIgnored({
        serviceDir,
        file: path.join(serviceDir, '.output', 'server', 'index.mjs'),
        handlerModules: handlerModulesOf({
          serviceDir,
          functions: [{ handler: '.output/server/index.handler' }],
        }),
      }),
    ).toBe(false)
    expect(ignored(['apps', 'web', '.nuxt', 'x.mjs'], { webApps: false })).toBe(
      false,
    )
  })

  test("a web app's entry still reloads the functions", () => {
    expect(ignored(['app.mjs'])).toBe(false)
  })

  test('the always-ignored directories stay ignored, a handler or not', () => {
    expect(
      ignored(['.serverless', 'build', 'a.js'], {
        functions: [{ handler: '.serverless/build/a.handler' }],
      }),
    ).toBe(true)
  })

  test("the watcher applies the web apps' rule it is given, with chokidar's stats", () => {
    const { watch } = fakeChokidar()
    start({ watch, webApps: true })
    const { ignored: ignoredFn } = watch.mock.calls[0][1]
    expect(ignoredFn(path.join(serviceDir, 'dist', 'a.js'))).toBe(true)
    expect(
      ignoredFn(path.join(serviceDir, '.vite'), { isDirectory: () => true }),
    ).toBe(true)
    expect(ignoredFn(path.join(serviceDir, 'src', 'a.js'))).toBe(false)
  })
})

describe('handler modules named like test files', () => {
  test('a configured handler module is always watched, whatever its name', () => {
    const handlerModules = handlerModulesOf({
      serviceDir,
      functions: [
        { handler: 'jobs/order_test.handler', python: true },
        { handler: 'pkg.report_test.main', python: true, module: 'api' },
      ],
    })
    const watched = (...parts) =>
      !isIgnored({
        serviceDir,
        file: path.join(serviceDir, ...parts),
        handlerModules,
      })
    expect(watched('jobs', 'order_test.py')).toBe(true)
    expect(watched('api', 'pkg', 'report_test.py')).toBe(true)
    // Other test files stay ignored, and so do ignored directories.
    expect(watched('jobs', 'other_test.py')).toBe(false)
    expect(watched('src', 'other.spec.ts')).toBe(false)
    expect(watched('node_modules', 'jobs', 'order_test.py')).toBe(false)
  })

  test("a Node.js handler's module ends at the first dot of its file name, as Lambda loads it", () => {
    const handlerModules = handlerModulesOf({
      serviceDir,
      functions: [
        { handler: 'src/api.routes.get' },
        { handler: 'src/orders.spec.handler' },
        { handler: 'jobs/report.main', python: true },
        { handler: 'jobs.sync.run', python: true },
      ],
    })
    const key = (...parts) => pathKey(path.join(serviceDir, ...parts))
    expect(handlerModules).toEqual(
      new Set([
        key('src', 'api'),
        key('src', 'orders'),
        // Python splits at the last dot, a dotted module being a package path.
        key('jobs', 'report'),
        key('jobs.sync'),
        key('jobs', 'sync'),
      ]),
    )
    // Lambda loads src/orders for "src/orders.spec.handler", so src/orders.spec.ts is a test file.
    expect(
      isIgnored({
        serviceDir,
        file: path.join(serviceDir, 'src', 'orders.spec.ts'),
        handlerModules,
      }),
    ).toBe(true)
  })

  test('the watcher keeps the handler modules it is given', () => {
    const { watch } = fakeChokidar()
    start({
      watch,
      handlerModules: handlerModulesOf({
        serviceDir,
        functions: [{ handler: 'jobs/order_test.handler', python: true }],
      }),
    })
    const [, options] = watch.mock.calls[0]
    expect(
      options.ignored(path.join(serviceDir, 'jobs', 'order_test.py')),
    ).toBe(false)
  })
})

describe('Windows paths', () => {
  // chokidar passes `ignored` the path with forward slashes; Windows compares paths without case.
  const winDir = 'C:\\Users\\RUNNER~1\\svc'
  const handlerModules = handlerModulesOf({
    serviceDir: winDir,
    functions: [
      { handler: 'src/Orders_test.handler', python: true },
      { handler: 'jobs/order_test.handler', python: true },
    ],
    platform: 'win32',
  })
  const ignored = (file) =>
    isIgnored({ serviceDir: winDir, file, handlerModules, platform: 'win32' })

  test('the ignore rules and handler modules hold for every form chokidar and Windows give', () => {
    expect(ignored('C:/Users/RUNNER~1/svc')).toBe(false)
    expect(ignored('C:/Users/RUNNER~1/svc/handler.mjs')).toBe(false)
    expect(ignored('C:/Users/RUNNER~1/svc/node_modules/x/index.js')).toBe(true)
    expect(ignored('C:\\Users\\RUNNER~1\\svc\\.serverless\\build\\a.js')).toBe(
      true,
    )
    expect(ignored('C:/Users/RUNNER~1/svc/src/other.spec.ts')).toBe(true)
    // The configured handler modules, whatever the case or the separators.
    expect(ignored('c:/users/runner~1/svc/src/orders_test.py')).toBe(false)
    expect(ignored('C:\\Users\\RUNNER~1\\svc\\SRC\\Orders_test.py')).toBe(false)
    expect(ignored('C:/Users/RUNNER~1/svc/jobs/order_test.py')).toBe(false)
    // Another drive is outside the service directory.
    expect(ignored('D:/svc/node_modules/x.js')).toBe(false)
  })

  test('a configuration file is reported on its own whatever the case Windows gives', async () => {
    const { emitter, watch } = fakeChokidar()
    const onChange = jest.fn(async () => {})
    const onConfigChange = jest.fn(async () => {})
    start({
      watch,
      serviceDir: winDir,
      configFiles: ['C:\\Users\\RUNNER~1\\svc\\serverless.yml'],
      onChange,
      onConfigChange,
      platform: 'win32',
    })
    emitter.emit('all', 'change', 'c:\\users\\runner~1\\svc\\Serverless.yml')
    expect(await waitFor(() => onConfigChange.mock.calls.length > 0)).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('macOS and Linux paths', () => {
  // macOS's default file systems compare names without case; Linux's compare them with case.
  const functions = [{ handler: 'src/Orders_test.handler', python: true }]
  const watched = (platform, file) =>
    !isIgnored({
      serviceDir,
      file: path.posix.join(serviceDir, file),
      handlerModules: handlerModulesOf({ serviceDir, functions, platform }),
      platform,
    })

  test('a handler module is matched without case on macOS and with case on Linux', () => {
    expect(watched('darwin', 'src/orders_test.py')).toBe(true)
    expect(watched('darwin', 'src/Orders_test.py')).toBe(true)
    expect(watched('linux', 'src/Orders_test.py')).toBe(true)
    expect(watched('linux', 'src/orders_test.py')).toBe(false)
  })

  test('a configuration file is reported on its own whatever the case macOS gives', async () => {
    const { emitter, watch } = fakeChokidar()
    const onChange = jest.fn(async () => {})
    const onConfigChange = jest.fn(async () => {})
    start({
      watch,
      configFiles: [path.posix.join(serviceDir, 'serverless.yml')],
      onChange,
      onConfigChange,
      platform: 'darwin',
    })
    emitter.emit('all', 'change', path.posix.join(serviceDir, 'Serverless.yml'))
    expect(await waitFor(() => onConfigChange.mock.calls.length > 0)).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('createWatcher', () => {
  test('watches the service directory with polling, write-finish detection and the ignore rules', () => {
    const { watch } = fakeChokidar()
    start({ watch })
    const [dir, options] = watch.mock.calls[0]
    expect(dir).toBe(serviceDir)
    expect(options).toMatchObject({
      ignoreInitial: true,
      followSymlinks: false,
      usePolling: true,
      interval: 300,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })
    expect(options.ignored(path.join(serviceDir, 'node_modules', 'a.js'))).toBe(
      true,
    )
    expect(options.ignored(path.join(serviceDir, 'fixtures', 'a.json'))).toBe(
      false,
    )
    expect(options.ignored(path.join(serviceDir, 'src', 'a.js'))).toBe(false)
  })

  test('gives its caller close and ready, and nothing else', () => {
    const { watch } = fakeChokidar()
    expect(Object.keys(start({ watch }))).toEqual(['close', 'ready'])
  })

  test('ready resolves once the first scan is done and one poll has passed, also when asked after it', async () => {
    const { emitter, watch } = fakeChokidar()
    const watcher = start({ watch })
    const asked = watcher.ready()
    const scanned = Date.now()
    emitter.emit('ready')
    expect(await asked).toBe(true)
    // Each polled file has taken its first look: a save from now on is a change.
    expect(Date.now() - scanned).toBeGreaterThanOrEqual(POLL_INTERVAL_MS - 20)
    expect(await watcher.ready()).toBe(true)
  })

  test('ready gives up after its bound, and close ends a wait', async () => {
    const { watch } = fakeChokidar()
    const timers = countingTimers()
    const watcher = start({ watch, timers, readyWaitMs: 20 })
    expect(await watcher.ready()).toBe(false)
    expect(timers.live()).toBe(0)
    const waiting = watcher.ready()
    await watcher.close()
    expect(await waiting).toBe(false)
    expect(timers.live()).toBe(0)
  })

  test('coalesces a burst of changes into one call', async () => {
    const { emitter, watch } = fakeChokidar()
    const onChange = jest.fn(async () => {})
    start({ watch, onChange })
    emitter.emit('all', 'change', path.join(serviceDir, 'a.js'))
    emitter.emit('all', 'change', path.join(serviceDir, 'b.js'))
    emitter.emit('all', 'change', path.join(serviceDir, 'a.js'))
    expect(await waitFor(() => onChange.mock.calls.length > 0)).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].sort()).toEqual([
      path.join(serviceDir, 'a.js'),
      path.join(serviceDir, 'b.js'),
    ])
  })

  test('directory events alone do not reload', async () => {
    const { emitter, watch } = fakeChokidar()
    const onChange = jest.fn(async () => {})
    start({ watch, onChange })
    emitter.emit('all', 'addDir', path.join(serviceDir, 'src'))
    emitter.emit('all', 'unlinkDir', path.join(serviceDir, 'old'))
    await sleep(60)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('changes during a reload run once more, after it', async () => {
    const { emitter, watch } = fakeChokidar()
    let release
    const calls = []
    const onChange = jest.fn(async (files) => {
      calls.push(files)
      if (calls.length === 1) {
        await new Promise((resolve) => {
          release = resolve
        })
      }
    })
    start({ watch, onChange })
    emitter.emit('all', 'change', path.join(serviceDir, 'a.js'))
    expect(await waitFor(() => calls.length === 1)).toBe(true)
    emitter.emit('all', 'change', path.join(serviceDir, 'b.js'))
    emitter.emit('all', 'change', path.join(serviceDir, 'c.js'))
    // Long enough for their debounce to have run: they wait for the reload under way.
    await sleep(60)
    expect(onChange).toHaveBeenCalledTimes(1)
    release()
    expect(await waitFor(() => calls.length === 2)).toBe(true)
    expect(calls).toEqual([
      [path.join(serviceDir, 'a.js')],
      [path.join(serviceDir, 'b.js'), path.join(serviceDir, 'c.js')],
    ])
  })

  test('a configuration file change is reported apart from code changes', async () => {
    const { emitter, watch } = fakeChokidar()
    const onChange = jest.fn(async () => {})
    const onConfigChange = jest.fn(async () => {})
    const config = path.join(serviceDir, 'serverless.yml')
    start({ watch, onChange, onConfigChange, configFiles: [config] })
    emitter.emit('all', 'change', config)
    expect(await waitFor(() => onConfigChange.mock.calls.length === 1)).toBe(
      true,
    )
    expect(onConfigChange).toHaveBeenCalledWith([config])
    expect(onChange).not.toHaveBeenCalled()
    emitter.emit('all', 'change', config)
    emitter.emit('all', 'change', path.join(serviceDir, 'a.js'))
    expect(
      await waitFor(
        () =>
          onConfigChange.mock.calls.length === 2 &&
          onChange.mock.calls.length === 1,
      ),
    ).toBe(true)
    expect(onConfigChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledWith([path.join(serviceDir, 'a.js')])
  })

  test('a failing reload does not stop the watcher', async () => {
    const { emitter, watch } = fakeChokidar()
    const onChange = jest.fn(async () => {
      throw new Error('reload failed')
    })
    const onError = jest.fn()
    start({ watch, onChange, onError })
    emitter.emit('all', 'change', path.join(serviceDir, 'a.js'))
    expect(await waitFor(() => onError.mock.calls.length === 1)).toBe(true)
    emitter.emit('all', 'change', path.join(serviceDir, 'b.js'))
    expect(await waitFor(() => onError.mock.calls.length === 2)).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(2)
  })

  test('a watcher error is reported', async () => {
    const { emitter, watch } = fakeChokidar()
    const onError = jest.fn()
    start({ watch, onError })
    emitter.emit('error', new Error('EMFILE'))
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'EMFILE' }),
    )
  })

  test('close stops the watcher and its pending timer', async () => {
    const { emitter, watch } = fakeChokidar()
    const onChange = jest.fn(async () => {})
    const watcher = start({ watch, onChange })
    emitter.emit('all', 'change', path.join(serviceDir, 'a.js'))
    await watcher.close()
    await sleep(60)
    expect(onChange).not.toHaveBeenCalled()
    expect(emitter.closed).toBe(true)
  })

  test('sees a real file change and ignores node_modules (chokidar, polling)', async () => {
    const dir = write(tempDir(), {
      'handler.mjs': 'export const handler = () => 1\n',
      'node_modules/x/index.js': '',
    })
    const changes = []
    const watcher = start({
      serviceDir: dir,
      onChange: async (files) => changes.push(...files),
      debounceMs: 50,
    })
    // Once ready resolves, the first save is seen.
    expect(await watcher.ready()).toBe(true)
    fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'index.js'), 'changed')
    fs.writeFileSync(
      path.join(dir, 'handler.mjs'),
      'export const handler = () => 2\n',
    )
    expect(await waitFor(() => changes.length > 0, 5_000)).toBe(true)
    expect(new Set(changes)).toEqual(new Set([path.join(dir, 'handler.mjs')]))
  })

  test('without web apps, sees a handler rebuilt under .output (chokidar, polling)', async () => {
    const dir = write(tempDir(), {
      '.output/server/index.mjs': 'export const handler = () => 1\n',
    })
    const changes = []
    const watcher = start({
      serviceDir: dir,
      handlerModules: handlerModulesOf({
        serviceDir: dir,
        functions: [{ handler: '.output/server/index.handler' }],
      }),
      onChange: async (files) => changes.push(...files),
      debounceMs: 50,
    })
    expect(await watcher.ready()).toBe(true)
    write(dir, {
      '.output/server/index.mjs': 'export const handler = () => 2\n',
    })
    expect(await waitFor(() => changes.length > 0, 5_000)).toBe(true)
    expect(changes).toEqual([path.join(dir, '.output', 'server', 'index.mjs')])
  })

  test("with web apps, does not see a web framework's dev server writing its output (chokidar, polling)", async () => {
    const dir = write(tempDir(), {
      'handler.mjs': 'export const handler = () => 1\n',
      '.next/server/app/page.js': '',
      '.nuxt/dist/x.mjs': '',
      'apps/web/.nuxt/dist/y.mjs': '',
    })
    const changes = []
    const watcher = start({
      serviceDir: dir,
      webApps: true,
      onChange: async (files) => changes.push(...files),
      debounceMs: 50,
    })
    expect(await watcher.ready()).toBe(true)
    write(dir, {
      '.next/server/app/page.js': 'changed',
      '.next/cache/webpack/new.pack': 'new',
      '.nuxt/dist/x.mjs': 'changed',
      '.svelte-kit/generated/root.js': 'new',
      'apps/web/.nuxt/dist/y.mjs': 'changed',
    })
    await sleep(POLL_INTERVAL_MS * 4)
    expect(changes).toEqual([])
    fs.writeFileSync(
      path.join(dir, 'handler.mjs'),
      'export const handler = () => 2\n',
    )
    expect(await waitFor(() => changes.length > 0, 5_000)).toBe(true)
    expect(new Set(changes)).toEqual(new Set([path.join(dir, 'handler.mjs')]))
  })
})
