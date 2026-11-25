/**
 * Where serverless-offline loads each function from after the esbuild plugin's
 * `before:offline:start` build.
 *
 * serverless-offline resolves every handler against `serverless.config.servicePath`
 * (whose setter also moves `serverless.serviceDir`). The build covers only the
 * functions esbuild builds — with no `build` setting, only the TypeScript ones —
 * so the plugin must point those functions, and only those, at the build
 * directory. Repointing the whole service there left the JavaScript functions of
 * a mixed JavaScript + TypeScript service without a file to load.
 *
 * These tests run the real esbuild binary over small services, then resolve each
 * handler the way serverless-offline does: the handler's module path, joined to
 * the service path, with `.js`, `.mjs` or `.cjs` appended.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default
const Config = (await import('../../../../../lib/classes/config.js')).default

const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

const JS_SOURCE = "export const hello = async () => ({ from: 'js' })\n"
const TS_SOURCE =
  "export const hello = async (): Promise<{ from: string }> => ({ from: 'ts' })\n"

const OFFLINE_EXTENSIONS = ['.js', '.mjs', '.cjs']

/**
 * The file serverless-offline loads for `handler`, resolved against the
 * service path it reads, or null when none of the extensions it tries exists.
 */
const resolveLikeOffline = (servicePath, handler) => {
  const modulePath = path.resolve(
    servicePath,
    handler.slice(0, handler.lastIndexOf('.')),
  )
  const extension = OFFLINE_EXTENSIONS.find((ext) =>
    fs.existsSync(modulePath + ext),
  )
  return extension ? modulePath + extension : null
}

/**
 * Writes `files` into a new service directory and returns a plugin instance
 * over a serverless object whose `config` is the real `Config` class, so a
 * service-path change is visible on `serverless.serviceDir` too, as in the CLI.
 */
const createService = ({
  files,
  functions,
  build,
  options = {},
  runtime = 'nodejs24.x',
}) => {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-offline-'))
  createdServiceDirs.push(serviceDir)
  for (const [file, contents] of Object.entries({
    'package.json': '{"type":"module"}',
    ...files,
  })) {
    fs.mkdirSync(path.dirname(path.join(serviceDir, file)), {
      recursive: true,
    })
    fs.writeFileSync(path.join(serviceDir, file), contents)
  }

  const serverless = {
    serviceDir,
    service: {
      service: 'offline-handler-paths',
      provider: { name: 'aws', runtime },
      build,
      functions,
      getFunction: (alias) => functions[alias],
    },
  }
  serverless.config = new Config(serverless, { serviceDir })

  const plugin = new Esbuild(serverless, options)
  return { plugin, serverless, serviceDir, functions }
}

