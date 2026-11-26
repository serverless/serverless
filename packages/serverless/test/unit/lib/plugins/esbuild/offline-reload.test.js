/**
 * `serverless offline` with the built-in esbuild build: the handlers are built once into
 * `.serverless/build` before serverless-offline starts. With serverless-offline's `reloadHandler`
 * on, the plugin also watches the service and rebuilds that output when a source file changes, so
 * the handler serverless-offline loads for the next request is the edited one. A rebuild that fails
 * keeps the last successful build in place. Without `reloadHandler`, nothing is watched: the build
 * runs once, as before.
 *
 * The rebuild tests run the real esbuild binary and the real file watcher (polling) over a small
 * TypeScript service.
 */
import {
  afterAll,
  afterEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const esbuildModule =
  await import('../../../../../lib/plugins/esbuild/index.js')
const Esbuild = esbuildModule.default
const { offlineReloadsHandlers, offlineConfigFiles } = esbuildModule

jest.setTimeout(60_000)

const dirs = []
const plugins = []
afterEach(async () => {
  // Never leave a watcher polling after a test, whatever it asserted.
  for (const plugin of plugins.splice(0)) {
    await plugin.hooks['after:offline:start']()
  }
})
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

const source = (value) =>
  `export const hello = async (): Promise<string> => '${value}'\n`

const offlineService = ({ options = {}, custom, esbuild = {} } = {}) => {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-offline-')),
  )
  dirs.push(serviceDir)
  fs.mkdirSync(path.join(serviceDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(serviceDir, 'src', 'handler.ts'), source('v1'))
  fs.writeFileSync(
    path.join(serviceDir, 'package.json'),
    '{"name":"svc","private":true}\n',
  )
  fs.writeFileSync(path.join(serviceDir, 'serverless.yml'), 'service: svc\n')
  const functions = { hello: { handler: 'src/handler.hello' } }
  const serverless = {
    serviceDir,
    configurationFilename: 'serverless.yml',
    config: { serviceDir, servicePath: serviceDir },
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs20.x' },
      package: {},
      // `esbuild: null` leaves `build` out: esbuild then builds only the TypeScript handlers.
      build: esbuild === null ? undefined : { esbuild },
      custom,
      functions,
      getFunction: (name) => functions[name],
      getAllFunctions: () => Object.keys(functions),
    },
    pluginManager: { spawn: async () => {} },
  }
  const plugin = new Esbuild(serverless, options)
  plugins.push(plugin)
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  const built = () =>
    fs.readFileSync(path.join(buildDir, 'src', 'handler.js'), 'utf8')
  const write = (value) =>
    fs.writeFileSync(path.join(serviceDir, 'src', 'handler.ts'), value)
  return { plugin, serverless, serviceDir, buildDir, functions, built, write }
}

/** Records every rebuild the plugin starts, and resolves the next one's outcome. */
const recordRebuilds = (plugin) => {
  const outcomes = []
  const waiters = []
  const original = plugin._rebuildForOffline.bind(plugin)
  jest.spyOn(plugin, '_rebuildForOffline').mockImplementation(async (...a) => {
    const outcome = await original(...a)
    outcomes.push(outcome)
    waiters.shift()?.(outcome)
    return outcome
  })
  return {
    outcomes,
    next: () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('no rebuild within 20 s')),
          20_000,
        )
        waiters.push((outcome) => {
          clearTimeout(timer)
          resolve(outcome)
        })
      }),
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The file serverless-offline loads for `handler`: the handler's module path, resolved against
 * `servicePath`, with the first of `.js`, `.mjs` or `.cjs` that exists; null when none does.
 */
const resolveLikeOffline = (servicePath, handler) => {
  const modulePath = path.resolve(
    servicePath,
    handler.slice(0, handler.lastIndexOf('.')),
  )
  const extension = ['.js', '.mjs', '.cjs'].find((ext) =>
    fs.existsSync(modulePath + ext),
  )
  return extension ? modulePath + extension : null
}

describe('offlineReloadsHandlers', () => {
  test.each([
    [{ reloadHandler: true }, undefined, true],
    [{ reloadHandler: 'true' }, undefined, true],
    [{ reloadHandler: false }, undefined, false],
    [{ reloadHandler: 'false' }, undefined, false],
    [{}, undefined, false],
    [{}, {}, false],
    [{}, { 'serverless-offline': {} }, false],
    [{}, { 'serverless-offline': { reloadHandler: true } }, true],
    [{}, { 'serverless-offline': { reloadHandler: false } }, false],
    // The CLI flag wins over custom.serverless-offline, as in serverless-offline.
    [
      { reloadHandler: false },
      { 'serverless-offline': { reloadHandler: true } },
      false,
    ],
    [
      { reloadHandler: true },
      { 'serverless-offline': { reloadHandler: false } },
      true,
    ],
  ])('options %j, custom %j: %s', (options, custom, expected) => {
    expect(offlineReloadsHandlers(options, custom)).toBe(expected)
  })
})

