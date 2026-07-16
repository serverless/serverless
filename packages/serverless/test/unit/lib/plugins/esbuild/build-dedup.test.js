/**
 * Multiple Framework functions can point at the same handler file (one module
 * exporting several handlers). Before the fix, `_build` ran one
 * `esbuild.build()` per function; functions sharing a handler file therefore
 * spawned concurrent builds writing to the SAME outfile, racing on
 * truncate+write and corrupting the bundle (#13716).
 *
 * The fix groups functions by their resolved absolute entry path and builds
 * each unique file exactly once, then replays the per-function side effects
 * (`builtFunctions` membership, the `--enable-source-maps` NODE_OPTIONS
 * mutation) for every alias in the group. When functions sharing a file
 * resolve to different esbuild `external` lists (only possible when their
 * per-function runtimes straddle the node16/18 boundary while bundling), the
 * plugin builds once with the intersection and logs a warning.
 *
 * These tests pin that behavior. `esbuild` is mocked with a spy so we can count
 * and inspect `build()` calls; the final test swaps the spy to delegate to the
 * REAL esbuild to prove the single-build path produces a valid bundle.
 *
 * Pre-fix, the call-count assertions would have failed: the 4-functions case
 * called `build()` 4 times (not 1) and the shared-runtime-conflict case 2 times
 * (not 1), with no intersection reconciliation and no warning.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { log } from '@serverless/util'

// `build` is a spy. Its default implementation is set per-test in beforeEach;
// `realBuild` (captured from the actual esbuild via requireActual) lets the
// final test delegate to the real bundler while still counting the call.
let realBuild
const buildMock = jest.fn()

jest.unstable_mockModule('esbuild', () => {
  realBuild = jest.requireActual('esbuild').build
  return { build: buildMock }
})

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

// The plugin logs conflicts via `log.get('esbuild')`, a memoized singleton, so
// this is the same instance the plugin holds — spying here intercepts its call.
const esbuildLogger = log.get('esbuild')

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

function makePlugin(serviceDir, functions, { runtime = 'nodejs18.x' } = {}) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime },
      functions,
      getFunction: (alias) => functions[alias],
    },
  }
  const plugin = new Esbuild(serverless, {})
  // Target `_build` directly: bypass the introspection in `functions()` so the
  // grouping/build logic is what's under test.
  plugin.functions = async () => functions
  return plugin
}

describe('esbuild shared-handler build dedup', () => {
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

  test('4 functions sharing one handler file build the file once', async () => {
    const serviceDir = makeServiceDir({
      'handler.ts':
        'export const a = async () => ({})\n' +
        'export const b = async () => ({})\n' +
        'export const c = async () => ({})\n' +
        'export const d = async () => ({})\n',
    })
    const functions = {
      a: { handler: 'handler.a' },
      b: { handler: 'handler.b' },
      c: { handler: 'handler.c' },
      d: { handler: 'handler.d' },
    }
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    // Pre-fix: called 4 times (one per function), racing on the same outfile.
    expect(buildMock).toHaveBeenCalledTimes(1)

    expect([...plugin.serverless.builtFunctions].sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    for (const alias of ['a', 'b', 'c', 'd']) {
      expect(functions[alias].environment.NODE_OPTIONS).toBe(
        '--enable-source-maps',
      )
    }
  })

  test('2 functions with distinct handler files build twice', async () => {
    const serviceDir = makeServiceDir({
      'alpha.ts': 'export const a = async () => ({})\n',
      'beta.ts': 'export const b = async () => ({})\n',
    })
    const functions = {
      a: { handler: 'alpha.a' },
      b: { handler: 'beta.b' },
    }
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(2)
    expect([...plugin.serverless.builtFunctions].sort()).toEqual(['a', 'b'])
  })

  test('shared handler with node16/node18 runtimes builds once with the intersection and warns', async () => {
    const serviceDir = makeServiceDir({
      'shared.ts':
        'export const a = async () => ({})\nexport const b = async () => ({})\n',
    })
    // Per-function runtimes straddle the node16/18 boundary: `a` resolves to
    // external ['aws-sdk'], `b` to ['@aws-sdk/*']. Their intersection is empty.
    const functions = {
      a: { handler: 'shared.a', runtime: 'nodejs16.x' },
      b: { handler: 'shared.b', runtime: 'nodejs18.x' },
    }
    const plugin = makePlugin(serviceDir, functions)

    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})

    try {
      await plugin._build()

      // Pre-fix: called twice (one per function) with no reconciliation.
      expect(buildMock).toHaveBeenCalledTimes(1)

      // The captured `external` is the intersection of the two lists (empty).
      const props = buildMock.mock.calls[0][0]
      expect(props.external).toEqual([])

      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toMatch(
        /share the handler file .* different esbuild "external" lists/,
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('suffix stripping derives the correct entry/outfile when a path segment collides with the export name', async () => {
    // The directory name mirrors the export name (`items.get`), so `.get`
    // occurs TWICE in the handler string. First-occurrence stripping (the old
    // bug) removes the `.get` in the directory segment, deriving the
    // nonexistent entry `handlers/items/index.get.ts` — the function is then
    // silently skipped (0 builds, no captured props). Last-occurrence
    // stripping derives the real file.
    const serviceDir = makeServiceDir({
      'handlers/items.get/index.ts':
        'export const get = async () => ({ statusCode: 200 })\n',
    })
    const functions = {
      getItems: { handler: 'handlers/items.get/index.get' },
    }
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(1)
    const props = buildMock.mock.calls[0][0]
    expect(props.entryPoints).toEqual([
      path.join(serviceDir, 'handlers', 'items.get', 'index.ts'),
    ])
    expect(props.outfile).toBe(
      path.join(
        serviceDir,
        '.serverless',
        'build',
        'handlers',
        'items.get',
        'index.js',
      ),
    )
    expect([...plugin.serverless.builtFunctions]).toEqual(['getItems'])
  })

  test('real esbuild: one shared .ts handler across 4 functions yields a single valid bundle', async () => {
    // Delegate the spy to the real bundler so we exercise the actual build.
    buildMock.mockImplementation((props) => realBuild(props))

    const serviceDir = makeServiceDir({
      'handler.ts':
        'export const a = async () => ({ statusCode: 200 })\n' +
        'export const b = async () => ({ statusCode: 201 })\n' +
        'export const c = async () => ({ statusCode: 202 })\n' +
        'export const d = async () => ({ statusCode: 203 })\n',
    })
    const functions = {
      a: { handler: 'handler.a' },
      b: { handler: 'handler.b' },
      c: { handler: 'handler.c' },
      d: { handler: 'handler.d' },
    }
    const plugin = makePlugin(serviceDir, functions)

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(1)

    const outfile = path.join(serviceDir, '.serverless', 'build', 'handler.js')
    expect(fs.existsSync(outfile)).toBe(true)

    // A corrupted (concurrently-truncated) bundle would have zero or multiple
    // trailing sourcemap comments; a clean single build has exactly one.
    const contents = fs.readFileSync(outfile, 'utf-8')
    expect((contents.match(/sourceMappingURL/g) || []).length).toBe(1)

    expect([...plugin.serverless.builtFunctions].sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })
})
