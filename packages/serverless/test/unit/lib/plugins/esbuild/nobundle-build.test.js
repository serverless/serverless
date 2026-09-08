/**
 * With `bundle: false` a handler output is no longer self-contained: every
 * `import` it makes is left as a runtime require/import, so each of those files
 * has to exist in the deployment artifact too. Building only the handler files
 * -- which is what the bundling path does -- ships a zip in which the handler
 * immediately fails with `Cannot find module './util'`.
 *
 * So the non-bundled build compiles the WHOLE project: every file classic
 * packaging would have shipped is either transpiled by esbuild (TS family, JSX)
 * or copied verbatim, with the directory layout preserved exactly, because
 * relative specifiers in unbundled output are resolved against that layout at
 * runtime.
 *
 * These tests drive the real `_build` against real temp-directory services and
 * inspect `.serverless/build`, rather than asserting on esbuild call arguments:
 * the contract is what lands on disk.
 */

import { jest } from '@jest/globals'
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'
import { log } from '@serverless/util'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const esbuildLogger = log.get('esbuild')

const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * `realpathSync` because macOS resolves the temp dir through a symlink, and
 * esbuild reports real paths -- an unresolved prefix makes `outbase` fail to
 * match the entry points and collapses the whole layout into the build root.
 */
function makeServiceDir(files) {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-nobundle-')),
  )
  createdServiceDirs.push(serviceDir)
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(serviceDir, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
  return serviceDir
}

function makePlugin(
  serviceDir,
  functions,
  {
    esbuildConfig = { bundle: false },
    packageConfig = {},
    layers = {},
    localPluginPath = null,
    configurationFilename,
    configurationInput,
    options = {},
  } = {},
) {
  const serverless = {
    serviceDir,
    configurationFilename,
    configurationInput,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime: 'nodejs20.x' },
      package: packageConfig,
      build: { esbuild: esbuildConfig },
      functions,
      getFunction: (alias) => functions[alias],
      getAllFunctions: () => Object.keys(functions),
      getAllLayers: () => Object.keys(layers),
      getLayer: (name) => layers[name],
    },
    pluginManager: {
      spawn: async () => {},
      parsePluginsObject: () => ({ localPath: localPluginPath }),
    },
  }
  const plugin = new Esbuild(serverless, options)
  // Target `_build` directly: the selection/partitioning logic is what's under
  // test, not the introspection in `functions()`.
  plugin.functions = async () => functions
  return plugin
}

const buildDirOf = (serviceDir) => path.join(serviceDir, '.serverless', 'build')

const existsIn = (serviceDir, rel) =>
  fs.existsSync(path.join(buildDirOf(serviceDir), rel))

const readIn = (serviceDir, rel) =>
  fs.readFileSync(path.join(buildDirOf(serviceDir), rel), 'utf8')

/**
 * Load a built handler in a real Node process and return whatever it resolved
 * to. Reading the emitted syntax proves esbuild wrote what we asked for; only
 * actually loading it proves Node agrees — which is the failure mode a wrong
 * extension or format produces, and it produces it at invocation time.
 */
function loadBuiltHandler(serviceDir, rel, exportName) {
  const target = path.join(buildDirOf(serviceDir), rel)
  const script =
    `import(${JSON.stringify(target)})` +
    `.then((m) => (m.${exportName} ?? m.default?.${exportName})())` +
    `.then((r) => console.log(JSON.stringify(r)))`
  return JSON.parse(
    execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }),
  )
}

/** Every file in the build dir, POSIX-relative and sorted. */
// Entry names of the artifact `_packageAll` produces, so an assertion can be
// made about what actually deploys rather than only about the build directory.
async function packagedNames(plugin, serviceDir) {
  await plugin._packageAll(await plugin.functions())
  const zip = await JsZip.loadAsync(
    fs.readFileSync(path.join(serviceDir, '.serverless', 'my-service.zip')),
  )
  return Object.keys(zip.files).sort()
}

function listBuild(serviceDir) {
  const root = buildDirOf(serviceDir)
  if (!fs.existsSync(root)) return []
  const out = []
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel)
      else out.push(rel)
    }
  }
  walk(root, '')
  return out.sort()
}

const HANDLER_TS =
  "import { helper } from './util'\n" +
  "import { legacy } from './legacy.js'\n" +
  'export const hello = async () => ({\n' +
  '  statusCode: 200,\n' +
  '  body: `${helper()}${legacy()}`,\n' +
  '})\n'

const functions = { hello: { handler: 'src/handler.hello' } }