describe('offlineConfigFiles', () => {
  const serviceDir = path.resolve('/svc')
  test('a configuration file name with an extension is that file', () => {
    expect(offlineConfigFiles(serviceDir, 'serverless.yml')).toEqual([
      path.join(serviceDir, 'serverless.yml'),
    ])
  })
  test('a stem is every supported extension of it', () => {
    expect(offlineConfigFiles(serviceDir, 'serverless')).toEqual(
      ['.yml', '.yaml', '.json', '.js', '.cjs', '.mjs', '.ts'].map((ext) =>
        path.join(serviceDir, `serverless${ext}`),
      ),
    )
  })
  test('no name is serverless.<extension>', () => {
    expect(offlineConfigFiles(serviceDir, undefined)).toContain(
      path.join(serviceDir, 'serverless.yml'),
    )
  })
})

describe('serverless offline with reloadHandler', () => {
  test('rebuilds the handler when its source changes, and keeps the last successful build when a rebuild fails', async () => {
    const { plugin, serverless, buildDir, functions, built, write } =
      offlineService({ options: { reloadHandler: true } })
    const rebuilds = recordRebuilds(plugin)

    await plugin.hooks['before:offline:start']()
    expect(serverless.config.servicePath).toBe(serverless.config.serviceDir)
    expect(functions.hello.handler).toBe('.serverless/build/src/handler.hello')
    expect(built()).toMatch(/["']v1["']/)

    let next = rebuilds.next()
    write(source('v2'))
    expect(await next).toMatchObject({ ok: true })
    expect(built()).toMatch(/["']v2["']/)

    // A save in the middle of an edit: the rebuild fails and the last good output stays.
    next = rebuilds.next()
    write('export const hello = async ( => \n')
    const failed = await next
    expect(failed).toMatchObject({ ok: false })
    expect(failed.error.message).toMatch(/error/i)
    expect(built()).toMatch(/["']v2["']/)

    // Fixed: the watching went on.
    next = rebuilds.next()
    write(source('v3'))
    expect(await next).toMatchObject({ ok: true })
    expect(built()).toMatch(/["']v3["']/)

    // A rebuild does not add --enable-source-maps to NODE_OPTIONS again.
    expect(functions.hello.environment.NODE_OPTIONS).toBe(
      '--enable-source-maps',
    )
    // No staging directory is left next to the build directory.
    expect(
      fs
        .readdirSync(path.dirname(buildDir))
        .filter((name) => name.includes('dev-staging')),
    ).toEqual([])
  })

  test('rebuilds a mixed service from the TypeScript source, and leaves its JavaScript function in the service directory', async () => {
    const {
      plugin,
      serverless,
      serviceDir,
      buildDir,
      functions,
      built,
      write,
    } = offlineService({ options: { reloadHandler: true }, esbuild: null })
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'plain.js'),
      "export const hello = async () => 'js'\n",
    )
    functions.plain = { handler: 'src/plain.hello' }
    const rebuilds = recordRebuilds(plugin)

    await plugin.hooks['before:offline:start']()
    const servedFiles = () => ({
      plain: resolveLikeOffline(
        serverless.config.servicePath,
        functions.plain.handler,
      ),
      hello: resolveLikeOffline(
        serverless.config.servicePath,
        functions.hello.handler,
      ),
    })
    const expectedFiles = {
      plain: path.join(serviceDir, 'src', 'plain.js'),
      hello: path.join(buildDir, 'src', 'handler.js'),
    }
    expect(servedFiles()).toEqual(expectedFiles)
    expect(built()).toMatch(/["']v1["']/)

    // A request offline serves while a rebuild runs loads the build output too: the handler is
    // never pointed back at the source.
    const handlersDuringRebuilds = []
    const runBuild = plugin._runBuild.bind(plugin)
    jest.spyOn(plugin, '_runBuild').mockImplementation(async (...args) => {
      handlersDuringRebuilds.push(functions.hello.handler)
      return runBuild(...args)
    })

    for (const value of ['v2', 'v3']) {
      const next = rebuilds.next()
      write(source(value))
      expect(await next).toMatchObject({ ok: true })
      // Built from the edited source, into the file offline loads.
      expect(built()).toMatch(new RegExp(`["']${value}["']`))
      expect(functions.hello.handler).toBe(
        '.serverless/build/src/handler.hello',
      )
      expect(servedFiles()).toEqual(expectedFiles)
    }
    // The build output was never taken as a source: nothing nested in it.
    expect(fs.existsSync(path.join(buildDir, '.serverless'))).toBe(false)
    // The JavaScript function is never built.
    expect(plugin.builtArtifacts.has('plain')).toBe(false)
    expect(fs.readdirSync(path.join(buildDir, 'src'))).not.toContain('plain.js')
    expect(functions.plain.handler).toBe('src/plain.hello')
    expect(handlersDuringRebuilds).toEqual([
      '.serverless/build/src/handler.hello',
      '.serverless/build/src/handler.hello',
    ])
  })

  test('also when reloadHandler is set in custom.serverless-offline', async () => {
    const { plugin, built, write } = offlineService({
      custom: { 'serverless-offline': { reloadHandler: true } },
    })
    const rebuilds = recordRebuilds(plugin)
    await plugin.hooks['before:offline:start']()
    const next = rebuilds.next()
    write(source('v2'))
    expect(await next).toMatchObject({ ok: true })
    expect(built()).toMatch(/["']v2["']/)
  })

  test('without bundling too', async () => {
    const { plugin, built, write } = offlineService({
      options: { reloadHandler: true },
      esbuild: { bundle: false },
    })
    const rebuilds = recordRebuilds(plugin)
    await plugin.hooks['before:offline:start']()
    expect(built()).toMatch(/["']v1["']/)
    const next = rebuilds.next()
    write(source('v2'))
    expect(await next).toMatchObject({ ok: true })
    expect(built()).toMatch(/["']v2["']/)
  })

  test('keeps dependencies an earlier build left in the build directory', async () => {
    const { plugin, buildDir, write } = offlineService({
      options: { reloadHandler: true },
    })
    fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(buildDir, 'node_modules', 'dep', 'index.js'),
      'module.exports = 1\n',
    )
    const rebuilds = recordRebuilds(plugin)
    await plugin.hooks['before:offline:start']()
    // Not recorded as build output.
    expect([...plugin.devOutputs]).toContain(path.join('src', 'handler.js'))
    expect(
      [...plugin.devOutputs].filter((file) => file.startsWith('node_modules')),
    ).toEqual([])
    const next = rebuilds.next()
    write(source('v2'))
    expect(await next).toMatchObject({ ok: true })
    expect(
      fs.existsSync(path.join(buildDir, 'node_modules', 'dep', 'index.js')),
    ).toBe(true)
  })

  test.each([
    ['bundling', {}],
    ['not bundling', { bundle: false }],
  ])(
    'keeps the esbuild metafile a rebuild writes, %s',
    async (name, esbuild) => {
      const { plugin, buildDir, write } = offlineService({
        options: { reloadHandler: true },
        esbuild: { ...esbuild, metafile: true },
      })
      const metafiles = () =>
        fs.readdirSync(buildDir).filter((file) => /^meta\..*json$/.test(file))
      const rebuilds = recordRebuilds(plugin)
      await plugin.hooks['before:offline:start']()
      const before = metafiles()
      expect(before.length).toBeGreaterThan(0)
      for (const value of ['v2', 'v3']) {
        const next = rebuilds.next()
        write(source(value))
        expect(await next).toMatchObject({ ok: true })
        expect(metafiles()).toEqual(before)
      }
    },
  )

  test('stops watching when offline ends', async () => {
    const { plugin, built, write } = offlineService({
      options: { reloadHandler: true },
    })
    const rebuilds = recordRebuilds(plugin)
    await plugin.hooks['before:offline:start']()
    expect(plugin._offlineWatcher).toBeTruthy()
    await plugin.hooks['after:offline:start']()
    expect(plugin._offlineWatcher).toBeNull()
    write(source('v2'))
    await delay(1_500)
    expect(rebuilds.outcomes).toEqual([])
    expect(built()).toMatch(/["']v1["']/)
  })
})

describe('serverless offline without reloadHandler', () => {
  test('builds once and watches nothing, as before', async () => {
    const { plugin, serverless, serviceDir, functions, built, write } =
      offlineService()
    const rebuilds = recordRebuilds(plugin)
    await plugin.hooks['before:offline:start']()
    expect(serverless.config.servicePath).toBe(serviceDir)
    expect(functions.hello.handler).toBe('.serverless/build/src/handler.hello')
    expect(plugin._offlineWatcher).toBeUndefined()
    write(source('v2'))
    await delay(1_500)
    expect(rebuilds.outcomes).toEqual([])
    expect(built()).toMatch(/["']v1["']/)
  })
})

describe('the offline watcher', () => {
  /** A stand-in for chokidar: `emit('all', event, file)` reports a change at once. */
  const fakeWatch = () => {
    const emitter = new EventEmitter()
    emitter.close = async () => {}
    const watch = jest.fn((dir, options) => {
      // `ready` after the caller subscribed.
      setImmediate(() => emitter.emit('ready'))
      return emitter
    })
    return { emitter, watch }
  }

  test('a configuration file change asks for a restart and rebuilds nothing', async () => {
    const { plugin, serviceDir } = offlineService({
      options: { reloadHandler: true },
    })
    const rebuild = jest
      .spyOn(plugin, '_rebuildForOffline')
      .mockResolvedValue({ ok: true })
    const warnings = []
    jest
      .spyOn(plugin, '_offlineWarning')
      .mockImplementation((text) => warnings.push(text))
    const { emitter, watch } = fakeWatch()
    await plugin._build()
    await plugin._watchForOffline({
      sourceHandlers: await plugin._sourceHandlersOfBuiltFunctions(),
      watch,
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'serverless.yml'))
    await delay(300)
    expect(rebuild).not.toHaveBeenCalled()
    expect(warnings).toEqual([
      expect.stringMatching(/serverless\.yml changed.*restart/i),
    ])
  })

  test('the watcher never keeps the process alive on its own', async () => {
    const { plugin } = offlineService({ options: { reloadHandler: true } })
    const { watch } = fakeWatch()
    await plugin._build()
    await plugin._watchForOffline({
      sourceHandlers: await plugin._sourceHandlersOfBuiltFunctions(),
      watch,
    })
    expect(watch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ persistent: false }),
    )
  })

  test('a burst of changes is one rebuild of every built function', async () => {
    const { plugin, serviceDir } = offlineService({
      options: { reloadHandler: true },
    })
    const rebuild = jest
      .spyOn(plugin, '_rebuildForOffline')
      .mockResolvedValue({ ok: true })
    const { emitter, watch } = fakeWatch()
    await plugin._build()
    await plugin._watchForOffline({
      sourceHandlers: await plugin._sourceHandlersOfBuiltFunctions(),
      watch,
    })
    emitter.emit('all', 'change', path.join(serviceDir, 'src', 'handler.ts'))
    emitter.emit('all', 'add', path.join(serviceDir, 'src', 'util.ts'))
    await delay(400)
    expect(rebuild).toHaveBeenCalledTimes(1)
    expect(rebuild).toHaveBeenCalledWith({ hello: 'src/handler.hello' })
  })

  test('a save while the watcher starts leaves every built function on its build output', async () => {
    const { plugin, serverless, serviceDir, functions, built, write } =
      offlineService({ options: { reloadHandler: true } })
    const { emitter, watch } = fakeWatch()
    let atStart
    const watchForOffline = plugin._watchForOffline.bind(plugin)
    jest
      .spyOn(plugin, '_watchForOffline')
      .mockImplementation((options = {}) =>
        watchForOffline({ ...options, watch }),
      )
    // The rebuild that save starts holds once it has begun (its build state reset), and the
    // watcher reports its first scan done only then: the hook resumes during the rebuild.
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const functionsOf = plugin.functions.bind(plugin)
    jest.spyOn(plugin, 'functions').mockImplementation(async (...args) => {
      if (plugin.devRequest) {
        emitter.emit('ready')
        await gate
      }
      return functionsOf(...args)
    })
    const rebuilds = recordRebuilds(plugin)
    const next = rebuilds.next()
    // Saved after the first scan looked at the file, before the scan reported it was done.
    watch.mockImplementationOnce(() => {
      setImmediate(() => {
        write(source('v2'))
        emitter.emit(
          'all',
          'change',
          path.join(serviceDir, 'src', 'handler.ts'),
        )
      })
      return emitter
    })

    await plugin.hooks['before:offline:start']().finally(() => {
      // What offline is pointed at when it starts, while that rebuild still runs.
      atStart = {
        servicePath: serverless.config.servicePath,
        handler: functions.hello.handler,
      }
      release()
    })
    expect(await next).toMatchObject({ ok: true })
    const pointed = {
      servicePath: serviceDir,
      handler: '.serverless/build/src/handler.hello',
    }
    expect(atStart).toEqual(pointed)
    expect({
      servicePath: serverless.config.servicePath,
      handler: functions.hello.handler,
    }).toEqual(pointed)
    expect(built()).toMatch(/["']v2["']/)
    // Built from the source handler, not from the build output offline is pointed at.
    expect(plugin._rebuildForOffline).toHaveBeenCalledWith({
      hello: 'src/handler.hello',
    })
  })
})