describe('esbuild before:offline:start', () => {
  it('serves a JavaScript function from the service directory and a TypeScript one from the build in a mixed service', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'handler.js': JS_SOURCE, 'hello-ts.ts': TS_SOURCE },
      functions: {
        helloJs: { handler: 'handler.hello' },
        helloTs: { handler: 'hello-ts.hello' },
      },
    })

    await plugin.hooks['before:offline:start']()

    expect(serverless.config.servicePath).toBe(serviceDir)
    expect(serverless.serviceDir).toBe(serviceDir)
    expect(functions.helloJs.handler).toBe('handler.hello')
    expect(functions.helloTs.handler).toBe('.serverless/build/hello-ts.hello')
    expect(
      resolveLikeOffline(
        serverless.config.servicePath,
        functions.helloJs.handler,
      ),
    ).toBe(path.join(serviceDir, 'handler.js'))
    expect(
      resolveLikeOffline(
        serverless.config.servicePath,
        functions.helloTs.handler,
      ),
    ).toBe(path.join(serviceDir, '.serverless', 'build', 'hello-ts.js'))
  })

  it('points a TypeScript-only service at the same built files as before, without moving the service directory', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'src/fns/typed.ts': TS_SOURCE, 'other.ts': TS_SOURCE },
      functions: {
        typed: { handler: './src/fns/typed.hello' },
        other: { handler: 'other.hello' },
      },
    })

    await plugin.hooks['before:offline:start']()

    expect(serverless.serviceDir).toBe(serviceDir)
    expect(functions.typed.handler).toBe(
      '.serverless/build/src/fns/typed.hello',
    )
    expect(functions.other.handler).toBe('.serverless/build/other.hello')
    expect(
      resolveLikeOffline(
        serverless.config.servicePath,
        functions.typed.handler,
      ),
    ).toBe(
      path.join(serviceDir, '.serverless', 'build', 'src', 'fns', 'typed.js'),
    )
  })

  it('points every Node.js function at the build when the build covers all of them', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'handler.js': JS_SOURCE, 'hello-ts.ts': TS_SOURCE },
      functions: {
        helloJs: { handler: 'handler.hello' },
        helloTs: { handler: 'hello-ts.hello' },
      },
      build: { esbuild: { bundle: true } },
    })

    await plugin.hooks['before:offline:start']()

    expect(serverless.serviceDir).toBe(serviceDir)
    expect(functions.helloJs.handler).toBe('.serverless/build/handler.hello')
    expect(functions.helloTs.handler).toBe('.serverless/build/hello-ts.hello')
    expect(
      resolveLikeOffline(
        serverless.config.servicePath,
        functions.helloJs.handler,
      ),
    ).toBe(path.join(serviceDir, '.serverless', 'build', 'handler.js'))
  })

  it('points every Node.js function at its compiled file when bundling is off', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'handler.js': JS_SOURCE, 'src/hello-ts.ts': TS_SOURCE },
      functions: {
        helloJs: { handler: 'handler.hello' },
        helloTs: { handler: 'src/hello-ts.hello' },
      },
      build: { esbuild: { bundle: false } },
    })

    await plugin.hooks['before:offline:start']()

    expect(serverless.serviceDir).toBe(serviceDir)
    expect(functions.helloJs.handler).toBe('.serverless/build/handler.hello')
    expect(functions.helloTs.handler).toBe(
      '.serverless/build/src/hello-ts.hello',
    )
    expect(
      resolveLikeOffline(
        serverless.config.servicePath,
        functions.helloTs.handler,
      ),
    ).toBe(path.join(serviceDir, '.serverless', 'build', 'src', 'hello-ts.js'))
  })

  it('points at the emitted file when outExtension renames it', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'hello-ts.ts': TS_SOURCE },
      functions: { helloTs: { handler: 'hello-ts.hello' } },
      build: { esbuild: { outExtension: { '.js': '.mjs' } } },
    })

    await plugin.hooks['before:offline:start']()

    expect(functions.helloTs.handler).toBe('.serverless/build/hello-ts.hello')
    expect(
      resolveLikeOffline(
        serverless.config.servicePath,
        functions.helloTs.handler,
      ),
    ).toBe(path.join(serviceDir, '.serverless', 'build', 'hello-ts.mjs'))
  })

  it('leaves functions of other runtimes unchanged', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'hello-ts.ts': TS_SOURCE, 'handler.py': 'def hello(e, c): 1\n' },
      functions: {
        helloTs: { handler: 'hello-ts.hello' },
        helloPy: { handler: 'handler.hello', runtime: 'python3.13' },
      },
    })

    await plugin.hooks['before:offline:start']()

    expect(serverless.serviceDir).toBe(serviceDir)
    expect(functions.helloPy.handler).toBe('handler.hello')
    expect(functions.helloTs.handler).toBe('.serverless/build/hello-ts.hello')
  })

  it('changes nothing when esbuild is turned off', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'handler.js': JS_SOURCE, 'hello-ts.ts': TS_SOURCE },
      functions: {
        helloJs: { handler: 'handler.hello' },
        helloTs: { handler: 'hello-ts.hello' },
      },
      build: { esbuild: false },
    })

    await plugin.hooks['before:offline:start']()

    expect(serverless.serviceDir).toBe(serviceDir)
    expect(functions.helloJs.handler).toBe('handler.hello')
    expect(functions.helloTs.handler).toBe('hello-ts.hello')
    expect(fs.existsSync(path.join(serviceDir, '.serverless', 'build'))).toBe(
      false,
    )
  })

  it('changes nothing in a JavaScript-only service', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'handler.js': JS_SOURCE },
      functions: { helloJs: { handler: 'handler.hello' } },
    })

    await plugin.hooks['before:offline:start']()

    expect(serverless.serviceDir).toBe(serviceDir)
    expect(functions.helloJs.handler).toBe('handler.hello')
  })
})

describe('esbuild before:invoke:local:invoke', () => {
  it('still runs the named TypeScript function from the build directory', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'handler.js': JS_SOURCE, 'hello-ts.ts': TS_SOURCE },
      functions: {
        helloJs: { handler: 'handler.hello' },
        helloTs: { handler: 'hello-ts.hello' },
      },
      options: { function: 'helloTs' },
    })

    await plugin.hooks['before:invoke:local:invoke']()

    const buildDir = path.join(serviceDir, '.serverless', 'build')
    expect(serverless.config.servicePath).toBe(buildDir)
    expect(functions.helloTs.handler).toBe('hello-ts.hello')
    expect(
      resolveLikeOffline(
        serverless.config.servicePath,
        functions.helloTs.handler,
      ),
    ).toBe(path.join(buildDir, 'hello-ts.js'))
  })

  it('runs a named JavaScript function from the service directory', async () => {
    const { plugin, serverless, serviceDir, functions } = createService({
      files: { 'handler.js': JS_SOURCE, 'hello-ts.ts': TS_SOURCE },
      functions: {
        helloJs: { handler: 'handler.hello' },
        helloTs: { handler: 'hello-ts.hello' },
      },
      options: { function: 'helloJs' },
    })

    await plugin.hooks['before:invoke:local:invoke']()

    expect(serverless.config.servicePath).toBe(serviceDir)
    expect(functions.helloJs.handler).toBe('handler.hello')
  })
})