describe('_build with bundle:false compiles the whole project', () => {
  jest.setTimeout(60_000)

  it('compiles TS helpers, copies JS helpers and assets, and preserves the layout', async () => {
    const legacySource = 'exports.legacy = () => "legacy"\n'
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': HANDLER_TS,
      'src/util.ts': "export const helper = () => 'helped'\n",
      'src/legacy.js': legacySource,
      'assets/data.json': '{"a":1}\n',
      'deep/nested/dir/mod.ts': 'export const deep = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    // Compiled: the handler AND every other TS file in the project.
    expect(existsIn(serviceDir, 'src/handler.js')).toBe(true)
    expect(existsIn(serviceDir, 'src/util.js')).toBe(true)
    // Nesting is preserved exactly -- relative specifiers depend on it.
    expect(existsIn(serviceDir, 'deep/nested/dir/mod.js')).toBe(true)

    // Copied: byte-for-byte, not re-emitted through esbuild.
    expect(readIn(serviceDir, 'src/legacy.js')).toBe(legacySource)
    expect(readIn(serviceDir, 'assets/data.json')).toBe('{"a":1}\n')

    // A project with no `"type": "module"` loads `.js` as CommonJS, so the
    // compiled output has to be CommonJS or Node rejects it at load time.
    const handler = readIn(serviceDir, 'src/handler.js')
    expect(handler).toMatch(/require\(/)
    expect(handler).not.toMatch(/^import /m)
  })

  it('records the handler artifact and marks the function built', async () => {
    const serviceDir = makeServiceDir({
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/util.ts': 'export const helper = () => 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.js',
      mapfile: 'src/handler.js.map',
    })
    expect([...plugin.serverless.builtFunctions]).toEqual(['hello'])
    // A helper is not a handler: it is built, but it is nobody's artifact.
    expect([...plugin.builtArtifacts.keys()]).toEqual(['hello'])
  })

  it('builds a handler written with a "./" prefix exactly once', async () => {
    // The handler comes from user configuration and the sweep from globby, so
    // the two spellings of one file have to be reconciled -- otherwise the file
    // is compiled twice and reported as colliding with itself.
    const serviceDir = makeServiceDir({
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, {
      hello: { handler: './src/handler.hello' },
    })

    await plugin._build()

    expect(plugin.builtArtifacts.get('hello').outfile).toBe('src/handler.js')
    expect(listBuild(serviceDir)).toEqual([
      'src/handler.js',
      'src/handler.js.map',
    ])
  })
})

describe('_build with bundle:false picks a format per file', () => {
  jest.setTimeout(60_000)

  it('follows the nearest package.json, not the service root', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/esm/package.json': '{"type":"module"}',
      'src/esm/mod.ts': 'export const esmOnly = 1\n',
      'src/plain.ts': 'export const cjsOnly = 2\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(readIn(serviceDir, 'src/esm/mod.js')).toMatch(/export /)
    expect(readIn(serviceDir, 'src/plain.js')).toMatch(
      /module\.exports|exports\./,
    )
    // The nested package.json is what makes Node agree with that choice at
    // runtime, so it has to be in the artifact too.
    expect(readIn(serviceDir, 'src/esm/package.json')).toBe('{"type":"module"}')
  })

  it('classes the handler itself by the nearest package.json and ships it', async () => {
    // The handler sits UNDER the nested `"type": "module"`, so the whole
    // question is settled by a file the service root never mentions: the
    // compiled handler has to be ESM, the `.js` helper beside it is already
    // ESM and must arrive untouched, and `src/package.json` has to be in the
    // artifact or Node re-runs this same lookup in Lambda, finds nothing, and
    // loads both files as CommonJS.
    const utilSource = "export const helper = () => 'helped'\n"
    const nestedPackageJson = '{"type":"module"}'
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/package.json': nestedPackageJson,
      'src/handler.ts':
        "import { helper } from './util.js'\n" +
        'export const hello = async () => ({ statusCode: 200, body: helper() })\n',
      'src/util.js': utilSource,
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    const handler = readIn(serviceDir, 'src/handler.js')
    expect(handler).toMatch(/^import /m)
    expect(handler).toMatch(/^export /m)
    expect(handler).not.toMatch(/module\.exports|exports\./)
    // Swept, not compiled: an ESM `.js` re-emitted as CommonJS would break the
    // `import` above.
    expect(readIn(serviceDir, 'src/util.js')).toBe(utilSource)
    expect(existsIn(serviceDir, 'src/util.js.map')).toBe(false)
    expect(readIn(serviceDir, 'src/package.json')).toBe(nestedPackageJson)
    // Only Node agreeing proves the three of them are consistent.
    expect(loadBuiltHandler(serviceDir, 'src/handler.js', 'hello')).toEqual({
      statusCode: 200,
      body: 'helped',
    })
  })

  it('emits ESM everywhere for a "type": "module" service', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/util.ts': 'export const helper = () => 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(readIn(serviceDir, 'src/util.js')).toMatch(/export /)
    expect(readIn(serviceDir, 'src/handler.js')).not.toMatch(/module\.exports/)
  })

  it('lets a nested CommonJS package.json opt out of an ESM service', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'legacy/package.json': '{"type":"commonjs"}',
      'legacy/old.ts': 'export const old = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(readIn(serviceDir, 'legacy/old.js')).toMatch(
      /module\.exports|exports\./,
    )
  })

  it('honors an explicit format for the .js class only', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/util.ts': 'export const helper = () => 1\n',
      'src/tool.mts': 'export const tool = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, format: 'esm' },
    })

    await plugin._build()

    expect(readIn(serviceDir, 'src/util.js')).toMatch(/export /)
    // `.mts` is ESM by definition and unaffected either way.
    expect(readIn(serviceDir, 'src/tool.mjs')).toMatch(/export /)
  })

  it('maps .mts to .mjs and .cts to .cjs whatever the service format is', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/tool.mts': 'export const tool = 1\n',
      'src/old.cts': 'export const old = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(existsIn(serviceDir, 'src/tool.mjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/old.cjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/tool.js')).toBe(false)
    expect(existsIn(serviceDir, 'src/old.js')).toBe(false)
    // `.cts` stays CommonJS even though the service is `"type": "module"` --
    // that is the whole point of the extension.
    expect(readIn(serviceDir, 'src/old.cjs')).toMatch(
      /module\.exports|exports\./,
    )
    expect(readIn(serviceDir, 'src/tool.mjs')).toMatch(/export /)
  })

  it('compiles .jsx and .tsx onto .js', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/a.jsx': 'export const A = () => null\n',
      'src/b.tsx': 'export const B = (): null => null\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(existsIn(serviceDir, 'src/a.js')).toBe(true)
    expect(existsIn(serviceDir, 'src/b.js')).toBe(true)
  })

  it('copies .mjs with top-level await untouched', async () => {
    // Transpiling an `.mjs` down to CommonJS would fail outright on top-level
    // await; it is already a module Node can load, so it is copied.
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/tla.mjs': 'await Promise.resolve()\nexport const ready = true\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await expect(plugin._build()).resolves.toBeUndefined()

    expect(readIn(serviceDir, 'src/tla.mjs')).toContain(
      'await Promise.resolve()',
    )
  })

  it('copies a .cjs helper untouched under a "type": "module" root', async () => {
    // A `.cjs` helper is CommonJS by name and Node loads it that way whatever
    // the root says, so the service-wide ESM format must not reach it and
    // nothing has to be re-emitted: it is copied, byte for byte.
    const legacySource =
      "const os = require('os')\nmodule.exports.legacy = () => os.EOL\n"
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/legacy.cjs': legacySource,
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(readIn(serviceDir, 'src/legacy.cjs')).toBe(legacySource)
    // A compiled file gets a sourcemap; a copied one does not.
    expect(existsIn(serviceDir, 'src/legacy.cjs.map')).toBe(false)
    expect(existsIn(serviceDir, 'src/legacy.js')).toBe(false)
    expect(existsIn(serviceDir, 'src/legacy.mjs')).toBe(false)
  })
})

/**
 * `.js` is not one language. Projects carry JSX and Flow annotations in files
 * named `.js`, and esbuild's default `js` loader parses neither. Those files
 * are not compilable sources here -- they are payload the sweep copies -- so
 * they have to reach the artifact exactly as written rather than failing the
 * build of a service that never asked for them to be compiled.
 */
describe('_build with bundle:false copies .js dialects it cannot parse', () => {
  jest.setTimeout(60_000)

  it('copies JSX and Flow files verbatim instead of parsing them', async () => {
    const jsxSource =
      "const { createElement } = require('react')\n" +
      'module.exports.App = () => <div className="app">hi</div>\n'
    const flowSource =
      '// @flow\n' +
      'function add(a: number, b: number): number {\n' +
      '  return a + b\n' +
      '}\n' +
      'module.exports = add\n'
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/web/App.js': jsxSource,
      'src/typed.js': flowSource,
    })
    const plugin = makePlugin(serviceDir, functions)

    // Compiling either of these fails with a parse error; copying cannot.
    await expect(plugin._build()).resolves.toBeUndefined()

    expect(readIn(serviceDir, 'src/web/App.js')).toBe(jsxSource)
    expect(readIn(serviceDir, 'src/typed.js')).toBe(flowSource)
    expect(existsIn(serviceDir, 'src/web/App.js.map')).toBe(false)
    expect(existsIn(serviceDir, 'src/typed.js.map')).toBe(false)
  })
})

/**
 * A handler is compiled whatever its extension, even one the sweep would have
 * copied. Treating a `.mjs`/`.cjs` handler as part of the `.js` class emitted
 * `handler.js` while `builtArtifacts` and packaging looked for `handler.mjs`,
 * so the build failed with ESBUILD_HANDLER_NOT_BUILT — a service whose handler
 * was a plain `.mjs` file could not be built at all with `bundle: false`.
 */
describe('_build with bundle:false keeps a handler in its own module class', () => {
  jest.setTimeout(60_000)

  it('builds a .mjs handler as ESM under its own name', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.mjs':
        "const greeting = await Promise.resolve('mjs')\n" +
        'export const hello = async () => ({ statusCode: 200, body: greeting })\n',
    })
    const plugin = makePlugin(serviceDir, {
      hello: { handler: 'src/handler.hello' },
    })

    await plugin._build()

    expect(existsIn(serviceDir, 'src/handler.mjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/handler.js')).toBe(false)
    // Top-level await only survives an ESM output.
    expect(readIn(serviceDir, 'src/handler.mjs')).toMatch(
      /await Promise\.resolve/,
    )
    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.mjs',
      mapfile: 'src/handler.mjs.map',
    })
    expect(loadBuiltHandler(serviceDir, 'src/handler.mjs', 'hello')).toEqual({
      statusCode: 200,
      body: 'mjs',
    })
  })

  it('builds a .cjs handler as CommonJS under a "type": "module" root', async () => {
    // The whole point of the extension: `.cjs` is CommonJS even where the
    // service says otherwise, so the service-wide ESM format must not reach it.
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.cjs':
        "exports.hello = async () => ({ statusCode: 200, body: require('./legacy.cjs').name })\n",
      'src/legacy.cjs': "exports.name = 'cjs'\n",
    })
    const plugin = makePlugin(serviceDir, {
      hello: { handler: 'src/handler.hello' },
    })

    await plugin._build()

    expect(existsIn(serviceDir, 'src/handler.cjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/handler.js')).toBe(false)
    const built = readIn(serviceDir, 'src/handler.cjs')
    expect(built).toMatch(/module\.exports|exports\./)
    expect(built).not.toMatch(/^export /m)
    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.cjs',
      mapfile: 'src/handler.cjs.map',
    })
    expect(loadBuiltHandler(serviceDir, 'src/handler.cjs', 'hello')).toEqual({
      statusCode: 200,
      body: 'cjs',
    })
  })

  it('gives the .mjs and .js classes separate metafiles when outExtension merges their names', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/tool.mts': 'export const tool = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: {
        bundle: false,
        metafile: true,
        outExtension: { '.js': '.mjs' },
      },
    })

    await plugin._build()

    // Both classes emit `.mjs`/esm here, but they are still two partitions --
    // keyed by source class -- so neither metafile overwrites the other.
    expect(
      listBuild(serviceDir)
        .filter((f) => f.startsWith('meta.'))
        .sort(),
    ).toEqual(['meta.jsesm.json', 'meta.mjsesm.json'])
  })
})

