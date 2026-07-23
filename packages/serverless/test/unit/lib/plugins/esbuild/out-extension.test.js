/**
 * esbuild's `outExtension` option (https://esbuild.github.io/api/#out-extension)
 * lets users emit `.mjs`/`.cjs` bundles instead of `.js` — e.g. to force the
 * ESM loading path on Lambda without shipping a `type: module` package.json in
 * the artifact.
 *
 * The plugin builds with `outfile` (not `outdir`), and esbuild silently
 * ignores `outExtension` in `outfile` mode. The plugin therefore derives the
 * output extension from the merged build options itself: the `outfile` it
 * passes to esbuild carries the configured extension, `outExtension` is
 * stripped from the esbuild call, and the packaging step zips the matching
 * file names.
 *
 * Invalid configurations fail fast at build time instead of producing a
 * bundle Lambda cannot load: an ESM-format build cannot emit `.cjs`, a
 * CJS-format build cannot emit `.mjs`, and values other than
 * `.js`/`.cjs`/`.mjs` are rejected (Lambda only resolves those handler file
 * extensions).
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'

let realBuild
const buildMock = jest.fn()

jest.unstable_mockModule('esbuild', () => {
  realBuild = jest.requireActual('esbuild').build
  return { build: buildMock }
})

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const createdServiceDirs = []

function makeServiceDir(files) {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-'))
  createdServiceDirs.push(serviceDir)
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(serviceDir, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
  return serviceDir
}

function makePlugin(serviceDir, functions, { esbuildConfig = {} } = {}) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime: 'nodejs20.x' },
      build: { esbuild: esbuildConfig },
      functions,
      getFunction: (alias) => functions[alias],
    },
  }
  const plugin = new Esbuild(serverless, {})
  // Target `_build` directly: bypass the introspection in `functions()` so the
  // extension/validation logic is what's under test.
  plugin.functions = async () => functions
  return plugin
}

const handlerFiles = {
  'handler.ts': 'export const hello = async () => ({ statusCode: 200 })\n',
}
const functions = { hello: { handler: 'handler.hello' } }

describe('esbuild outExtension support', () => {
  jest.setTimeout(30_000)

  beforeEach(() => {
    buildMock.mockReset()
    buildMock.mockResolvedValue({})
  })

  afterEach(() => {
    while (createdServiceDirs.length > 0) {
      fs.rmSync(createdServiceDirs.pop(), { recursive: true, force: true })
    }
  })

  test("outExtension { '.js': '.mjs' } produces an .mjs outfile and is not passed to esbuild", async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { format: 'esm', outExtension: { '.js': '.mjs' } },
    })

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(1)
    const props = buildMock.mock.calls[0][0]
    expect(props.outfile).toBe(
      path.join(serviceDir, '.serverless', 'build', 'handler.mjs'),
    )
    // esbuild ignores outExtension in outfile mode; the plugin applies it
    // itself and must not forward it.
    expect(props).not.toHaveProperty('outExtension')
  })

  test("outExtension { '.js': '.cjs' } produces a .cjs outfile", async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { outExtension: { '.js': '.cjs' } },
    })

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(buildMock.mock.calls[0][0].outfile).toBe(
      path.join(serviceDir, '.serverless', 'build', 'handler.cjs'),
    )
  })

  test('without outExtension the outfile keeps the .js extension', async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(buildMock.mock.calls[0][0].outfile).toBe(
      path.join(serviceDir, '.serverless', 'build', 'handler.js'),
    )
  })

  test("an explicit no-op outExtension { '.js': '.js' } keeps the .js extension", async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { outExtension: { '.js': '.js' } },
    })

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(buildMock.mock.calls[0][0].outfile).toBe(
      path.join(serviceDir, '.serverless', 'build', 'handler.js'),
    )
  })

  test('outExtension from a configFile function is honored', async () => {
    const serviceDir = makeServiceDir({
      ...handlerFiles,
      'esbuild.config.mjs':
        "export default () => ({ format: 'esm', outExtension: { '.js': '.mjs' } })\n",
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { configFile: './esbuild.config.mjs' },
    })

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(1)
    const props = buildMock.mock.calls[0][0]
    expect(props.outfile).toBe(
      path.join(serviceDir, '.serverless', 'build', 'handler.mjs'),
    )
    expect(props).not.toHaveProperty('outExtension')
    expect(props).not.toHaveProperty('configFile')
  })

  test("ESM build emitting '.cjs' fails fast", async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { format: 'esm', outExtension: { '.js': '.cjs' } },
    })

    await expect(plugin._build()).rejects.toThrow(
      /format "esm".*\.cjs|\.cjs.*format "esm"/,
    )
    expect(buildMock).not.toHaveBeenCalled()
  })

  test("non-ESM build emitting '.mjs' fails fast", async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { outExtension: { '.js': '.mjs' } },
    })

    await expect(plugin._build()).rejects.toThrow(/\.mjs/)
    expect(buildMock).not.toHaveBeenCalled()
  })

  test('an unsupported extension value fails fast', async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { outExtension: { '.js': '.jsx' } },
    })

    await expect(plugin._build()).rejects.toThrow(/\.jsx/)
    expect(buildMock).not.toHaveBeenCalled()
  })

  test('real esbuild writes the bundle and sourcemap at the .mjs path', async () => {
    const serviceDir = makeServiceDir(handlerFiles)
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { format: 'esm', outExtension: { '.js': '.mjs' } },
    })

    buildMock.mockImplementation((props) => realBuild(props))

    await plugin._build()

    const bundlePath = path.join(
      serviceDir,
      '.serverless',
      'build',
      'handler.mjs',
    )
    expect(fs.existsSync(bundlePath)).toBe(true)
    expect(fs.existsSync(`${bundlePath}.map`)).toBe(true)
    const bundle = fs.readFileSync(bundlePath, 'utf-8')
    expect(bundle).toContain('hello')
    // ESM output: exports statements survive, no CJS wrapper.
    expect(bundle).toMatch(/export\s*\{/)
  })
})

describe('esbuild packaging with outExtension', () => {
  jest.setTimeout(30_000)

  afterEach(() => {
    while (createdServiceDirs.length > 0) {
      fs.rmSync(createdServiceDirs.pop(), { recursive: true, force: true })
    }
  })

  // Simulates the state after `_build` ran with outExtension: the build dir
  // holds .mjs output. Packaging must zip those names, not `<handler>.js`.
  function makeBuiltServiceDir(extension) {
    const serviceDir = makeServiceDir({
      [`.serverless/build/handler${extension}`]:
        'export const hello = async () => ({ statusCode: 200 })\n',
      [`.serverless/build/handler${extension}.map`]: '{}\n',
      '.serverless/build/node_modules/dep/index.js': 'module.exports = 1\n',
    })
    return serviceDir
  }

  function makePackagingPlugin(serviceDir, { esbuildConfig, individually }) {
    const serverless = {
      serviceDir,
      config: { serviceDir },
      service: {
        service: 'my-service',
        provider: { runtime: 'nodejs20.x' },
        build: { esbuild: esbuildConfig },
        package: { patterns: [], individually },
        functions,
        getFunction: (alias) => functions[alias],
      },
      pluginManager: { spawn: async () => {} },
    }
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => functions
    return plugin
  }

  async function zipEntryNames(artifactPath) {
    const zip = await JsZip.loadAsync(fs.readFileSync(artifactPath))
    return Object.keys(zip.files)
  }

  test('_packageAll zips the .mjs bundle and sourcemap', async () => {
    const serviceDir = makeBuiltServiceDir('.mjs')
    const plugin = makePackagingPlugin(serviceDir, {
      esbuildConfig: { format: 'esm', outExtension: { '.js': '.mjs' } },
    })

    await plugin._packageAll(functions)

    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service.zip'),
    )
    expect(entries).toContain('handler.mjs')
    expect(entries).toContain('handler.mjs.map')
    expect(entries).not.toContain('handler.js')
  })

  test('individual packaging zips the .mjs bundle and sourcemap', async () => {
    const serviceDir = makeBuiltServiceDir('.mjs')
    const plugin = makePackagingPlugin(serviceDir, {
      esbuildConfig: { format: 'esm', outExtension: { '.js': '.mjs' } },
      individually: true,
    })

    await plugin._package()

    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service-hello.zip'),
    )
    expect(entries).toContain('handler.mjs')
    expect(entries).toContain('handler.mjs.map')
    expect(entries).not.toContain('handler.js')
  })

  test('without outExtension packaging still zips .js names', async () => {
    const serviceDir = makeBuiltServiceDir('.js')
    const plugin = makePackagingPlugin(serviceDir, { esbuildConfig: {} })

    await plugin._packageAll(functions)

    const entries = await zipEntryNames(
      path.join(serviceDir, '.serverless', 'my-service.zip'),
    )
    expect(entries).toContain('handler.js')
    expect(entries).toContain('handler.js.map')
  })
})