describe('_build with bundle:false rejects output collisions', () => {
  jest.setTimeout(60_000)

  it('hard-errors naming both sources', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/dup.ts': 'export const fromTs = 1\n',
      'src/dup.js': 'exports.fromJs = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    const error = await plugin._build().then(
      () => undefined,
      (err) => err,
    )

    expect(error?.code).toBe('ESBUILD_OUTPUT_COLLISION')
    expect(error.message).toContain('src/dup.ts')
    expect(error.message).toContain('src/dup.js')
    expect(error.message).toContain('src/dup.js"') // the shared output
  })

  it('still errors when the two outputs would be byte-identical', async () => {
    // The check is on the output PATH, deliberately, and this is the case that
    // proves it has to be: nothing downstream would ever notice this one.
    // esbuild writes the compiled `.ts`, the copy phase then writes the `.js`
    // over it with the same bytes, and the artifact looks perfect -- while the
    // service is one edit away from the two files diverging and a build
    // silently shipping whichever ran last.
    //
    // The identical-bytes premise is established here rather than asserted
    // from a hand-written constant, so it cannot rot when esbuild changes its
    // output preamble: build the `.ts` alone, take what it emitted, and use
    // exactly those bytes as the sibling `.js`.
    const duplicated = 'module.exports.value = 1\n'
    const alone = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/dup.ts': duplicated,
    })
    await makePlugin(alone, functions)._build()
    const emitted = readIn(alone, 'src/dup.js')

    const both = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/dup.ts': duplicated,
      'src/dup.js': emitted,
    })
    const error = await makePlugin(both, functions)
      ._build()
      .then(
        () => undefined,
        (err) => err,
      )

    expect(error?.code).toBe('ESBUILD_OUTPUT_COLLISION')
    expect(error.message).toMatch(
      /"src\/dup\.js" would be produced by both "src\/dup\.ts" and "src\/dup\.js"/,
    )
    expect(listBuild(both)).toEqual([])
  })

  it('does not flag a compiled file whose output name is simply free', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/a.ts': 'export const a = 1\n',
      'src/a.mjs': 'export const b = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await expect(plugin._build()).resolves.toBeUndefined()
  })

  it('catches a collision that only outExtension creates', async () => {
    // `src/a.ts` and `src/a.mjs` do not clash by default -- they clash only
    // because `outExtension` moves the `.js` class onto `.mjs` too.
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/a.ts': 'export const a = 1\n',
      'src/a.mjs': 'export const b = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, outExtension: { '.js': '.mjs' } },
    })

    const error = await plugin._build().then(
      () => undefined,
      (err) => err,
    )

    expect(error?.code).toBe('ESBUILD_OUTPUT_COLLISION')
    expect(error.message).toContain('src/a.ts')
    expect(error.message).toContain('src/a.mjs')
  })
})

/**
 * A project that already runs `tsc` itself keeps compiled JavaScript in the
 * tree alongside the TypeScript it came from. Bundling never looked at either
 * one except through the handler, so the two could coexist; compiling the whole
 * project cannot ignore them, and where they land on the same name the build
 * has to say so rather than pick a winner at random.
 */
describe('_build with bundle:false and a tsc-precompiled tree', () => {
  jest.setTimeout(60_000)

  // `tsc` with no `outDir`: every emitted `.js` sits next to its `.ts`.
  const inPlace = {
    'package.json': '{"name":"svc"}',
    'tsconfig.json': '{"include":["src"]}',
    'src/handler.ts':
      "import { helper } from './util.js'\n" +
      'export const hello = async () => ({ body: helper() })\n',
    'src/handler.js': 'exports.hello = async () => ({ body: "stale" })\n',
    'src/util.ts': "export const helper = () => 'helped'\n",
    'src/util.js': 'exports.helper = () => "stale"\n',
  }

  it('refuses a precompiled output sitting on its own source name', async () => {
    const serviceDir = makeServiceDir(inPlace)
    const plugin = makePlugin(serviceDir, functions)

    const error = await plugin._build().then(
      () => undefined,
      (err) => err,
    )

    expect(error?.code).toBe('ESBUILD_OUTPUT_COLLISION')
    // The PAIRING is the payload, for EVERY colliding pair -- naming one source
    // per output would leave the user hunting for the other half, and the fix
    // is a pattern list that has to cover all of them. Matched as whole
    // clauses: the output name is itself one of the two source names here, so
    // a substring check for it is satisfied by the wrong token.
    expect(error.message).toMatch(
      /"src\/handler\.js" would be produced by both "src\/handler\.ts" and "src\/handler\.js"/,
    )
    expect(error.message).toMatch(
      /"src\/util\.js" would be produced by both "src\/util\.ts" and "src\/util\.js"/,
    )
    expect(listBuild(serviceDir)).toEqual([])
  })

  it('builds the precompiled output once the sources are excluded', async () => {
    const serviceDir = makeServiceDir(inPlace)
    const plugin = makePlugin(serviceDir, functions, {
      packageConfig: { patterns: ['!src/**/*.ts'] },
    })

    await expect(plugin._build()).resolves.toBeUndefined()

    // The handler resolves to the `.js` -- it is the file that exists under the
    // configured handler path once the TypeScript is out of the sweep -- and
    // the rest of the precompiled tree rides along as copied payload.
    expect(plugin.builtArtifacts.get('hello').outfile).toBe('src/handler.js')
    expect(listBuild(serviceDir)).toEqual([
      'package.json',
      'src/handler.js',
      'src/handler.js.map',
      'src/util.js',
      'tsconfig.json',
    ])
  })

  it('emits both trees when the precompiled output has its own directory', async () => {
    // The `outDir` shape does NOT collide: `dist/handler.js` and
    // `src/handler.ts` emit different names, so the build succeeds and the
    // artifact carries the same code twice. Nothing is wrong with it, but the
    // sources are dead weight -- `package.patterns` is what removes them.
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'tsconfig.json':
        '{"include":["src"],"compilerOptions":{"outDir":"dist"}}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'dist/handler.js': 'exports.hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, {
      hello: { handler: 'dist/handler.hello' },
    })

    await expect(plugin._build()).resolves.toBeUndefined()

    expect(plugin.builtArtifacts.get('hello').outfile).toBe('dist/handler.js')
    expect(listBuild(serviceDir)).toEqual([
      'dist/handler.js',
      'dist/handler.js.map',
      'package.json',
      'src/handler.js',
      'src/handler.js.map',
      'tsconfig.json',
    ])
  })
})

describe('_build with bundle:false and outExtension', () => {
  jest.setTimeout(60_000)

  it('renames the .js class and leaves .mts/.cts alone', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/util.ts': 'export const helper = () => 1\n',
      'src/tool.mts': 'export const tool = 1\n',
      'src/old.cts': 'export const old = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, outExtension: { '.js': '.mjs' } },
    })

    await plugin._build()

    expect(existsIn(serviceDir, 'src/handler.mjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/util.mjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/tool.mjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/old.cjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/handler.js')).toBe(false)
    // Packaging reads the artifact record, so it has to carry the real name.
    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.mjs',
      mapfile: 'src/handler.mjs.map',
    })
  })

  it('rejects an extension the resolved format cannot emit', async () => {
    // No `"type": "module"`, so the `.js` class compiles to CommonJS — which
    // Lambda would then be asked to load from an `.mjs` file.
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, outExtension: { '.js': '.mjs' } },
    })

    await expect(plugin._build()).rejects.toMatchObject({
      code: 'ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH',
    })
  })

  it('rejects an unsupported extension even with no .js-class file to apply it to', async () => {
    // Every source here is `.mts`, so nothing ever reaches the `.js`-class
    // partition. An `outExtension` Lambda cannot load is still wrong, and
    // leaving it to that partition let it through in silence.
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.mts': 'export const hello = async () => ({})\n',
      'src/tool.mts': 'export const tool = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, outExtension: { '.js': '.weird' } },
    })

    await expect(plugin._build()).rejects.toMatchObject({
      code: 'ESBUILD_OUT_EXTENSION_UNSUPPORTED',
    })
  })
})

/**
 * `banner`, `footer` and `inject` are how a user patches their own module
 * system — the canonical example being a `createRequire(import.meta.url)`
 * banner to get `require` back in an ESM build. Injecting that into a CommonJS
 * partition is a syntax error, so they are scoped exactly like `format` and
 * `outExtension`: the `.js` class only.
 */
describe('_build with bundle:false scopes banner/footer/inject to the .js class', () => {
  jest.setTimeout(60_000)

  it('applies them to the .js class and to nothing else', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/tool.mts': 'export const tool = 1\n',
      'src/old.cts': 'export const old = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: {
        bundle: false,
        banner: { js: '// SERVERLESS_BANNER' },
        footer: { js: '// SERVERLESS_FOOTER' },
      },
    })

    await plugin._build()

    expect(readIn(serviceDir, 'src/handler.js')).toContain(
      '// SERVERLESS_BANNER',
    )
    expect(readIn(serviceDir, 'src/handler.js')).toContain(
      '// SERVERLESS_FOOTER',
    )
    // The `.cjs` class is CommonJS by definition; an ESM-shaped banner there is
    // at best dead weight and at worst a syntax error.
    expect(readIn(serviceDir, 'src/old.cjs')).not.toContain(
      '// SERVERLESS_BANNER',
    )
    expect(readIn(serviceDir, 'src/tool.mjs')).not.toContain(
      '// SERVERLESS_BANNER',
    )
  })

  it('keeps a createRequire banner out of the CommonJS partitions', async () => {
    // The real-world case: the banner is valid ESM and invalid CJS, so a
    // `.cts` output carrying it would not even parse.
    const serviceDir = makeServiceDir({
      'package.json': '{"type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({ ok: true })\n',
      'src/old.cts': 'export const old = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: {
        bundle: false,
        banner: {
          js: "import { createRequire } from 'module'\nconst require = createRequire(import.meta.url)\n",
        },
      },
    })

    await plugin._build()

    expect(readIn(serviceDir, 'src/old.cjs')).not.toContain('import.meta.url')
    // And the ESM output it was meant for still loads.
    expect(loadBuiltHandler(serviceDir, 'src/handler.js', 'hello')).toEqual({
      ok: true,
    })
  })
})

describe('_build with bundle:false honors classic file selection', () => {
  jest.setTimeout(60_000)

  it('drops the files classic never ships', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'serverless.yml': 'service: my-service\n',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      '.gitignore': 'node_modules\n',
      '.DS_Store': 'junk',
      'npm-debug.log': 'noise',
      'yarn-error.log': 'noise',
      'types.d.ts': 'export {}\n',
      'layerdir/lib.js': 'module.exports = 1\n',
      'my-plugins/plugin.js': 'module.exports = {}\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      configurationFilename: 'serverless.yml',
      layers: { shared: { path: 'layerdir' } },
      localPluginPath: 'my-plugins',
    })

    await plugin._build()

    const built = listBuild(serviceDir)
    expect(built).not.toContain('serverless.yml')
    expect(built).not.toContain('.gitignore')
    expect(built).not.toContain('.DS_Store')
    expect(built).not.toContain('npm-debug.log')
    expect(built).not.toContain('yarn-error.log')
    expect(built).not.toContain('types.d.ts')
    expect(built).not.toContain('layerdir/lib.js')
    expect(built).not.toContain('my-plugins/plugin.js')
    expect(built).toContain('src/handler.js')
    expect(built).toContain('package.json')
  })

  // Env files never reach an artifact, whatever `useDotenv` says and whatever
  // depth they sit at. Deliberately stricter than classic packaging, which
  // drops them only when `useDotenv` is set and only at the service root.
  const dotenvFiles = {
    'package.json': '{"name":"svc"}',
    'src/handler.ts': 'export const hello = async () => ({})\n',
    '.env': 'SECRET=1\n',
    '.env.production': 'SECRET=2\n',
    'src/.env': 'SECRET=3\n',
    '.npmrc': 'registry=https://registry.npmjs.org/\n',
  }

  it.each([
    ['unset', undefined],
    ['true', { useDotenv: true }],
    ['false', { useDotenv: false }],
  ])('never packages .env files (useDotenv %s)', async (_label, input) => {
    const serviceDir = makeServiceDir(dotenvFiles)
    const plugin = makePlugin(serviceDir, functions, {
      configurationInput: input,
    })

    await plugin._build()

    const built = listBuild(serviceDir)
    expect(built).not.toContain('.env')
    expect(built).not.toContain('.env.production')
    expect(built).not.toContain('src/.env')
    // Scoped to env files: no other dotfile was swept up with them.
    expect(built).toContain('.npmrc')
    expect(built).toContain('src/handler.js')

    // And the artifact that actually deploys agrees with the build directory.
    const packaged = await packagedNames(plugin, serviceDir)
    expect(packaged).not.toContain('.env')
    expect(packaged).not.toContain('.env.production')
    expect(packaged).not.toContain('src/.env')
    expect(packaged).toContain('.npmrc')
  })

  it('re-includes an env file named by an explicit positive pattern', async () => {
    // The documented opt-in for the runtime `dotenv` pattern. Exclusions are
    // leading negations, so a positive pattern still gets the last word.
    const serviceDir = makeServiceDir(dotenvFiles)
    const plugin = makePlugin(serviceDir, functions, {
      packageConfig: { patterns: ['.env'] },
    })

    await plugin._build()

    const built = listBuild(serviceDir)
    expect(built).toContain('.env')
    // Only the one that was asked for.
    expect(built).not.toContain('.env.production')
    expect(built).not.toContain('src/.env')

    const packaged = await packagedNames(plugin, serviceDir)
    expect(packaged).toContain('.env')
    expect(packaged).not.toContain('.env.production')
    expect(packaged).not.toContain('src/.env')
  })

  /**
   * `serverless package --package ./dist-pkg` moves `.serverless/` -- the zip
   * AND the open build directory -- into `dist-pkg/`. The next run sweeps the
   * service directory again, so without an exclusion it packages the previous
   * artifact and a full copy of the previous build, and the artifact doubles
   * on every run. The package directory is therefore hard-ignored the way
   * `.serverless/**` is: no pattern, not even `**`, brings it back.
   */
  const packageDirFiles = {
    'package.json': '{"name":"svc"}',
    'src/handler.ts': 'export const hello = async () => ({})\n',
    'dist-pkg/my-service.zip': 'PK-previous-artifact',
    'dist-pkg/build/src/handler.js': 'previous build\n',
    'dist-pkg/build/node_modules/dep/index.js': 'previous install\n',
  }

  it.each([
    ['--package', { options: { package: 'dist-pkg' } }],
    [
      '--package with ./ and a trailing slash',
      { options: { package: './dist-pkg/' } },
    ],
    ['package.path', { packageConfig: { path: 'dist-pkg' } }],
  ])(
    'keeps the configured package directory out of the build and the artifact (%s)',
    async (_label, config) => {
      const serviceDir = makeServiceDir(packageDirFiles)
      const plugin = makePlugin(serviceDir, functions, {
        ...config,
        packageConfig: { ...(config.packageConfig ?? {}), patterns: ['**'] },
      })

      await plugin._build()

      const built = listBuild(serviceDir)
      expect(built).toContain('src/handler.js')
      expect(built.some((rel) => rel.startsWith('dist-pkg/'))).toBe(false)

      const packaged = await packagedNames(plugin, serviceDir)
      expect(packaged).toContain('src/handler.js')
      expect(packaged.some((rel) => rel.startsWith('dist-pkg/'))).toBe(false)
    },
  )

  it('keeps an absolute package path inside the service directory out as well', async () => {
    const serviceDir = makeServiceDir(packageDirFiles)
    const plugin = makePlugin(serviceDir, functions, {
      options: { package: path.join(serviceDir, 'dist-pkg') },
      packageConfig: { patterns: ['**'] },
    })

    await plugin._build()

    const built = listBuild(serviceDir)
    expect(built).toContain('src/handler.js')
    expect(built.some((rel) => rel.startsWith('dist-pkg/'))).toBe(false)
  })

  it.each([
    ['the service directory itself', '.'],
    ['the parent directory', '..'],
    ['a sibling directory', '../out'],
  ])(
    'excludes nothing when the package directory is %s',
    async (_label, packageDir) => {
      // Only a directory strictly inside the service directory can be swept
      // back in. `.` would otherwise exclude the whole service, and anything
      // above it is not part of the sweep to begin with.
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'assets/logo.txt': 'logo\n',
      })
      const plugin = makePlugin(serviceDir, functions, {
        options: { package: packageDir },
      })

      expect(plugin._packageDirectoryIgnores()).toEqual([])

      await plugin._build()

      const built = listBuild(serviceDir)
      expect(built).toContain('src/handler.js')
      expect(built).toContain('assets/logo.txt')
    },
  )

  it('resolves the package directory to a service-relative POSIX glob', () => {
    const serviceDir = makeServiceDir({ 'package.json': '{"name":"svc"}' })
    const ignoresFor = (options, packageConfig = {}) =>
      makePlugin(serviceDir, functions, {
        options,
        packageConfig,
      })._packageDirectoryIgnores()

    expect(ignoresFor({})).toEqual([])
    expect(ignoresFor({ package: 'dist-pkg' })).toEqual(['dist-pkg/**'])
    expect(ignoresFor({ package: './out/pkg/' })).toEqual(['out/pkg/**'])
    expect(ignoresFor({ package: path.join(serviceDir, 'abs') })).toEqual([
      'abs/**',
    ])
    // A directory whose NAME starts with dots is still inside the service.
    expect(ignoresFor({ package: '..dots' })).toEqual(['..dots/**'])
    // `--package` wins over `package.path`, as it does for the framework.
    expect(ignoresFor({ package: 'flag' }, { path: 'config' })).toEqual([
      'flag/**',
    ])
    expect(ignoresFor({}, { path: 'config' })).toEqual(['config/**'])
    expect(ignoresFor({ package: '/' })).toEqual([])
    expect(ignoresFor({ package: '.' })).toEqual([])
    expect(ignoresFor({ package: '..' })).toEqual([])
    expect(ignoresFor({ package: '../out' })).toEqual([])
    expect(ignoresFor({ package: '' })).toEqual([])
  })

  it('re-includes a package-manager internal the sweep dropped when a pattern names it', async () => {
    // Yarn PnP files are default exclusions of the sweep. A positive pattern
    // brings the named file back — into the build directory AND the artifact,
    // which walks the build directory with these roots skipped unless a
    // pattern claimed something under them.
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      '.pnp.cjs': 'module.exports = {}\n',
      '.yarn/cache/dep.zip': 'PK\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      packageConfig: { patterns: ['.pnp.cjs'] },
    })

    await plugin._build()

    const built = listBuild(serviceDir)
    expect(built).toContain('.pnp.cjs')
    expect(built).not.toContain('.yarn/cache/dep.zip')

    const packaged = await packagedNames(plugin, serviceDir)
    expect(packaged).toContain('.pnp.cjs')
    expect(packaged).not.toContain('.yarn/cache/dep.zip')
  })

  it('lets package.patterns exclude project files and re-include excluded ones', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'serverless.yml': 'service: my-service\n',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'tests/handler.test.ts': 'export const t = 1\n',
      'docs/readme.md': '# docs\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      packageConfig: { patterns: ['!tests/**', '!docs/**', 'serverless.yml'] },
      configurationFilename: 'serverless.yml',
    })

    await plugin._build()

    const built = listBuild(serviceDir)
    expect(built).not.toContain('tests/handler.test.js')
    expect(built).not.toContain('docs/readme.md')
    // Last match wins, exactly as in classic packaging.
    expect(built).toContain('serverless.yml')
  })

  it('ignores the legacy package.include and package.exclude keys and says so once', async () => {
    // The esbuild build reads `package.patterns` only. The legacy pair is still
    // schema-valid and still honored by classic packaging, so a service that
    // never migrated must hear that its excludes remove nothing and its
    // includes add nothing here -- once per process, dev mode rebuilds through
    // the same instance.
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/other.ts': 'export const hello = async () => ({})\n',
        'secrets/keys.txt': 'shh\n',
        'lib/node_modules/inner/index.js': 'module.exports = "inner"\n',
      })
      const plugin = makePlugin(
        serviceDir,
        {
          hello: { handler: 'src/handler.hello' },
          other: {
            handler: 'src/other.hello',
            package: { include: ['lib/**'] },
          },
        },
        {
          packageConfig: {
            exclude: ['secrets/**'],
            include: ['lib/node_modules/**'],
          },
        },
      )

      await plugin._build()

      const built = listBuild(serviceDir)
      expect(built).toContain('secrets/keys.txt')
      expect(built).not.toContain('lib/node_modules/inner/index.js')

      expect(warnSpy).toHaveBeenCalledTimes(1)
      const [message] = warnSpy.mock.calls[0]
      expect(message).toContain('"package.patterns" only')
      expect(message).toContain(
        'the service-level "package.include" and "package.exclude"',
      )
      expect(message).toContain('"package.include" on function "other"')
      expect(message).toContain('prefixing excludes with "!"')

      await plugin._build()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('says nothing about legacy package keys when only patterns are configured', async () => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'secrets/keys.txt': 'shh\n',
      })
      await makePlugin(
        serviceDir,
        { hello: { handler: 'src/handler.hello' } },
        {
          packageConfig: {
            patterns: ['!secrets/**'],
            include: [],
            exclude: [],
          },
        },
      )._build()

      expect(listBuild(serviceDir)).not.toContain('secrets/keys.txt')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('builds the handler even when the patterns would have excluded it', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      packageConfig: { patterns: ['!src/**'] },
    })

    await plugin._build()

    expect(existsIn(serviceDir, 'src/handler.js')).toBe(true)
  })

  it('lets a patterns negation keep an unparsable file out of the build', async () => {
    // Compiling the whole project means compiling files the bundling path
    // never touched, so a test fixture that was never meant to be valid
    // TypeScript now fails the build. `package.patterns` is the way out, and
    // it has to work: the negation must be applied BEFORE the compile set is
    // handed to esbuild, not just before packaging.
    const files = {
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'tests/broken.fixture.ts': 'export const broken = ((((\n',
    }

    const negated = makeServiceDir(files)
    await expect(
      makePlugin(negated, functions, {
        packageConfig: { patterns: ['!tests/**'] },
      })._build(),
    ).resolves.toBeUndefined()
    expect(existsIn(negated, 'src/handler.js')).toBe(true)
    expect(listBuild(negated)).not.toContain('tests/broken.fixture.js')

    // Without the negation the parse error is the build's outcome, and it
    // names the file so the negation can be written.
    const swept = makeServiceDir(files)
    const error = await makePlugin(swept, functions)
      ._build()
      .then(
        () => undefined,
        (err) => err,
      )
    expect(error?.code).toBe('ESBULD_BUILD_ERROR')
    expect(error.message).toContain('tests/broken.fixture.ts')
  })

  it('never sweeps its own output back in', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()
    const first = listBuild(serviceDir)
    await plugin._build()

    expect(listBuild(serviceDir)).toEqual(first)
    expect(first).not.toContain('.serverless/build/src/handler.js')
  })
})

describe('_build with bundle:false keeps its bookkeeping honest', () => {
  jest.setTimeout(60_000)

  it('marks nothing built when esbuild is configured not to write', async () => {
    // A configFile merging `write: false` leaves the build dir empty. Reporting
    // the function as built would route dev mode at a file that is not there.
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'esbuild.config.mjs': 'export default () => ({ write: false })\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, configFile: './esbuild.config.mjs' },
    })

    await expect(plugin._build()).rejects.toMatchObject({
      code: 'ESBUILD_HANDLER_NOT_BUILT',
    })

    expect(plugin.builtArtifacts.size).toBe(0)
    expect(plugin.serverless.builtFunctions ?? new Set()).toEqual(new Set())
  })

  it('sets NODE_OPTIONS for source maps on the built functions', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const fns = { hello: { handler: 'src/handler.hello' } }
    const plugin = makePlugin(serviceDir, fns, {
      esbuildConfig: { bundle: false, sourcemap: { setNodeOptions: true } },
    })

    await plugin._build()

    expect(fns.hello.environment.NODE_OPTIONS).toBe('--enable-source-maps')
  })

  it('records a null mapfile when no sourcemap is emitted', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, sourcemap: false },
    })

    await plugin._build()

    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.js',
      mapfile: null,
    })
  })

  it('still compiles the project when a handler lives in a layer', async () => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/util.ts': 'export const helper = () => 1\n',
      })
      const plugin = makePlugin(serviceDir, {
        wrapped: {
          handler: '/opt/nodejs/node_modules/datadog-lambda-js/handler.datadog',
          layers: ['arn:aws:lambda:us-east-1:1234567890:layer:dd:1'],
        },
      })

      await expect(plugin._build()).resolves.toBeUndefined()

      // The unresolvable handler is the assertion's business; the project
      // still has to be built, or the layer wrapper has nothing to call into.
      expect(existsIn(serviceDir, 'src/util.js')).toBe(true)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('builds every partition under a buildConcurrency of 1', async () => {
    // `buildConcurrency` now caps the partition builds the way it caps the
    // per-handler builds on the bundling path; serializing them must not lose
    // any partition.
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/tool.mts': 'export const tool = 1\n',
      'src/old.cts': 'export const old = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, buildConcurrency: 1 },
    })

    await plugin._build()

    expect(existsIn(serviceDir, 'src/handler.js')).toBe(true)
    expect(existsIn(serviceDir, 'src/tool.mjs')).toBe(true)
    expect(existsIn(serviceDir, 'src/old.cjs')).toBe(true)
  })

  it('writes a metafile per partition when asked', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/tool.mts': 'export const tool = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, metafile: true },
    })

    await plugin._build()

    const built = listBuild(serviceDir)
    // One per (output extension, format) partition, never a single `meta.json`
    // that each partition would overwrite in turn.
    expect(built.filter((f) => f.startsWith('meta.')).sort()).toEqual([
      'meta.jscjs.json',
      'meta.mjsesm.json',
    ])
  })
})

describe('_build with bundle:false scopes TypeScript with tsconfig', () => {
  jest.setTimeout(60_000)

  it('compiles only the TypeScript the discovered tsconfig selects', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'tsconfig.json': JSON.stringify({
        include: ['src'],
        exclude: ['src/skip'],
      }),
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/util.ts': 'export const helper = () => 1\n',
      'src/skip/scratch.ts': 'export const scratch = 1\n',
      'scripts/seed.ts': 'export const seed = 1\n',
      // Not TypeScript, so the tsconfig has no say over it either way.
      'scripts/legacy.js': 'exports.legacy = 1\n',
      'assets/data.json': '{"a":1}\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    const built = listBuild(serviceDir)
    expect(built).toContain('src/handler.js')
    expect(built).toContain('src/util.js')
    expect(built).not.toContain('src/skip/scratch.js')
    expect(built).not.toContain('scripts/seed.js')
    expect(built).toContain('scripts/legacy.js')
    expect(built).toContain('assets/data.json')
  })

  it('compiles a handler the tsconfig excludes', async () => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'tsconfig.json': JSON.stringify({ include: ['lib'] }),
        'src/handler.ts': 'export const hello = async () => ({})\n',
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(existsIn(serviceDir, 'src/handler.js')).toBe(true)
      // Nothing at all was selected, handler included, so the build says so.
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('stays quiet when the tsconfig claims the handler and nothing else', async () => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'tsconfig.json': JSON.stringify({ include: ['src'] }),
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'scripts/seed.ts': 'export const seed = 1\n',
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(existsIn(serviceDir, 'src/handler.js')).toBe(true)
      expect(existsIn(serviceDir, 'scripts/seed.js')).toBe(false)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('warns once when a solution-style tsconfig selects nothing', async () => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'tsconfig.json': JSON.stringify({
          files: [],
          references: [{ path: './src' }],
        }),
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/util.ts': 'export const helper = () => 1\n',
        'src/other.ts': 'export const other = 1\n',
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      const built = listBuild(serviceDir)
      expect(built).toContain('src/handler.js')
      expect(built).not.toContain('src/util.js')
      expect(built).not.toContain('src/other.js')
      // One aggregated warning for the whole build, not one per dropped file.
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain('build.esbuild.tsconfig')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('rejects an explicit tsconfig that is not there', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, tsconfig: './missing.json' },
    })

    await expect(plugin._build()).rejects.toMatchObject({
      code: 'ESBUILD_TSCONFIG_NOT_FOUND',
    })
  })

  it('hands an explicit tsconfig to esbuild as well as to the selection', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      // A name esbuild would never discover on its own, so a `jsxFactory` in
      // the emitted output can only have come from the option being forwarded.
      'tsconfig.build.json': JSON.stringify({
        include: ['src'],
        compilerOptions: { jsxFactory: 'buildFactory' },
      }),
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/widget.jsx': 'export const widget = () => <div />\n',
      'scripts/seed.ts': 'export const seed = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, tsconfig: './tsconfig.build.json' },
    })

    await plugin._build()

    expect(readIn(serviceDir, 'src/widget.js')).toContain('buildFactory')
    // Same config, same build: it governs selection too.
    expect(existsIn(serviceDir, 'scripts/seed.js')).toBe(false)
  })

  it('never hands a discovered tsconfig to esbuild', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'tsconfig.json': JSON.stringify({
        include: ['src'],
        compilerOptions: { jsxFactory: 'rootFactory' },
      }),
      // esbuild resolves compilerOptions per file. Forwarding the discovered
      // root config as esbuild's `tsconfig` would pin every file to it and
      // silently override the nested one Node's own tooling would apply.
      'src/nested/tsconfig.json': JSON.stringify({
        compilerOptions: { jsxFactory: 'nestedFactory' },
      }),
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/nested/widget.jsx': 'export const widget = () => <div />\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(readIn(serviceDir, 'src/nested/widget.js')).toContain(
      'nestedFactory',
    )
  })

  it('builds on when a discovered tsconfig cannot resolve its extends chain', async () => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        // The devDependency base config is not installed -- `npm ci --omit=dev`
        // on CI, or a slim Docker build stage.
        'tsconfig.json': '{"extends":"@tsconfig/node20/tsconfig.json"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/util.ts': 'export const helper = () => 1\n',
        'scripts/seed.ts': 'export const seed = 1\n',
      })
      const plugin = makePlugin(serviceDir, functions)

      await expect(plugin._build()).resolves.toBeUndefined()

      // No narrowing at all: an unreadable config nobody pointed us at must
      // not be able to strip files out of the artifact.
      const built = listBuild(serviceDir)
      expect(built).toContain('src/handler.js')
      expect(built).toContain('src/util.js')
      expect(built).toContain('scripts/seed.js')
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain('@tsconfig/node20')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('rejects an explicit tsconfig that cannot resolve its extends chain', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'tsconfig.build.json': '{"extends":"@tsconfig/node20/tsconfig.json"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: false, tsconfig: './tsconfig.build.json' },
    })

    await expect(plugin._build()).rejects.toMatchObject({
      code: 'ESBUILD_TSCONFIG_INVALID',
    })
  })

  it('lets package.patterns drop a file the tsconfig would have selected', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/secret.ts': 'export const secret = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      packageConfig: { patterns: ['!src/secret.ts'] },
    })

    await plugin._build()

    // The tsconfig narrows what the sweep selected; it can never widen it.
    expect(existsIn(serviceDir, 'src/secret.js')).toBe(false)
    expect(existsIn(serviceDir, 'src/handler.js')).toBe(true)
  })

  it('resolves a collision by leaving the excluded TypeScript out of the build', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
      'src/handler.ts': 'export const hello = async () => ({})\n',
      // A half-finished migration parked outside the tsconfig: `legacy.ts` is
      // not compiled, so it cannot claim `legacy/legacy.js` any more.
      'legacy/legacy.ts': 'export const legacy = 1\n',
      'legacy/legacy.js': 'exports.legacy = 1\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    await expect(plugin._build()).resolves.toBeUndefined()

    expect(readIn(serviceDir, 'legacy/legacy.js')).toContain('exports.legacy')
  })
})

describe('_buildProperties resolves tsconfig against the service directory', () => {
  jest.setTimeout(60_000)

  it('makes a relative tsconfig absolute even when the cwd is elsewhere', async () => {
    // Compose runs every service in-process from the compose root, so the
    // process cwd is not the service directory. esbuild resolves a relative
    // `tsconfig` against its own working directory, so leaving it relative
    // fails the bundling build with `Cannot find tsconfig file`.
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'tsconfig.build.json': '{"include":["src"]}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const composeRoot = makeServiceDir({ 'compose.yml': 'services: {}\n' })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: true, tsconfig: './tsconfig.build.json' },
    })

    const originalCwd = process.cwd()
    process.chdir(composeRoot)
    let buildProperties
    try {
      buildProperties = await plugin._buildProperties()
    } finally {
      process.chdir(originalCwd)
    }

    expect(path.isAbsolute(buildProperties.tsconfig)).toBe(true)
    expect(buildProperties.tsconfig).toBe(
      path.join(serviceDir, 'tsconfig.build.json'),
    )
  })

  it('leaves tsconfig unset when the service never set one', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
    })
    const plugin = makePlugin(serviceDir, functions)

    expect((await plugin._buildProperties()).tsconfig).toBeUndefined()
  })
})

describe('_build with bundle:true is unaffected', () => {
  jest.setTimeout(60_000)

  it('still emits only the handler bundle', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': HANDLER_TS,
      'src/util.ts': "export const helper = () => 'helped'\n",
      'src/legacy.js': 'exports.legacy = () => "legacy"\n',
      'assets/data.json': '{"a":1}\n',
    })
    const plugin = makePlugin(serviceDir, functions, {
      esbuildConfig: { bundle: true },
    })

    await plugin._build()

    expect(listBuild(serviceDir)).toEqual([
      'src/handler.js',
      'src/handler.js.map',
    ])
  })

  it('still emits only the handler bundle when bundling is left at its default', async () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc"}',
      'src/handler.ts': HANDLER_TS,
      'src/util.ts': "export const helper = () => 'helped'\n",
      'src/legacy.js': 'exports.legacy = () => "legacy"\n',
    })
    const plugin = makePlugin(serviceDir, functions, { esbuildConfig: {} })

    await plugin._build()

    expect(listBuild(serviceDir)).toEqual([
      'src/handler.js',
      'src/handler.js.map',
    ])
  })
})

/**
 * The failure this warns about is invisible until the deployed function is
 * invoked: Node's ES module resolver adds no extensions and probes no
 * `index.js`, so an `import './util'` that bundling used to resolve at build
 * time becomes `ERR_MODULE_NOT_FOUND` at runtime. CommonJS output is left
 * alone -- `require('./util')` still resolves the way it always did.
 */
describe('_build with bundle:false warns about extensionless ESM imports', () => {
  jest.setTimeout(60_000)

  const withWarnSpy = async (body) => {
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})
    try {
      return await body(warnSpy)
    } finally {
      warnSpy.mockRestore()
    }
  }

  it('names the emitted file and the specifier, once, for a "type": "module" service', async () => {
    await withWarnSpy(async (warnSpy) => {
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts':
          "import { helper } from './util'\n" +
          "import { fine } from './other.js'\n" +
          'export const hello = async () => ({ body: `${helper()}${fine()}` })\n',
        'src/util.ts': "export const helper = () => 'helped'\n",
        'src/other.ts': "export const fine = () => 'fine'\n",
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(warnSpy).toHaveBeenCalledTimes(1)
      const message = warnSpy.mock.calls[0][0]
      expect(message).toContain(
        "Found 1 relative import in this build's output",
      )
      expect(message).toContain('src/handler.js → ./util')
      // The specifier that already carries an extension is not in the list.
      expect(message).not.toContain('./other.js')
      // And the way out is named, in the terms tsc uses for the same rule.
      expect(message).toContain('nodenext')
      expect(message).toContain('./util.js')
    })
  })

  it('stays quiet when every relative import carries an extension', async () => {
    await withWarnSpy(async (warnSpy) => {
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts':
          "import { helper } from './util.js'\n" +
          'export const hello = async () => ({ body: helper() })\n',
        'src/util.ts': "export const helper = () => 'helped'\n",
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  it('never warns about CommonJS output, where the specifier still resolves', async () => {
    await withWarnSpy(async (warnSpy) => {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts':
          "import { helper } from './util'\n" +
          'export const hello = async () => ({ body: helper() })\n',
        'src/util.ts': "export const helper = () => 'helped'\n",
        'src/old.cts':
          "import { helper } from './util'\nexport const old = () => helper()\n",
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      // `require('./util')` is resolved by the CommonJS loader, which does try
      // extensions -- there is nothing to warn about.
      expect(readIn(serviceDir, 'src/handler.js')).toMatch(/require\(/)
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  it('warns about a .mjs-class output inside an otherwise CommonJS service', async () => {
    await withWarnSpy(async (warnSpy) => {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/tool.mts':
          "import { helper } from './util'\nexport const tool = () => helper()\n",
        'src/util.ts': "export const helper = () => 'helped'\n",
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      // `.mts` is ESM by definition, so it is scanned even though the service
      // as a whole is CommonJS -- and the CommonJS siblings are not.
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain('src/tool.mjs → ./util')
    })
  })

  it('catches a side-effect import and an `export * from`', async () => {
    await withWarnSpy(async (warnSpy) => {
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts':
          "import './polyfill'\nexport const hello = async () => ({})\n",
        'src/polyfill.ts': 'globalThis.patched = true\n',
        'src/barrel.ts': "export * from './util'\n",
        'src/util.ts': 'export const helper = () => 1\n',
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(warnSpy).toHaveBeenCalledTimes(1)
      const message = warnSpy.mock.calls[0][0]
      expect(message).toContain('src/handler.js → ./polyfill')
      expect(message).toContain('src/barrel.js → ./util')
    })
  })

  it('lists at most ten pairs and reports the true total', async () => {
    await withWarnSpy(async (warnSpy) => {
      const files = {
        'package.json': '{"type":"module"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/target.ts': 'export const target = 1\n',
      }
      for (let index = 0; index < 12; index += 1) {
        files[`src/m${index}.ts`] =
          `import { target } from './target'\n` +
          `export const m${index} = target\n`
      }
      const serviceDir = makeServiceDir(files)
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(warnSpy).toHaveBeenCalledTimes(1)
      const message = warnSpy.mock.calls[0][0]
      expect(message).toContain('Found 12 relative imports')
      expect(message).toContain('and 2 more')
      expect(message.match(/→/g)).toHaveLength(10)
    })
  })

  it('warns about a dynamic import in CommonJS output, where import() still uses the ESM resolver', async () => {
    await withWarnSpy(async (warnSpy) => {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/old.cts':
          "export const load = async () => import('./dyn')\n" +
          "export const fine = async () => import('./ok.js')\n",
        'src/dyn.ts': 'export const dyn = 1\n',
        'src/ok.ts': 'export const ok = 1\n',
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      // esbuild leaves `import()` exactly as written even when emitting
      // CommonJS, and Node routes it through the ES module resolver whatever
      // the calling file is -- so this is the same ERR_MODULE_NOT_FOUND as in
      // an ESM file, in output that used to be skipped entirely.
      expect(readIn(serviceDir, 'src/old.cjs')).toContain('import("./dyn")')
      expect(warnSpy).toHaveBeenCalledTimes(1)
      const message = warnSpy.mock.calls[0][0]
      expect(message).toContain('src/old.cjs → ./dyn')
      expect(message).not.toContain('./ok.js')
    })
  })

  it('never warns about a STATIC import in CommonJS output, which esbuild rewrote to require()', async () => {
    await withWarnSpy(async (warnSpy) => {
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/old.cts':
          "import { helper } from './util'\nexport const old = () => helper()\n",
        'src/util.ts': "export const helper = () => 'helped'\n",
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      // The specifier survives only inside a `require()`, and the CommonJS
      // resolver does try extensions -- so there is nothing wrong here.
      expect(readIn(serviceDir, 'src/old.cjs')).toContain('require("./util")')
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  it('does not full-scan CommonJS output (mutation probe for the dynamicOnly narrowing)', async () => {
    await withWarnSpy(async (warnSpy) => {
      // On genuine CommonJS output a full scan and a dynamic-only scan agree,
      // because esbuild has already turned every static import into a
      // `require()` that neither pattern matches. That is precisely why the
      // narrowing is safe -- and precisely why the previous test cannot detect
      // whether it is applied at all.
      //
      // A string literal is the one thing esbuild does preserve verbatim, so
      // it is the only way to observe the boundary from the outside. This
      // leans on the documented "regex over text, not a parse" limitation and
      // uses it as an instrument: under a dynamic-only scan `./guide` is
      // invisible, under a full scan it is reported.
      const serviceDir = makeServiceDir({
        'package.json': '{"name":"svc"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/old.cts': `export const doc = "see import { x } from './guide' for details"\n`,
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(readIn(serviceDir, 'src/old.cjs')).toContain(`from './guide'`)
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  it('warns about a specifier naming a source file the build renames', async () => {
    await withWarnSpy(async (warnSpy) => {
      // `./util.ts` looks extensioned, so the dot heuristic waves it through,
      // but `util.ts` is emitted as `util.js` -- the specifier names a file
      // that is not in the artifact under that name. Guaranteed broken.
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts':
          "import { helper } from './util.ts'\n" +
          "import { tool } from './tool.mts'\n" +
          'export const hello = async () => ({ body: `${helper()}${tool()}` })\n',
        'src/util.ts': "export const helper = () => 'helped'\n",
        'src/tool.mts': "export const tool = () => 'tooled'\n",
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(readIn(serviceDir, 'src/handler.js')).toContain('"./util.ts"')
      expect(warnSpy).toHaveBeenCalledTimes(1)
      const message = warnSpy.mock.calls[0][0]
      expect(message).toContain(
        'src/handler.js → ./util.ts (emitted as "./util.js")',
      )
      // The rename is extension-specific: `.mts` becomes `.mjs`, not `.js`.
      expect(message).toContain('./tool.mts (emitted as "./tool.mjs")')
    })
  })

  it('says nothing about a template-literal dynamic import', async () => {
    await withWarnSpy(async (warnSpy) => {
      // esbuild preserves it verbatim and its value is not knowable from the
      // text, so the scan must neither crash on it nor invent an offender.
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts':
          'export const hello = async (n) => import(`./p/${n}`)\n',
        'src/p/a.ts': 'export const a = 1\n',
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(readIn(serviceDir, 'src/handler.js')).toContain('`./p/${n}`')
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  it('follows an outExtension rename to find the file it emitted', async () => {
    await withWarnSpy(async (warnSpy) => {
      // The scan reads the plan, not the directory, so a `.js` class the user
      // moved onto `.mjs` has to be looked for under its real name. Get this
      // wrong and the read simply misses -- no error, no warning, and the
      // diagnostic quietly stops working for every service that sets it.
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts':
          "import { helper } from './util'\n" +
          'export const hello = async () => ({ body: helper() })\n',
        'src/util.ts': "export const helper = () => 'helped'\n",
      })
      const plugin = makePlugin(serviceDir, functions, {
        esbuildConfig: { bundle: false, outExtension: { '.js': '.mjs' } },
      })

      await plugin._build()

      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain('src/handler.mjs → ./util')
    })
  })

  it('says nothing, and throws nothing of its own, when esbuild wrote no files', async () => {
    await withWarnSpy(async (warnSpy) => {
      // `write: false` from a configFile leaves the build dir empty, so every
      // file the scan was told to read is missing. That is the configFile's
      // business -- `_assertAllHandlersBuilt` is what reports it -- and a
      // diagnostic must not turn it into a different, wronger error.
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts':
          "import { helper } from './util'\n" +
          'export const hello = async () => ({ body: helper() })\n',
        'src/util.ts': "export const helper = () => 'helped'\n",
        'esbuild.config.mjs': 'export default () => ({ write: false })\n',
      })
      const plugin = makePlugin(serviceDir, functions, {
        esbuildConfig: { bundle: false, configFile: './esbuild.config.mjs' },
      })

      await expect(plugin._build()).rejects.toMatchObject({
        code: 'ESBUILD_HANDLER_NOT_BUILT',
      })

      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  it('does not scan copied files, only compiled ESM output', async () => {
    await withWarnSpy(async (warnSpy) => {
      // A hand-written `.mjs`/`.js` helper is copied verbatim rather than
      // compiled, so it is not a partition output and nothing reads it. The
      // scan is deliberately scoped to what this build emitted; widening it to
      // the copy set would mean re-deriving each copied file's module system.
      const serviceDir = makeServiceDir({
        'package.json': '{"type":"module"}',
        'src/handler.ts': 'export const hello = async () => ({})\n',
        'src/copied.mjs': "import './util'\nexport const copied = 1\n",
      })
      const plugin = makePlugin(serviceDir, functions)

      await plugin._build()

      expect(existsIn(serviceDir, 'src/copied.mjs')).toBe(true)
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })
})

/**
 * Where esbuild's own diagnostics go.
 *
 * The non-bundled path runs esbuild at `logLevel: 'warning'` so its findings
 * are not swallowed, and those findings do not come back through the JS API's
 * return value alone: the esbuild service is a child process spawned with
 * `stdio: ['pipe', 'pipe', 'inherit']`, so the formatted warning is written by
 * the Go binary straight onto the Framework process's own stderr. Nothing in
 * this process can intercept it -- not a `console` spy, not a
 * `process.stderr.write` patch -- which is exactly why this test runs a real
 * build in a child process and reads that child's stderr.
 */
describe('_build with bundle:false surfaces esbuild diagnostics', () => {
  jest.setTimeout(60_000)

  /** Run a real `_build` in a child node process and hand back its output. */
  function buildInChildProcess(serviceDir) {
    // The driver lives outside the service directory: anything inside it would
    // be swept into the build and change what is under test.
    const driverDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-driver-')),
    )
    createdServiceDirs.push(driverDir)
    const driver = path.join(driverDir, 'build.mjs')
    const pluginPath = new URL(
      '../../../../../lib/plugins/esbuild/index.js',
      import.meta.url,
    ).href
    fs.writeFileSync(
      driver,
      `import Esbuild from ${JSON.stringify(pluginPath)}\n` +
        `const serviceDir = ${JSON.stringify(serviceDir)}\n` +
        `const functions = ${JSON.stringify(functions)}\n` +
        `const serverless = {\n` +
        `  serviceDir,\n` +
        `  config: { serviceDir },\n` +
        `  service: {\n` +
        `    service: 'my-service',\n` +
        `    provider: { runtime: 'nodejs20.x' },\n` +
        `    package: {},\n` +
        `    build: { esbuild: { bundle: false } },\n` +
        `    functions,\n` +
        `    getFunction: (alias) => functions[alias],\n` +
        `    getAllFunctions: () => Object.keys(functions),\n` +
        `    getAllLayers: () => [],\n` +
        `    getLayer: () => undefined,\n` +
        `  },\n` +
        `  pluginManager: {\n` +
        `    spawn: async () => {},\n` +
        `    parsePluginsObject: () => ({ localPath: null }),\n` +
        `  },\n` +
        `}\n` +
        `const plugin = new Esbuild(serverless, {})\n` +
        `plugin.functions = async () => functions\n` +
        `await plugin._build()\n`,
    )

    // A bounded wait, well inside the suite's own 60s budget: an esbuild
    // service that never answers would otherwise hang the jest worker until
    // the whole run is killed, with nothing to show for it. On any failure the
    // child's own output is what explains it, so it goes into the message
    // rather than being thrown away with the process.
    const result = spawnSync(process.execPath, [driver], {
      encoding: 'utf8',
      timeout: 45_000,
      killSignal: 'SIGKILL',
    })
    if (result.error || result.status !== 0) {
      throw new Error(
        `Child build failed (status ${result.status}, signal ${result.signal}` +
          `${result.error ? `, ${result.error.message}` : ''}).\n` +
          `--- child stdout ---\n${result.stdout ?? ''}\n` +
          `--- child stderr ---\n${result.stderr ?? ''}`,
      )
    }
    return result
  }

  it('prints esbuild warnings to stderr, but has none to print for an unanalyzable require', () => {
    const serviceDir = makeServiceDir({
      'package.json': '{"name":"svc","type":"module"}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      // A require esbuild cannot follow, in a file that stays CommonJS.
      'src/dynamic.cts':
        'const name = process.env.MOD\nmodule.exports = { m: require(name) }\n',
      // A genuine esbuild warning, to prove the channel is open at all.
      'src/legacy.mts': 'module.exports = { legacy: 1 }\n',
    })

    const { stderr } = buildInChildProcess(serviceDir)

    // The channel works: `logLevel: 'warning'` puts esbuild's findings in front
    // of the user, on stderr, in esbuild's own formatting.
    expect(stderr).toContain('[WARNING]')
    expect(stderr).toContain('commonjs-variable-in-esm')
    expect(stderr).toContain('src/legacy.mts')

    // And the dynamic require is NOT among them. esbuild only reports a
    // require it cannot follow when it was going to follow it -- that is, when
    // bundling. With `bundle: false` it never resolves an import at all, so
    // there is no such warning to surface at any log level. The call ships
    // exactly as written and is resolved by Node at runtime, which is the
    // correct outcome for an unbundled CommonJS file.
    expect(stderr).not.toMatch(/will not be bundled/)
    expect(readIn(serviceDir, 'src/dynamic.cjs')).toContain('require(name)')
  })
})
