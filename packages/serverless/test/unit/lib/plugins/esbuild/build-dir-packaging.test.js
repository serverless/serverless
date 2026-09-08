/**
 * `.serverless/build` is the authoritative source for the deployment artifact,
 * so it must not accumulate outputs from earlier builds: a handler that was
 * renamed or deleted would otherwise keep shipping forever.
 *
 * `_resetBuildDir` wipes the directory before each deploy/package build, with
 * two deliberate exceptions:
 *   - `node_modules` and the lockfiles are NOT esbuild outputs. They are
 *     produced by the dependency install step and re-creating them cold on
 *     every deploy is a multi-second regression.
 *   - dev mode (`_build('originalHandler')`) must keep the last-good outputs
 *     so a failed incremental rebuild doesn't leave the dev loop with nothing
 *     to serve.
 */

import { jest } from '@jest/globals'
import { ZipArchive } from 'archiver'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'
import { log } from '@serverless/util'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

// `log.get` is a memoized singleton, so this is the same logger instance the
// plugin holds — spying here intercepts its calls.
const esbuildLogger = log.get('esbuild')

const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * `realpathSync` because macOS resolves the temp dir through a symlink
 * (`/var` -> `/private/var`), and esbuild reports real paths -- an unresolved
 * prefix makes `outbase` fail to match the entry points, which collapses the
 * built layout into the build root and breaks every path comparison downstream
 * of a real build.
 */
function makeTempDir() {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-reset-')),
  )
  createdServiceDirs.push(serviceDir)
  return serviceDir
}

function makeServiceDir() {
  const serviceDir = makeTempDir()
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep'), { recursive: true })
  fs.writeFileSync(path.join(buildDir, 'node_modules', 'dep', 'index.js'), 'x')
  fs.writeFileSync(path.join(buildDir, 'stale-output.js'), 'stale')
  fs.writeFileSync(path.join(buildDir, 'package-lock.json'), '{}')
  return { serviceDir, buildDir }
}

// A service whose only source file is `src/handler.ts` exporting `hello`.
function makeTsServiceDir() {
  const serviceDir = makeTempDir()
  fs.mkdirSync(path.join(serviceDir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'handler.ts'),
    'export const hello = async (): Promise<object> => ({ statusCode: 200 })\n',
  )
  return { serviceDir }
}

function makeServerless(serviceDir, fns = {}, esbuild = { bundle: false }) {
  return {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs20.x' },
      package: {},
      build: { esbuild },
      functions: fns,
      getFunction: (n) => fns[n],
      getAllFunctions: () => Object.keys(fns),
    },
    pluginManager: { spawn: async () => {} },
  }
}

// Write `{ relativePath: contents }` under `root`, creating parent directories.
function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, ...relativePath.split('/'))
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
}

// A service directory whose `.serverless/build` already holds `buildFiles`,
// as if `_build` + `_preparePackageJson` had just run.
function seedBuildDir(buildFiles, serviceFiles = {}) {
  const serviceDir = makeTempDir()
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  fs.mkdirSync(buildDir, { recursive: true })
  writeFiles(buildDir, buildFiles)
  writeFiles(serviceDir, serviceFiles)
  return { serviceDir, buildDir }
}

/**
 * Entry names straight out of the zip central directory, in stored order and
 * WITH duplicates. `JsZip.loadAsync` keys its `files` object by name, so a
 * doubly-appended entry is invisible there — which is exactly what the
 * node_modules double-add regression would look like.
 */
function centralDirectoryNames(artifactPath) {
  const buffer = fs.readFileSync(artifactPath)
  let eocd = buffer.length - 22
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1
  if (eocd < 0) throw new Error('not a zip file')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const names = []
  for (let i = 0; i < count; i += 1) {
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

async function zipEntries(artifactPath) {
  const zip = await JsZip.loadAsync(fs.readFileSync(artifactPath))
  return zip.files
}

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const serviceArtifact = (serviceDir) =>
  path.join(serviceDir, '.serverless', 'svc.zip')

const functionArtifact = (serviceDir, alias) =>
  path.join(serviceDir, '.serverless', `svc-${alias}.zip`)

describe('_resetBuildDir', () => {
  it('removes stale outputs but preserves node_modules and lockfiles', async () => {
    const { serviceDir, buildDir } = makeServiceDir()
    const plugin = new Esbuild(makeServerless(serviceDir), {})
    await plugin._resetBuildDir()
    expect(fs.existsSync(path.join(buildDir, 'stale-output.js'))).toBe(false)
    expect(
      fs.existsSync(path.join(buildDir, 'node_modules', 'dep', 'index.js')),
    ).toBe(true)
    expect(fs.existsSync(path.join(buildDir, 'package-lock.json'))).toBe(true)
    expect(fs.existsSync(buildDir)).toBe(true) // dir recreated/kept
  })

  it('creates the build dir when absent', async () => {
    const serviceDir = makeTempDir()
    const plugin = new Esbuild(makeServerless(serviceDir), {})
    await plugin._resetBuildDir()
    expect(fs.existsSync(path.join(serviceDir, '.serverless', 'build'))).toBe(
      true,
    )
  })

  it('fails loudly when the build dir cannot be reset', async () => {
    // The predecessor (`_cleanUp`) swallowed every error, so a build dir that
    // could not be cleared silently shipped stale artifacts. Force a failure by
    // making `.serverless` a regular FILE: `mkdir` of `.serverless/build` then
    // fails with ENOTDIR on every platform, no fs mocking required.
    const serviceDir = makeTempDir()
    fs.writeFileSync(path.join(serviceDir, '.serverless'), 'not a directory')
    const plugin = new Esbuild(makeServerless(serviceDir), {})

    await expect(plugin._resetBuildDir()).rejects.toMatchObject({
      name: 'ServerlessError',
      code: 'ESBUILD_BUILD_DIR_RESET_FAILED',
    })
  })

  it('constructs without a service dir', () => {
    // The plugin is instantiated on every CLI invocation, including ones run
    // outside a service (`serverless create`), where `config.serviceDir` is
    // null. Capturing the build dir eagerly must not crash those.
    const serverless = makeServerless(null)
    expect(() => new Esbuild(serverless, {})).not.toThrow()
  })
})

describe('_build resets the build dir only off the dev path', () => {
  jest.setTimeout(30_000)

  const handlerSource =
    'export const hello = async () => ({ statusCode: 200 })\n'

  it('wipes stale outputs on the deploy/package path', async () => {
    const { serviceDir, buildDir } = makeServiceDir()
    fs.writeFileSync(path.join(serviceDir, 'handler.js'), handlerSource)
    const fns = { hello: { handler: 'handler.hello' } }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})
    plugin.functions = async () => fns

    await plugin._build()

    expect(fs.existsSync(path.join(buildDir, 'stale-output.js'))).toBe(false)
    expect(fs.existsSync(path.join(buildDir, 'handler.js'))).toBe(true)
  })

  it('keeps previous outputs on the dev-mode path', async () => {
    const { serviceDir, buildDir } = makeServiceDir()
    fs.writeFileSync(path.join(serviceDir, 'handler.js'), handlerSource)
    const fns = { hello: { originalHandler: 'handler.hello' } }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})
    plugin.functions = async () => fns

    await plugin._build('originalHandler')

    expect(fs.existsSync(path.join(buildDir, 'stale-output.js'))).toBe(true)
    expect(fs.existsSync(path.join(buildDir, 'handler.js'))).toBe(true)
  })
})

/**
 * Packaging must never re-derive where a handler was emitted: the build knows
 * the exact outfile, so it records it. And a function esbuild was asked to
 * build but whose handler file it could not resolve used to be skipped in
 * silence, shipping a zip with no handler in it (#12970) — it now fails the
 * build.
 */
describe('_build bookkeeping', () => {
  jest.setTimeout(30_000)

  it('records emitted artifact paths per alias', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = { hello: { handler: 'src/handler.hello' } }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._build()

    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.js',
      mapfile: 'src/handler.js.map',
    })
  })

  it('records the same artifact for every alias sharing a handler file', async () => {
    // The build is deduplicated per handler FILE, but the recording is
    // per-alias: a group member that never had its own esbuild call must
    // still be able to say where its artifact lives.
    const { serviceDir } = makeTsServiceDir()
    fs.appendFileSync(
      path.join(serviceDir, 'src', 'handler.ts'),
      'export const bye = async (): Promise<object> => ({ statusCode: 204 })\n',
    )
    const fns = {
      hello: { handler: 'src/handler.hello' },
      bye: { handler: 'src/handler.bye' },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._build()

    expect(plugin.builtArtifacts.get('bye')).toEqual({
      outfile: 'src/handler.js',
      mapfile: 'src/handler.js.map',
    })
  })

  it('records artifacts when bundling too', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = { hello: { handler: 'src/handler.hello' } }
    const plugin = new Esbuild(
      makeServerless(serviceDir, fns, { bundle: true }),
      {},
    )

    await plugin._build()

    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.js',
      mapfile: 'src/handler.js.map',
    })
  })

  it('records a null mapfile when no sourcemap is emitted', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = { hello: { handler: 'src/handler.hello' } }
    const plugin = new Esbuild(
      makeServerless(serviceDir, fns, { bundle: false, sourcemap: false }),
      {},
    )

    await plugin._build()

    expect(plugin.builtArtifacts.get('hello')).toEqual({
      outfile: 'src/handler.js',
      mapfile: null,
    })
  })

  it('starts from a clean slate on every build', async () => {
    // Dev mode rebuilds through the same instance; a Map that accumulated
    // across builds would keep reporting artifacts for deleted functions.
    const { serviceDir } = makeTsServiceDir()
    const fns = { hello: { handler: 'src/handler.hello' } }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._build()
    const first = plugin.builtArtifacts
    await plugin._build()

    expect(plugin.builtArtifacts).not.toBe(first)
    expect([...plugin.builtArtifacts.keys()]).toEqual(['hello'])
  })

  it('throws ESBUILD_HANDLER_NOT_BUILT when an approved handler file does not exist', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = { ghost: { handler: 'src/missing.handler' } }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._build()).rejects.toMatchObject({
      name: 'ServerlessError',
      code: 'ESBUILD_HANDLER_NOT_BUILT',
    })
  })

  it('names only the unresolvable function when others build fine', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = {
      hello: { handler: 'src/handler.hello' },
      ghost: { handler: 'src/missing.handler' },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    const error = await plugin._build().then(
      () => undefined,
      (err) => err,
    )

    expect(error?.code).toBe('ESBUILD_HANDLER_NOT_BUILT')
    expect(error.message).toContain('"ghost" (handler: src/missing.handler)')
    expect(error.message).not.toContain('"hello"')
    // The message must name what was actually probed, or it sends people
    // hunting for a file extension the plugin never looks for.
    for (const extension of [
      '.js',
      '.ts',
      '.cjs',
      '.mjs',
      '.cts',
      '.mts',
      '.jsx',
      '.tsx',
    ]) {
      expect(error.message).toContain(extension)
    }
  })

  it('ignores functions esbuild was never asked to build', async () => {
    // Image/docker functions have no `handler` at all, and a function with a
    // prebuilt `package.artifact` is packaged as-is. Neither is approved by
    // `_shouldBuildFunction`, so neither may trip the assertion — note the
    // artifact function deliberately points at a nonexistent handler file.
    const { serviceDir } = makeTsServiceDir()
    const fns = {
      hello: { handler: 'src/handler.hello' },
      docker: { image: 'account.dkr.ecr.us-east-1.amazonaws.com/repo:tag' },
      prebuilt: {
        handler: 'src/nowhere.handler',
        package: { artifact: 'prebuilt.zip' },
      },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._build()).resolves.toBeUndefined()

    expect([...plugin.builtArtifacts.keys()]).toEqual(['hello'])
  })

  it('does not assert on the dev-mode path', async () => {
    // Dev mode swallows build failures by design so the dev loop keeps
    // serving; a missing handler there must not abort it either.
    const { serviceDir } = makeTsServiceDir()
    const fns = { ghost: { originalHandler: 'src/missing.handler' } }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._build('originalHandler')).resolves.toBeUndefined()
  })

  it('records nothing when esbuild is configured not to write the outfile', async () => {
    // A configFile merging `write: false` makes esbuild return the output in
    // memory and touch nothing on disk. Recording the path we asked for would
    // hand packaging a phantom artifact that satisfies the assertion, so the
    // outfile has to be probed, not assumed.
    const { serviceDir } = makeTsServiceDir()
    fs.writeFileSync(
      path.join(serviceDir, 'esbuild.config.mjs'),
      'export default () => ({ write: false })\n',
    )
    const fns = { hello: { handler: 'src/handler.hello' } }
    const plugin = new Esbuild(
      makeServerless(serviceDir, fns, {
        bundle: false,
        configFile: './esbuild.config.mjs',
      }),
      {},
    )

    await expect(plugin._build()).rejects.toMatchObject({
      code: 'ESBUILD_HANDLER_NOT_BUILT',
    })

    expect(plugin.builtArtifacts.size).toBe(0)
  })
})

/**
 * A handler string does not have to point at a file in the service directory:
 * the Datadog and New Relic wrappers point at a path inside a Lambda layer
 * (`/opt/nodejs/node_modules/datadog-lambda-js/handler.datadog`) that only
 * exists at runtime. Those configs deploy and work, so they must not be
 * treated as the #12970 typo case.
 */
describe('_build unresolvable handlers with layers', () => {
  jest.setTimeout(30_000)

  let warnSpy

  beforeEach(() => {
    warnSpy = jest.spyOn(esbuildLogger, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  const datadogHandler =
    '/opt/nodejs/node_modules/datadog-lambda-js/handler.datadog'

  it('warns instead of throwing when the function configures layers', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = {
      wrapped: {
        handler: datadogHandler,
        layers: [
          'arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Node20-x:1',
        ],
      },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._build()).resolves.toBeUndefined()

    expect(plugin.builtArtifacts.has('wrapped')).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/provided by a Lambda layer/)
    expect(warnSpy.mock.calls[0][0]).toContain('"wrapped"')
  })

  it('warns instead of throwing when only the provider configures layers', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = { wrapped: { handler: datadogHandler } }
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.provider.layers = [
      'arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Node20-x:1',
    ]
    const plugin = new Esbuild(serverless, {})

    await expect(plugin._build()).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('emits a single aggregated warning for several layer-provided handlers', async () => {
    const { serviceDir } = makeTsServiceDir()
    const layers = ['arn:aws:lambda:us-east-1:1234567890:layer:wrapper:1']
    const fns = {
      hello: { handler: 'src/handler.hello', layers },
      wrappedA: { handler: datadogHandler, layers },
      wrappedB: { handler: 'newrelic-lambda-wrapper.handler', layers },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._build()).resolves.toBeUndefined()

    expect([...plugin.builtArtifacts.keys()]).toEqual(['hello'])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('"wrappedA"')
    expect(warnSpy.mock.calls[0][0]).toContain('"wrappedB"')
  })

  it('still throws for a layerless function alongside a layer-provided one', async () => {
    const { serviceDir } = makeTsServiceDir()
    const fns = {
      wrapped: {
        handler: datadogHandler,
        layers: ['arn:aws:lambda:us-east-1:1234567890:layer:wrapper:1'],
      },
      typo: { handler: 'src/hanlder.hello' },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    const error = await plugin._build().then(
      () => undefined,
      (err) => err,
    )

    expect(error?.code).toBe('ESBUILD_HANDLER_NOT_BUILT')
    expect(error.message).toContain('"typo"')
    expect(error.message).not.toContain('"wrapped"')
    // The escape hatch the message advertises has to be a real one.
    expect(error.message).toContain('build: false')
    // The layer-provided function is still reported, just not fatally.
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('excludes a function with build: false entirely', async () => {
    // Neither built nor asserted on nor warned about — the documented way out
    // for a handler esbuild should keep its hands off.
    const { serviceDir } = makeTsServiceDir()
    const fns = {
      hello: { handler: 'src/handler.hello' },
      wrapped: { handler: datadogHandler, build: false },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._build()).resolves.toBeUndefined()

    expect([...plugin.builtArtifacts.keys()]).toEqual(['hello'])
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('_shouldBuildFunction opt-outs', () => {
  it('treats function-level build: false as an opt-out even when the provider enables esbuild', async () => {
    // `false` is falsy, so it used to fall straight through the
    // `functionBuildParam` checks into the provider-level default and build
    // the function anyway — there was no per-function way out.
    const { serviceDir } = makeTsServiceDir()
    const plugin = new Esbuild(
      makeServerless(serviceDir, {
        optedOut: { handler: 'src/handler.hello', build: false },
      }),
      {},
    )

    expect(
      await plugin._shouldBuildFunction({
        handler: 'src/handler.hello',
        build: false,
      }),
    ).toBe(false)
    expect(await plugin.functions()).toEqual({})
  })

  it('still builds a function whose build is set to esbuild', async () => {
    const { serviceDir } = makeTsServiceDir()
    const plugin = new Esbuild(makeServerless(serviceDir, {}), {})

    expect(
      await plugin._shouldBuildFunction({
        handler: 'src/handler.hello',
        build: 'esbuild',
      }),
    ).toBe(true)
  })
})

/**
 * The build directory is the artifact definition: whatever `_build`,
 * `_preparePackageJson` and any `esbuild-package` plugin leave in there is
 * what deploys. The predecessor hand-picked a handler, its sourcemap, the
 * package.json and the lockfiles, so anything an esbuild plugin emitted
 * alongside the bundle — templates, locale JSON, WASM, native `.node` binaries
 * — was silently dropped (#13163).
 */
describe('_packageAll build-dir sweep', () => {
  jest.setTimeout(30_000)

  const fns = { hello: { handler: 'src/handler.hello' } }

  it('ships every build-dir file including plugin-emitted assets', async () => {
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'export const hello = () => {}\n',
      'src/handler.js.map': '{}\n',
      'src/locales/en.json': '{"hi":"hi"}\n',
      'package.json': '{"name":"svc"}\n',
      'package-lock.json': '{}\n',
      'node_modules/dep/index.js': 'module.exports = 1\n',
    })
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._packageAll(fns)

    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toEqual(
      expect.arrayContaining([
        'src/handler.js',
        'src/handler.js.map',
        'src/locales/en.json',
        'package.json',
        'package-lock.json',
        'node_modules/dep/index.js',
      ]),
    )
  })

  it('does not ship the pnpm workspace file copied in for the install', async () => {
    // `_preparePackageJson` copies `pnpm-workspace.yaml` into the build
    // directory so that the install puts node_modules there. It is the
    // install's scaffolding, and no earlier release packaged it.
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'export const hello = () => {}\n',
      'package.json': '{"name":"svc"}\n',
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'pnpm-workspace.yaml': 'packages: []\n',
    })
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._packageAll(fns)

    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toContain('pnpm-lock.yaml')
    expect(names).not.toContain('pnpm-workspace.yaml')
  })

  it('ships the pnpm workspace file when a positive pattern names it', async () => {
    // Package-manager internals are default exclusions, not a hard rule:
    // like every other default exclusion a positive pattern gets the last
    // word, on the service-level path as much as the per-function one.
    const { serviceDir } = seedBuildDir(
      {
        'src/handler.js': 'export const hello = () => {}\n',
        'package.json': '{"name":"svc"}\n',
        'pnpm-workspace.yaml': 'packages: []\n',
      },
      { 'pnpm-workspace.yaml': 'packages: []\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['pnpm-workspace.yaml']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(centralDirectoryNames(serviceArtifact(serviceDir))).toContain(
      'pnpm-workspace.yaml',
    )
  })

  it('re-includes only the pattern-claimed files under an excluded root, not the install residue beside them', async () => {
    // `.yarn/cache` is what a Yarn Berry install leaves in the build directory;
    // `.yarn/releases/yarn.cjs` is a file the service deliberately ships. The
    // pattern re-includes the latter and nothing else under `.yarn`.
    const { serviceDir } = seedBuildDir(
      {
        'src/handler.js': 'export const hello = () => {}\n',
        'package.json': '{"name":"svc"}\n',
        '.yarn/cache/dep.zip': 'PK\n',
      },
      { '.yarn/releases/yarn.cjs': 'module.exports = 1\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['.yarn/releases/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toContain('.yarn/releases/yarn.cjs')
    expect(names).not.toContain('.yarn/cache/dep.zip')
  })

  it('ships an asset an esbuild-package plugin emitted, after a real build', async () => {
    // The regression in full: a real bundling build, then a plugin dropping an
    // asset next to the bundle from the `esbuild-package` hook. The handpicked
    // file list never looked at it.
    const { serviceDir } = makeTsServiceDir()
    const buildDir = path.join(serviceDir, '.serverless', 'build')
    const realFns = { hello: { handler: 'src/handler.hello' } }
    const serverless = makeServerless(serviceDir, realFns, { bundle: true })
    serverless.pluginManager = {
      spawn: async () => {
        writeFiles(buildDir, { 'src/locales/en.json': '{"hi":"hi"}\n' })
      },
    }
    const plugin = new Esbuild(serverless, {})

    await plugin._build()
    await plugin._package()

    // The build really did record where it wrote the handler, so the post-zip
    // assertion ran against real bookkeeping rather than a seeded map.
    expect(plugin.builtArtifacts.get('hello').outfile).toBe('src/handler.js')
    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toContain('src/handler.js')
    expect(names).toContain('src/locales/en.json')
  })

  it('excludes build metadata and never double-adds node_modules', async () => {
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'meta.json': '{}\n',
      'meta.tscjs.json': '{}\n',
      '.pnp.cjs': 'pnp\n',
      '.pnp.loader.mjs': 'pnp\n',
      '.yarn/cache/dep.zip': 'zip\n',
      'node_modules/dep/index.js': 'module.exports = 1\n',
    })
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._packageAll(fns)

    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names.filter((n) => n.startsWith('meta.'))).toEqual([])
    expect(names).not.toContain('.pnp.cjs')
    expect(names).not.toContain('.pnp.loader.mjs')
    expect(names.filter((n) => n.startsWith('.yarn'))).toEqual([])
    expect(names.filter((n) => n === 'node_modules/dep/index.js')).toHaveLength(
      1,
    )
  })

  it('keeps a meta.json the service itself owns', async () => {
    // `meta.*.json` at the build-dir root is esbuild's metafile. Under
    // `bundle: false` the project sweep also copies the service's own files in,
    // so the name is only build metadata when the service has no file of its
    // own claiming it.
    const { serviceDir } = seedBuildDir(
      { 'src/handler.js': 'x\n', 'meta.json': '{"mine":true}\n' },
      { 'meta.json': '{"mine":true}\n' },
    )
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._packageAll(fns)

    expect(centralDirectoryNames(serviceArtifact(serviceDir))).toContain(
      'meta.json',
    )
  })

  it('appends entries in byte-wise sorted order', async () => {
    // Two independent traps, because either one alone lets a broken sort pass.
    //
    // Volume: more files than archiver's internal stat queue runs at once (4).
    // An entry appended without its stats is re-queued when its stat resolves,
    // so the stored order becomes whatever order the filesystem answered in.
    //
    // Shape: `a.txt` vs `a/b.txt`. Byte-wise `.` (0x2e) sorts before `/`
    // (0x2f), so `a.txt` comes FIRST — but the walk is depth-first, so it can
    // only ever emit `a/b.txt` before or after the whole `a.txt` entry
    // depending on which way readdir happens to order `a` and `a.txt`. Whatever
    // that order is, one of the two pairs here contradicts it, so an
    // unsorted walk cannot accidentally match the expectation.
    const buildFiles = {
      'a.txt': 'a\n',
      'a/b.txt': 'b\n',
      'z.txt': 'z\n',
      'z/deep.txt': 'deep\n',
      'src/handler.js': 'x\n',
      'package.json': '{}\n',
    }
    for (let i = 0; i < 80; i += 1) {
      buildFiles[`assets/${String(i).padStart(3, '0')}.txt`] = `${i}\n`
    }
    const { serviceDir } = seedBuildDir(buildFiles)
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._packageAll(fns)

    // The expectation is computed from the known file set, not from the
    // archive's own output, so this compares the stored order against the
    // contract rather than against itself.
    const expected = Object.keys(buildFiles).sort()
    const names = centralDirectoryNames(serviceArtifact(serviceDir)).filter(
      (n) => !n.startsWith('node_modules'),
    )
    expect(names).toEqual(expected)
  })

  it('produces byte-identical zips across rebuilds with shuffled write order and differing file modes', async () => {
    // `check-for-changes` hashes the raw zip bytes, so a reordered walk or a
    // stray group-writable bit must not force a redeploy.
    const files = {
      'src/handler.js': 'export const hello = () => {}\n',
      'assets/a.txt': 'a\n',
      'assets/z.txt': 'z\n',
      'package.json': '{"name":"svc"}\n',
    }
    const build = async (order, mode) => {
      const { serviceDir, buildDir } = seedBuildDir({})
      for (const name of order) writeFiles(buildDir, { [name]: files[name] })
      fs.chmodSync(path.join(buildDir, 'assets', 'a.txt'), mode)
      const plugin = new Esbuild(makeServerless(serviceDir, fns), {})
      await plugin._packageAll(fns)
      return sha256(serviceArtifact(serviceDir))
    }

    const forward = await build(Object.keys(files), 0o644)
    const shuffled = await build([...Object.keys(files)].reverse(), 0o664)

    expect(shuffled).toBe(forward)
  })

  it('forces 0644 on regular files and 0755 on executable ones', async () => {
    const { serviceDir, buildDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'bin/tool.sh': '#!/bin/sh\n',
    })
    fs.chmodSync(path.join(buildDir, 'src', 'handler.js'), 0o664)
    fs.chmodSync(path.join(buildDir, 'bin', 'tool.sh'), 0o755)
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._packageAll(fns)

    const entries = await zipEntries(serviceArtifact(serviceDir))
    // `unixPermissions` carries the file-type bits (S_IFREG) alongside the
    // permission bits, so compare the permission bits only.
    const expected = process.platform === 'win32' ? 0o755 : 0o644
    expect(entries['src/handler.js'].unixPermissions & 0o777).toBe(expected)
    expect(entries['bin/tool.sh'].unixPermissions & 0o777).toBe(0o755)
  })

  it('forces node_modules entry modes too, directories included', async () => {
    // These entries come from the node_modules walk, which reads the mode off
    // the filesystem — so without normalization the same dependency tree
    // installed under a different umask hashes differently.
    const { serviceDir, buildDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'node_modules/dep/index.js': 'module.exports = 1\n',
    })
    fs.chmodSync(path.join(buildDir, 'node_modules', 'dep', 'index.js'), 0o664)
    fs.chmodSync(path.join(buildDir, 'node_modules', 'dep'), 0o775)
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._packageAll(fns)

    const entries = await zipEntries(serviceArtifact(serviceDir))
    const expected = process.platform === 'win32' ? 0o755 : 0o644
    expect(entries['node_modules/dep/index.js'].unixPermissions & 0o777).toBe(
      expected,
    )
    expect(entries['node_modules/dep/'].unixPermissions & 0o777).toBe(0o755)
  })

  it('writes a valid archive when nothing was built', async () => {
    // Every function's handler lives in a Lambda layer, so the build emitted
    // nothing. The zip must still be a zip.
    const { serviceDir } = seedBuildDir({})
    const plugin = new Esbuild(makeServerless(serviceDir, {}), {})

    await plugin._packageAll({})

    expect(centralDirectoryNames(serviceArtifact(serviceDir))).toEqual([])
  })

  it('lets service patterns slim node_modules', async () => {
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'node_modules/keep/index.js': 'keep\n',
      'node_modules/drop/index.js': 'drop\n',
    })
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!node_modules/drop/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toContain('node_modules/keep/index.js')
    expect(names.filter((n) => n.startsWith('node_modules/drop'))).toEqual([])
  })

  it('pins node_modules entry dates even behind a pattern filter', async () => {
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'node_modules/keep/index.js': 'keep\n',
    })
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!node_modules/drop/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    const entries = await zipEntries(serviceArtifact(serviceDir))
    expect(entries['node_modules/keep/index.js'].date.getFullYear()).toBe(1980)
  })

  it('fails loudly when a built handler is missing from the artifact', async () => {
    const { serviceDir } = seedBuildDir({ 'package.json': '{}\n' })
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})
    plugin.builtArtifacts = new Map([
      ['hello', { outfile: 'src/handler.js', mapfile: null }],
    ])

    await expect(plugin._packageAll(fns)).rejects.toMatchObject({
      name: 'ServerlessError',
      code: 'ESBUILD_HANDLER_MISSING_FROM_ARTIFACT',
    })
  })

  it('exempts layer-provided functions from the handler assertion', async () => {
    // `_assertAllHandlersBuilt` already warned about these and let the build
    // through; they have no outfile, so there is nothing to assert.
    const { serviceDir } = seedBuildDir({ 'src/handler.js': 'x\n' })
    const withWrapper = {
      hello: { handler: 'src/handler.hello' },
      wrapped: { handler: '/opt/nodejs/wrapper.handler' },
    }
    const plugin = new Esbuild(makeServerless(serviceDir, withWrapper), {})
    plugin.builtArtifacts = new Map([
      ['hello', { outfile: 'src/handler.js', mapfile: null }],
    ])

    await expect(plugin._packageAll(withWrapper)).resolves.toBeUndefined()
  })
})

/**
 * The zip is the only thing that reaches Lambda, so the shapes that decide what
 * a non-bundled artifact must carry are pinned against a real build followed by
 * real packaging, not against a seeded build directory.
 */
describe('_packageAll after a real non-bundled build', () => {
  jest.setTimeout(30_000)

  it('ships the nested package.json that classes the handler', async () => {
    // `src/handler.js` was emitted as ESM because `src/package.json` says
    // `"type": "module"`. Node repeats that lookup inside Lambda, so dropping
    // the nested package.json from the artifact turns the handler into a
    // CommonJS file full of `import` statements.
    const serviceDir = makeTempDir()
    writeFiles(serviceDir, {
      'package.json': '{"name":"svc"}',
      'src/package.json': '{"type":"module"}',
      'src/handler.ts':
        "import { helper } from './util.js'\n" +
        'export const hello = async () => ({ body: helper() })\n',
      'src/util.js': "export const helper = () => 'helped'\n",
    })
    const fns = { hello: { handler: 'src/handler.hello' } }
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await plugin._build()
    await plugin._packageAll(fns)

    expect(centralDirectoryNames(serviceArtifact(serviceDir))).toEqual([
      'package.json',
      'src/handler.js',
      'src/handler.js.map',
      'src/package.json',
      'src/util.js',
    ])
  })

  it('ships only the precompiled tree when patterns drop the sources', async () => {
    // The `tsc`-then-deploy shape: the handler names the compiled output in
    // `dist`, and `!src/**` is what keeps the TypeScript it came from out of
    // the artifact instead of shipping the same code twice.
    const serviceDir = makeTempDir()
    writeFiles(serviceDir, {
      'package.json': '{"name":"svc"}',
      'tsconfig.json': '{"include":["src"]}',
      'src/handler.ts': 'export const hello = async () => ({})\n',
      'src/util.ts': 'export const helper = () => 1\n',
      'dist/handler.js': 'exports.hello = async () => ({})\n',
      'dist/util.js': 'exports.helper = () => 1\n',
    })
    const fns = { hello: { handler: 'dist/handler.hello' } }
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!src/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._build()
    await plugin._packageAll(fns)

    expect(plugin.builtArtifacts.get('hello').outfile).toBe('dist/handler.js')
    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toContain('dist/handler.js')
    expect(names.filter((name) => name.startsWith('src/'))).toEqual([])
  })
})

describe('_package individually', () => {
  jest.setTimeout(30_000)

  function makeIndividualPlugin(serviceDir, fns, bundle) {
    const serverless = makeServerless(serviceDir, fns, { bundle })
    serverless.service.package.individually = true
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => fns
    plugin._buildProperties = async () => ({ bundle })
    return plugin
  }

  it('bundle:true — own handler stays, sibling outfiles are excluded, shared assets stay', async () => {
    const { serviceDir } = seedBuildDir({
      'src/a.js': 'a\n',
      'src/a.js.map': '{}\n',
      'src/b.js': 'b\n',
      'src/b.js.map': '{}\n',
      'shared/asset.txt': 'shared\n',
      'package.json': '{}\n',
    })
    const fns = {
      a: { handler: 'src/a.handler' },
      b: { handler: 'src/b.handler' },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, true)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: 'src/a.js.map' }],
      ['b', { outfile: 'src/b.js', mapfile: 'src/b.js.map' }],
    ])

    await plugin._package()

    const names = centralDirectoryNames(functionArtifact(serviceDir, 'a'))
    expect(names).toEqual(
      expect.arrayContaining([
        'src/a.js',
        'src/a.js.map',
        'shared/asset.txt',
        'package.json',
      ]),
    )
    expect(names).not.toContain('src/b.js')
    expect(names).not.toContain('src/b.js.map')
  })

  it('bundle:true — a function-level negation cannot drop the generated package.json or lockfile', async () => {
    // `!**/*.json` is a classic slimming idiom. Every earlier release built the
    // per-function archive from a handpicked list that always carried the
    // manifest; for a `"type": "module"` service emitting `.js`, that manifest
    // is the only thing telling Lambda to load the handler as ESM, so losing it
    // deploys a function that fails at initialization with no build-time
    // diagnostic. Project files the negation matches are still dropped.
    const { serviceDir } = seedBuildDir({
      'src/a.js': 'export const handler = () => {}\n',
      'src/a.js.map': '{}\n',
      'src/fixture.json': '{}\n',
      'package.json': '{"type":"module"}\n',
      'package-lock.json': '{}\n',
    })
    const fns = {
      a: { handler: 'src/a.handler', package: { patterns: ['!**/*.json'] } },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, true)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: 'src/a.js.map' }],
    ])

    await plugin._package()

    const names = centralDirectoryNames(functionArtifact(serviceDir, 'a'))
    expect(names).toContain('package.json')
    expect(names).toContain('package-lock.json')
    expect(names).toContain('src/a.js')
    expect(names).not.toContain('src/fixture.json')
  })

  it('bundle:true — functions sharing one handler file both keep it', async () => {
    const { serviceDir } = seedBuildDir({ 'src/api.js': 'api\n' })
    const fns = {
      a: { handler: 'src/api.one' },
      b: { handler: 'src/api.two' },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, true)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/api.js', mapfile: null }],
      ['b', { outfile: 'src/api.js', mapfile: null }],
    ])

    await plugin._package()

    expect(centralDirectoryNames(functionArtifact(serviceDir, 'a'))).toContain(
      'src/api.js',
    )
    expect(centralDirectoryNames(functionArtifact(serviceDir, 'b'))).toContain(
      'src/api.js',
    )
  })

  it('bundle:false — whole tree in every zip, per-function negations narrow', async () => {
    const { serviceDir } = seedBuildDir({
      'src/a.js': 'a\n',
      'src/b.js': 'b\n',
      'src/b-only/x.js': 'x\n',
    })
    const fns = {
      a: {
        handler: 'src/a.handler',
        package: { patterns: ['!src/b-only/**'] },
      },
      b: { handler: 'src/b.handler' },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, false)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
      ['b', { outfile: 'src/b.js', mapfile: null }],
    ])

    await plugin._package()

    const aNames = centralDirectoryNames(functionArtifact(serviceDir, 'a'))
    const bNames = centralDirectoryNames(functionArtifact(serviceDir, 'b'))
    // Nothing is excluded for a non-bundled build: every function needs the
    // whole tree because its imports are resolved at runtime.
    expect(aNames).toContain('src/b.js')
    expect(aNames).not.toContain('src/b-only/x.js')
    expect(bNames).toContain('src/b-only/x.js')
  })

  it('adds a function-level pattern file to that function only', async () => {
    const { serviceDir } = seedBuildDir(
      { 'src/a.js': 'a\n', 'src/b.js': 'b\n' },
      { 'config/a.json': '{"fn":"a"}\n' },
    )
    const fns = {
      a: { handler: 'src/a.handler', package: { patterns: ['config/a.json'] } },
      b: { handler: 'src/b.handler' },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, false)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
      ['b', { outfile: 'src/b.js', mapfile: null }],
    ])

    await plugin._package()

    expect(centralDirectoryNames(functionArtifact(serviceDir, 'a'))).toContain(
      'config/a.json',
    )
    expect(
      centralDirectoryNames(functionArtifact(serviceDir, 'b')),
    ).not.toContain('config/a.json')
  })

  it('lets a function-level pattern replace a build-dir file exactly once', async () => {
    const { serviceDir } = seedBuildDir(
      { 'src/a.js': 'a\n', 'config/app.json': '{"from":"build"}\n' },
      { 'config/app.json': '{"from":"patterns"}\n' },
    )
    const fns = {
      a: {
        handler: 'src/a.handler',
        package: { patterns: ['config/app.json'] },
      },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, false)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
    ])

    await plugin._package()

    const artifact = functionArtifact(serviceDir, 'a')
    expect(
      centralDirectoryNames(artifact).filter((n) => n === 'config/app.json'),
    ).toHaveLength(1)
    const entries = await zipEntries(artifact)
    await expect(entries['config/app.json'].async('string')).resolves.toContain(
      'patterns',
    )
  })

  it('bundle:false — a .cjs handler ships under its own name, after a real build', async () => {
    // The handler keeps its extension all the way through: `builtArtifacts`
    // records `src/a.cjs`, packaging looks for `src/a.cjs`, and the archive
    // assertion is satisfied by the file that is actually there. A packaging
    // path that assumed `.js` would fail this function's zip outright.
    const serviceDir = makeTempDir()
    writeFiles(serviceDir, {
      'package.json': '{"name":"svc","type":"module"}',
      'src/a.cjs': 'exports.handler = async () => ({ statusCode: 200 })\n',
      'src/b.ts': 'export const handler = async () => ({})\n',
    })
    const fns = {
      a: { handler: 'src/a.handler' },
      b: { handler: 'src/b.handler' },
    }
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.individually = true
    const plugin = new Esbuild(serverless, {})

    await plugin._build()
    await plugin._package()

    expect(plugin.builtArtifacts.get('a').outfile).toBe('src/a.cjs')
    const names = centralDirectoryNames(functionArtifact(serviceDir, 'a'))
    expect(names).toContain('src/a.cjs')
    expect(names).not.toContain('src/a.js')
    // Non-bundled: the sibling function's output is part of the project every
    // zip carries, so it is present here too.
    expect(names).toContain('src/b.js')
  })

  it('gives a layer-provided function a valid zip of its own', async () => {
    // Its handler resolves inside the Lambda at runtime, so the build recorded
    // no artifact for it and the handler assertion has nothing to check. It
    // still gets packaged: the layer wrapper needs the project to call into.
    const { serviceDir } = seedBuildDir({
      'src/a.js': 'a\n',
      'package.json': '{}\n',
    })
    const fns = {
      a: { handler: 'src/a.handler' },
      wrapped: {
        handler: '/opt/nodejs/node_modules/wrapper/handler.wrapped',
        layers: ['arn:aws:lambda:us-east-1:1234567890:layer:wrapper:1'],
      },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, false)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
    ])

    await expect(plugin._package()).resolves.toBeUndefined()

    const names = centralDirectoryNames(functionArtifact(serviceDir, 'wrapped'))
    expect(names).toEqual(['package.json', 'src/a.js'])
    expect(fns.wrapped.package.artifact).toBe(
      functionArtifact(serviceDir, 'wrapped'),
    )
  })

  it('packages only the function `deploy function` named', async () => {
    // `deploy function` narrows `functions()` to one alias. Packaging follows
    // that subset -- one zip, for that function -- while the zip itself still
    // holds the whole non-bundled project, because the deployed function
    // resolves its imports out of that tree at runtime.
    const { serviceDir } = seedBuildDir({
      'src/a.js': 'a\n',
      'src/b.js': 'b\n',
      'package.json': '{}\n',
    })
    const fns = {
      a: { handler: 'src/a.handler' },
      b: { handler: 'src/b.handler' },
    }
    const serverless = makeServerless(serviceDir, fns, { bundle: false })
    serverless.service.package.individually = true
    // No `plugin.functions` override: the subset has to come from the real
    // `functions()` path, which is where the `--function` option is read.
    const plugin = new Esbuild(serverless, { function: 'a' })
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
      ['b', { outfile: 'src/b.js', mapfile: null }],
    ])

    await plugin._package()

    expect(fs.existsSync(functionArtifact(serviceDir, 'a'))).toBe(true)
    expect(fs.existsSync(functionArtifact(serviceDir, 'b'))).toBe(false)
    expect(fns.b.package).toBeUndefined()
    expect(centralDirectoryNames(functionArtifact(serviceDir, 'a'))).toEqual([
      'package.json',
      'src/a.js',
      'src/b.js',
    ])
  })

  it('throws when a handler outfile is missing from its archive', async () => {
    const { serviceDir } = seedBuildDir({ 'src/b.js': 'b\n' })
    const fns = { a: { handler: 'src/a.handler' } }
    const plugin = makeIndividualPlugin(serviceDir, fns, true)
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
    ])

    await expect(plugin._package()).rejects.toMatchObject({
      name: 'ServerlessError',
      code: 'ESBUILD_HANDLER_MISSING_FROM_ARTIFACT',
    })
  })

  it('merges service and function patterns for the node_modules filter', async () => {
    const { serviceDir } = seedBuildDir({
      'src/a.js': 'a\n',
      'node_modules/keep/index.js': 'keep\n',
      'node_modules/svc-drop/index.js': 'drop\n',
      'node_modules/fn-drop/index.js': 'drop\n',
    })
    const fns = {
      a: {
        handler: 'src/a.handler',
        package: { patterns: ['!node_modules/fn-drop/**'] },
      },
    }
    const plugin = makeIndividualPlugin(serviceDir, fns, true)
    plugin.serverless.service.package.patterns = ['!node_modules/svc-drop/**']
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
    ])

    await plugin._package()

    const names = centralDirectoryNames(functionArtifact(serviceDir, 'a'))
    expect(names).toContain('node_modules/keep/index.js')
    expect(names.filter((n) => n.includes('-drop/'))).toEqual([])
  })
})

describe('_copyPatternsIntoBuildDir', () => {
  jest.setTimeout(30_000)

  let warnSpy

  beforeEach(() => {
    warnSpy = jest.spyOn(esbuildLogger, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  const fns = { hello: { handler: 'src/handler.hello' } }

  it('overwrites emitted outputs and warns once per run about content changes', async () => {
    const { serviceDir, buildDir } = seedBuildDir(
      {
        'src/handler.js': 'built\n',
        'config/one.json': '{"from":"build"}\n',
        'config/two.json': '{"from":"build"}\n',
        'config/same.json': '{"same":true}\n',
      },
      {
        'config/one.json': '{"from":"patterns"}\n',
        'config/two.json': '{"from":"patterns"}\n',
        'config/same.json': '{"same":true}\n',
      },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['config/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(
      fs.readFileSync(path.join(buildDir, 'config', 'one.json'), 'utf8'),
    ).toContain('patterns')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('2 file')
  })

  it('stays silent when the pattern copy matches what was emitted', async () => {
    const { serviceDir } = seedBuildDir(
      { 'src/handler.js': 'built\n', 'config/same.json': '{"same":true}\n' },
      { 'config/same.json': '{"same":true}\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['config/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('ships the copied file and keeps the build dir in sync with it', async () => {
    // Dev mode and `invoke local` run out of the build directory, so the file
    // that deploys and the file those commands load have to be the same one.
    const { serviceDir, buildDir } = seedBuildDir(
      { 'src/handler.js': 'built\n' },
      { 'assets/logo.txt': 'logo\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['assets/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    const entries = await zipEntries(serviceArtifact(serviceDir))
    await expect(entries['assets/logo.txt'].async('string')).resolves.toBe(
      fs.readFileSync(path.join(buildDir, 'assets', 'logo.txt'), 'utf8'),
    )
  })

  it('honors a later negation retracting an earlier positive', async () => {
    const { serviceDir, buildDir } = seedBuildDir(
      { 'src/handler.js': 'built\n' },
      { 'assets/keep.txt': 'keep\n', 'assets/secret.txt': 'secret\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['assets/**', '!assets/secret.txt']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(fs.existsSync(path.join(buildDir, 'assets', 'keep.txt'))).toBe(true)
    expect(fs.existsSync(path.join(buildDir, 'assets', 'secret.txt'))).toBe(
      false,
    )
  })

  it('never copies the build directory into itself', async () => {
    const { serviceDir, buildDir } = seedBuildDir(
      { 'src/handler.js': 'built\n' },
      { 'src/handler.ts': 'source\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(fs.existsSync(path.join(buildDir, '.serverless'))).toBe(false)
    expect(centralDirectoryNames(serviceArtifact(serviceDir))).toContain(
      'src/handler.ts',
    )
  })
})

/**
 * A pattern that reaches above the service directory (`../shared/**`) has no
 * parent directory to land in inside an archive. archiver strips the leading
 * `../` from every entry name it is handed, so classic packaging and every
 * esbuild release since patterns were supported shipped such files at the path
 * that remains — a nested handler reading `../shared/x.json` found it at
 * runtime. The build-directory copy has to place the file the same way, or a
 * working monorepo setup stops working after a green deploy.
 */
describe('package.patterns reaching above the service directory', () => {
  jest.setTimeout(30_000)

  let warnSpy
  let debugSpy

  beforeEach(() => {
    warnSpy = jest.spyOn(esbuildLogger, 'warning').mockImplementation(() => {})
    debugSpy = jest.spyOn(esbuildLogger, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    debugSpy.mockRestore()
  })

  // The service sits one level below the temp root so that `..` from it stays
  // inside the directory the test owns.
  function seedNestedService(buildFiles, siblingFiles) {
    const root = makeTempDir()
    const serviceDir = path.join(root, 'svc')
    const buildDir = path.join(serviceDir, '.serverless', 'build')
    fs.mkdirSync(buildDir, { recursive: true })
    writeFiles(buildDir, buildFiles)
    writeFiles(root, siblingFiles)
    return { serviceDir, buildDir }
  }

  const fns = { hello: { handler: 'src/handler.hello' } }

  it('packages the file at its path with the leading ../ removed, in the build dir and the zip', async () => {
    const { serviceDir, buildDir } = seedNestedService(
      { 'src/handler.js': 'built\n' },
      { 'shared/x.json': '{"shared":true}\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['../shared/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(
      fs.readFileSync(path.join(buildDir, 'shared', 'x.json'), 'utf8'),
    ).toBe('{"shared":true}\n')
    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toContain('shared/x.json')
    expect(names.some((name) => name.includes('..'))).toBe(false)
    const entries = await zipEntries(serviceArtifact(serviceDir))
    await expect(entries['shared/x.json'].async('string')).resolves.toBe(
      '{"shared":true}\n',
    )
    expect(warnSpy).not.toHaveBeenCalled()
    expect(
      debugSpy.mock.calls.some((call) =>
        /\.\.\/shared\/x\.json -> shared\/x\.json/.test(call[0]),
      ),
    ).toBe(true)
  })

  it('treats a ../node_modules match as an installed-tree entry: shipped, never copied over the install', async () => {
    const { serviceDir, buildDir } = seedNestedService(
      {
        'src/handler.js': 'built\n',
        'node_modules/dep/index.js': 'installed\n',
      },
      { 'node_modules/hoisted/index.js': 'hoisted\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['../node_modules/hoisted/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(fs.existsSync(path.join(buildDir, 'node_modules', 'hoisted'))).toBe(
      false,
    )
    const entries = await zipEntries(serviceArtifact(serviceDir))
    await expect(
      entries['node_modules/hoisted/index.js'].async('string'),
    ).resolves.toBe('hoisted\n')
    expect(entries['node_modules/dep/index.js']).toBeDefined()
  })

  it('does the same for a function-level pattern under package.individually', async () => {
    const { serviceDir } = seedNestedService(
      { 'src/a.js': 'a\n' },
      { 'shared/x.json': '{"shared":true}\n' },
    )
    const individually = {
      a: { handler: 'src/a.handler', package: { patterns: ['../shared/**'] } },
    }
    const serverless = makeServerless(serviceDir, individually, {
      bundle: false,
    })
    serverless.service.package.individually = true
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => individually
    plugin._buildProperties = async () => ({ bundle: false })
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
    ])

    await plugin._package()

    const names = centralDirectoryNames(functionArtifact(serviceDir, 'a'))
    expect(names).toContain('shared/x.json')
    expect(names.some((name) => name.includes('..'))).toBe(false)
    // archiver would sanitize the name on its own at write time; the plugin
    // has to know the real entry name before that, because the collision dedup
    // and the handler assertion compare against it.
    const { entries } = await plugin._patternEntries(['../shared/**'])
    expect(entries.map((entry) => entry.zipPath)).toEqual(['shared/x.json'])
  })
})

/**
 * `package.patterns` negations reach the installed dependencies as well as the
 * source tree, and a classic slimming idiom aimed at the latter (`!**` plus a
 * re-include) empties the former. The artifact still carries a package.json
 * declaring those dependencies, so the function deploys clean and then throws
 * MODULE_NOT_FOUND on its first invocation with nothing in the deploy output
 * pointing at the cause.
 */
/**
 * The "Excluded N entries ... via package.patterns" line is assembled from
 * three independently-sourced terms: what the node_modules walk filtered, what
 * a negation retracted from the additive includes, and what a function-level
 * negation retracted from the build-directory sweep. Each term is pinned with
 * an EXACT count on the path that produces it, so dropping one from the sum
 * cannot pass unnoticed.
 */
describe('package.patterns exclusion count', () => {
  jest.setTimeout(30_000)

  let infoSpy

  beforeEach(() => {
    infoSpy = jest.spyOn(esbuildLogger, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
  })

  const patternsInfo = () =>
    infoSpy.mock.calls
      .map((call) => call[0])
      .filter((message) => message.includes('package.patterns'))

  const fns = { hello: { handler: 'src/handler.hello' } }

  it('_packageAll counts a service-level include the patterns retracted', async () => {
    // Only term in play: the service additive includes. node_modules is
    // untouched by these patterns, and _packageAll never filters the build
    // directory, so the count is exactly the one retracted include.
    const { serviceDir } = seedBuildDir(
      { 'src/handler.js': 'x\n', 'node_modules/dep/index.js': 'dep\n' },
      { 'assets/logo.png': 'png\n', 'assets/secret.txt': 'ssh\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['assets/**', '!assets/secret.txt']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(patternsInfo()).toEqual([
      'Excluded 1 entries from svc.zip via package.patterns',
    ])
    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(names).toContain('assets/logo.png')
    expect(names).not.toContain('assets/secret.txt')
  })

  it('_package counts a function-level include the patterns retracted', async () => {
    // Only term in play: this function's own additive includes. The service
    // list is empty, and nothing in the build directory matches the negation.
    const { serviceDir } = seedBuildDir(
      { 'src/handler.js': 'x\n', 'node_modules/dep/index.js': 'dep\n' },
      { 'assets/logo.png': 'png\n', 'assets/secret.txt': 'ssh\n' },
    )
    const individualFns = {
      hello: {
        handler: 'src/handler.hello',
        package: { patterns: ['assets/**', '!assets/secret.txt'] },
      },
    }
    const serverless = makeServerless(serviceDir, individualFns)
    serverless.service.package.individually = true
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => individualFns
    plugin._buildProperties = async () => ({ bundle: false })

    await plugin._package()

    expect(patternsInfo()).toEqual([
      'Excluded 1 entries from svc-hello.zip via package.patterns',
    ])
    const names = centralDirectoryNames(functionArtifact(serviceDir, 'hello'))
    expect(names).toContain('assets/logo.png')
    expect(names).not.toContain('assets/secret.txt')
  })

  it('_package counts a build-directory entry a function negation retracted', async () => {
    // Only term in play: the build-directory sweep. The service-level include
    // puts the file in the build directory unretracted; the function-level
    // negation is what removes it from this one artifact.
    const { serviceDir } = seedBuildDir(
      { 'src/handler.js': 'x\n', 'node_modules/dep/index.js': 'dep\n' },
      { 'assets/logo.png': 'png\n', 'assets/secret.txt': 'ssh\n' },
    )
    const individualFns = {
      hello: {
        handler: 'src/handler.hello',
        package: { patterns: ['!assets/secret.txt'] },
      },
    }
    const serverless = makeServerless(serviceDir, individualFns)
    serverless.service.package.individually = true
    serverless.service.package.patterns = ['assets/**']
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => individualFns
    plugin._buildProperties = async () => ({ bundle: false })

    await plugin._package()

    expect(patternsInfo()).toEqual([
      'Excluded 1 entries from svc-hello.zip via package.patterns',
    ])
    const names = centralDirectoryNames(functionArtifact(serviceDir, 'hello'))
    expect(names).toContain('assets/logo.png')
    expect(names).not.toContain('assets/secret.txt')
  })
})

/**
 * A positive `package.patterns` entry naming `node_modules/...` selects files
 * from the SERVICE tree — a vendored dependency, a patched copy, a data file
 * re-included after a broad negation. None of it is declared in package.json,
 * so the install into the build directory never produces it, and dropping it
 * ships an artifact that throws MODULE_NOT_FOUND on the first invocation with
 * nothing in the deploy output pointing at the cause.
 *
 * These matches cannot be COPIED into the build directory — writing the
 * service's tree over the install would corrupt it, and `_resetBuildDir`
 * preserves node_modules into every later deploy, so the damage would persist.
 * They are appended to the archive straight from the service directory
 * instead, and they beat the installed file at the same archive path.
 */
describe('package.patterns naming the installed dependency tree', () => {
  jest.setTimeout(30_000)

  const fns = { hello: { handler: 'src/handler.hello' } }

  const vendoredFixture = () =>
    seedBuildDir(
      {
        'src/handler.js': 'x\n',
        'package.json': '{"name":"svc"}\n',
        'node_modules/installed/index.js': 'installed\n',
      },
      {
        'node_modules/vendored-lib/index.js': 'vendored\n',
        'node_modules/vendored-lib/package.json': '{"name":"vendored-lib"}\n',
      },
    )

  it.each([
    ['bundle: true', true],
    ['bundle: false', false],
  ])(
    'ships a vendored dependency the install never produced (%s)',
    async (_label, bundle) => {
      const { serviceDir } = vendoredFixture()
      const serverless = makeServerless(serviceDir, fns, { bundle })
      serverless.service.package.patterns = ['node_modules/vendored-lib/**']
      const plugin = new Esbuild(serverless, {})

      await plugin._packageAll(fns)

      const entries = await zipEntries(serviceArtifact(serviceDir))
      await expect(
        entries['node_modules/vendored-lib/index.js'].async('string'),
      ).resolves.toBe('vendored\n')
      expect(entries['node_modules/vendored-lib/package.json']).toBeDefined()
      // The installed tree is still there alongside it.
      expect(entries['node_modules/installed/index.js']).toBeDefined()
    },
  )

  it('ships a vendored dependency named by a function-level pattern', async () => {
    const { serviceDir } = vendoredFixture()
    const individualFns = {
      hello: {
        handler: 'src/handler.hello',
        package: { patterns: ['node_modules/vendored-lib/**'] },
      },
    }
    const serverless = makeServerless(serviceDir, individualFns)
    serverless.service.package.individually = true
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => individualFns
    plugin._buildProperties = async () => ({ bundle: false })

    await plugin._package()

    const entries = await zipEntries(functionArtifact(serviceDir, 'hello'))
    await expect(
      entries['node_modules/vendored-lib/index.js'].async('string'),
    ).resolves.toBe('vendored\n')
  })

  it('lets a pattern file beat the installed file at the same archive path', async () => {
    // The re-include idiom over a patched dependency. Both trees hold the same
    // archive path with different bytes; the pattern is what the user asked
    // for, so it is what ships — once, not twice.
    const { serviceDir } = seedBuildDir(
      {
        'src/handler.js': 'x\n',
        'node_modules/dep/index.js': 'installed\n',
        'node_modules/dep/other.js': 'installed-other\n',
      },
      { 'node_modules/dep/index.js': 'patched\n' },
    )
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['node_modules/dep/index.js']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    expect(
      names.filter((name) => name === 'node_modules/dep/index.js'),
    ).toHaveLength(1)
    const entries = await zipEntries(serviceArtifact(serviceDir))
    await expect(
      entries['node_modules/dep/index.js'].async('string'),
    ).resolves.toBe('patched\n')
    // Only the claimed path is replaced; the rest of the install is untouched.
    await expect(
      entries['node_modules/dep/other.js'].async('string'),
    ).resolves.toBe('installed-other\n')
  })

  it('never writes the pattern match into the build directory', async () => {
    const { serviceDir, buildDir } = vendoredFixture()
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['node_modules/vendored-lib/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    // The install in the build directory is exactly what it was: overwriting it
    // would survive into every later deploy through _resetBuildDir.
    expect(
      fs.existsSync(path.join(buildDir, 'node_modules', 'vendored-lib')),
    ).toBe(false)
    expect(fs.readdirSync(path.join(buildDir, 'node_modules')).sort()).toEqual([
      'installed',
    ])
    // ...while the artifact ships it anyway.
    expect(centralDirectoryNames(serviceArtifact(serviceDir))).toContain(
      'node_modules/vendored-lib/index.js',
    )
  })

  it('does not claim node_modules was emptied when patterns re-supplied it', async () => {
    // `patterns: ['**']` over a real install claims every installed file, so
    // every one of them is skipped in the walk in favour of the pattern copy.
    // Counting those skips as "not kept" made a fully-supplied node_modules
    // look emptied, and the `.md` negation supplied the non-zero exclusion the
    // warning also needs — so a working configuration that ships every
    // dependency got told its patterns had stripped them. No released version
    // warns here.
    const { serviceDir } = seedBuildDir(
      {
        'src/handler.js': 'x\n',
        'package.json': '{"name":"svc","dependencies":{"ms":"^2.1.3"}}\n',
        'node_modules/ms/index.js': 'module.exports = 1\n',
        'node_modules/ms/package.json': '{"name":"ms"}\n',
        'node_modules/ms/readme.md': '# ms\n',
      },
      {
        'src/handler.js': 'x\n',
        'node_modules/ms/index.js': 'module.exports = 1\n',
        'node_modules/ms/package.json': '{"name":"ms"}\n',
        'node_modules/ms/readme.md': '# ms\n',
      },
    )
    const serverless = makeServerless(serviceDir, fns, { packages: 'external' })
    serverless.service.package.patterns = ['**', '!node_modules/**/*.md']
    const plugin = new Esbuild(serverless, {})
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})

    try {
      await plugin._packageAll(fns)

      // Guard the premise: the dependency really did ship, and the negation
      // really did exclude something from the walk.
      const names = centralDirectoryNames(serviceArtifact(serviceDir))
      expect(names).toContain('node_modules/ms/index.js')
      expect(names).toContain('node_modules/ms/package.json')
      expect(names).not.toContain('node_modules/ms/readme.md')
      expect(
        warnSpy.mock.calls
          .map((call) => call[0])
          .filter((message) => message.includes('node_modules')),
      ).toEqual([])
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('still warns when the patterns really did empty node_modules', async () => {
    // Same shape minus the pattern re-supply: nothing claims the installed
    // files, so they are genuinely excluded and the artifact ships no
    // dependency at all.
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{"name":"svc","dependencies":{"ms":"^2.1.3"}}\n',
      'node_modules/ms/index.js': 'module.exports = 1\n',
    })
    const serverless = makeServerless(serviceDir, fns, { packages: 'external' })
    serverless.service.package.patterns = ['!node_modules/**']
    const plugin = new Esbuild(serverless, {})
    const warnSpy = jest
      .spyOn(esbuildLogger, 'warning')
      .mockImplementation(() => {})

    try {
      await plugin._packageAll(fns)

      expect(
        centralDirectoryNames(serviceArtifact(serviceDir)).filter((name) =>
          name.startsWith('node_modules/'),
        ),
      ).toEqual([])
      expect(
        warnSpy.mock.calls
          .map((call) => call[0])
          .filter((message) => message.includes('node_modules')),
      ).toHaveLength(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('stays byte-identical across repeated runs', async () => {
    // The pattern-supplied entries are sorted in with the build-directory sweep
    // rather than appended wherever the copy finished, so the artifact hash
    // check-for-changes reads cannot drift between runs.
    const hash = async () => {
      const { serviceDir } = vendoredFixture()
      const serverless = makeServerless(serviceDir, fns)
      serverless.service.package.patterns = [
        'node_modules/vendored-lib/**',
        '!node_modules/vendored-lib/package.json',
      ]
      const plugin = new Esbuild(serverless, {})
      await plugin._packageAll(fns)
      return sha256(serviceArtifact(serviceDir))
    }

    expect(await hash()).toBe(await hash())
  })
})

describe('node_modules emptied by patterns', () => {
  jest.setTimeout(30_000)

  let warnSpy

  beforeEach(() => {
    warnSpy = jest.spyOn(esbuildLogger, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  const fns = { hello: { handler: 'src/handler.hello' } }
  const withDependency = {
    'src/handler.js': 'x\n',
    'package.json': '{"name":"svc","dependencies":{"dep":"^1.0.0"}}\n',
    'node_modules/dep/index.js': 'module.exports = 1\n',
  }

  // The merged warning is emitted once per invocation and names neither the
  // pattern list nor the affected aliases (see `_reportPatternFiltering`), so
  // it is matched on the claim it makes rather than on those details.
  const emptiedWarning = () =>
    warnSpy.mock.calls.filter((call) =>
      /requires dependencies in the artifact/.test(call[0]),
    )

  it('warns when the patterns excluded every dependency file', async () => {
    const { serviceDir } = seedBuildDir(withDependency)
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!**', 'src/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(emptiedWarning()).toHaveLength(1)
    expect(emptiedWarning()[0][0]).toContain('node_modules')
  })

  it('stays silent when node_modules is legitimately empty', async () => {
    // Nothing was excluded — there was simply nothing installed.
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{"name":"svc","dependencies":{"dep":"^1.0.0"}}\n',
    })
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!**', 'src/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(emptiedWarning()).toHaveLength(0)
  })

  it('stays silent when the package.json declares no dependencies', async () => {
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{"name":"svc"}\n',
      'node_modules/.package-lock.json': '{}\n',
    })
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!**', 'src/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(emptiedWarning()).toHaveLength(0)
  })

  it('warns for bundle:true with externals, where no config-shape gate applied', async () => {
    // `external: ['ms']` under bundling keeps that one dependency out of the
    // bundle and installs it beside the handler, exactly like `packages:
    // external` does for all of them — but it is neither `packages: external`
    // nor a non-bundled build, so gating on the config shape left this
    // combination with no arm at all and a legacy `!node_modules/**` silently
    // shipped an artifact without its externals. The generated manifest says
    // what the artifact needs, whichever setting produced it.
    const { serviceDir } = seedBuildDir(withDependency)
    const serverless = makeServerless(serviceDir, fns, {
      bundle: true,
      external: ['dep'],
    })
    serverless.service.package.patterns = ['!node_modules/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    // Guard the premise: the dependency really was stripped.
    expect(
      centralDirectoryNames(serviceArtifact(serviceDir)).filter((name) =>
        name.startsWith('node_modules/'),
      ),
    ).toEqual([])
    expect(emptiedWarning()).toHaveLength(1)
  })

  it('stays silent for a bundled service whose manifest declares nothing', async () => {
    // The modal service: everything inlined, so the generated manifest declares
    // no dependencies and an excluded node_modules costs the artifact nothing.
    // This is the false-positive guard for the widened gate — it must not start
    // warning here.
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{"name":"svc"}\n',
      'node_modules/leftover/index.js': 'module.exports = 1\n',
    })
    const serverless = makeServerless(serviceDir, fns, { bundle: true })
    serverless.service.package.patterns = ['!node_modules/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    // Premise again: something really was excluded from the walk.
    expect(
      centralDirectoryNames(serviceArtifact(serviceDir)).filter((name) =>
        name.startsWith('node_modules/'),
      ),
    ).toEqual([])
    expect(emptiedWarning()).toHaveLength(0)
  })

  it('stays silent when dependencies survive the filter', async () => {
    const { serviceDir } = seedBuildDir(withDependency)
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!node_modules/other/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(emptiedWarning()).toHaveLength(0)
  })

  it('warns once for the whole run when packaging individually', async () => {
    const { serviceDir } = seedBuildDir({
      'src/a.js': 'a\n',
      'src/b.js': 'b\n',
      'package.json': '{"name":"svc","dependencies":{"dep":"^1.0.0"}}\n',
      'node_modules/dep/index.js': 'module.exports = 1\n',
    })
    const individualFns = {
      a: { handler: 'src/a.handler' },
      b: { handler: 'src/b.handler' },
    }
    const serverless = makeServerless(serviceDir, individualFns, {
      bundle: false,
    })
    serverless.service.package.individually = true
    serverless.service.package.patterns = ['!**', 'src/**']
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => individualFns
    plugin._buildProperties = async () => ({ bundle: false })

    await plugin._package()

    expect(emptiedWarning()).toHaveLength(1)
  })
})

/**
 * The handler assertion is only worth having if it inspects the artifact that
 * exists on disk. Checking the list packaging MEANT to append would sail past
 * an entry archiver dropped, renamed while sanitizing, or never flushed.
 */
describe('_readArchiveEntryNames', () => {
  jest.setTimeout(30_000)

  const fns = { hello: { handler: 'src/handler.hello' } }

  it('catches a handler the archive lost even though packaging listed it', async () => {
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{}\n',
    })
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})
    plugin.builtArtifacts = new Map([
      ['hello', { outfile: 'src/handler.js', mapfile: null }],
    ])

    // The archive silently loses the handler while the intended entry list
    // still names it — what an archiver-side drop looks like from the outside.
    const writeArchive = plugin._writeArchive.bind(plugin)
    plugin._writeArchive = ({ zipPath, entries, patterns }) =>
      writeArchive({
        zipPath,
        entries: entries.filter((entry) => entry.zipPath !== 'src/handler.js'),
        patterns,
      })

    await expect(plugin._packageAll(fns)).rejects.toMatchObject({
      name: 'ServerlessError',
      code: 'ESBUILD_HANDLER_MISSING_FROM_ARTIFACT',
    })
  })

  it('reads a ZIP64 archive', async () => {
    // archiver switches to ZIP64 past 65535 entries, which a real node_modules
    // clears easily. Getting that wrong would not lose an artifact — it would
    // fail every large deploy with a bogus missing-handler error.
    const { serviceDir, buildDir } = seedBuildDir({ 'src/handler.js': 'x\n' })
    const zipPath = path.join(serviceDir, 'zip64.zip')
    const zip = new ZipArchive({ forceZip64: true })
    const output = fs.createWriteStream(zipPath)
    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      output.on('error', reject)
      zip.pipe(output)
      zip.file(path.join(buildDir, 'src', 'handler.js'), {
        name: 'src/handler.js',
      })
      zip.finalize().catch(reject)
    })
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._readArchiveEntryNames(zipPath)).resolves.toEqual(
      new Set(['src/handler.js']),
    )
  })

  it('returns null for something that is not an archive, and the assertion falls back', async () => {
    // A read that cannot answer must never be the thing that invents a missing
    // handler; the caller falls back to the list packaging appended.
    const { serviceDir } = seedBuildDir({ 'src/handler.js': 'x\n' })
    const notAZip = path.join(serviceDir, 'not-a-zip.bin')
    fs.writeFileSync(notAZip, 'definitely not a zip file')
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(plugin._readArchiveEntryNames(notAZip)).resolves.toBeNull()
    await expect(
      plugin._assertHandlersInArtifact(
        fns,
        new Set(['src/handler.js']),
        notAZip,
      ),
    ).resolves.toBeUndefined()
  })

  it('returns null for a file that does not exist', async () => {
    const { serviceDir } = seedBuildDir({})
    const plugin = new Esbuild(makeServerless(serviceDir, fns), {})

    await expect(
      plugin._readArchiveEntryNames(path.join(serviceDir, 'nope.zip')),
    ).resolves.toBeNull()
  })
})

/**
 * `_copyPatternsIntoBuildDir` runs on both packaging paths. On the
 * `package.individually` one it feeds every function's zip at once, because
 * they are all subsets of the one build directory it copies into.
 */
describe('_copyPatternsIntoBuildDir on the individually path', () => {
  jest.setTimeout(30_000)

  let warnSpy

  beforeEach(() => {
    warnSpy = jest.spyOn(esbuildLogger, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('supplies service-level pattern files to every function zip, warning once', async () => {
    const { serviceDir } = seedBuildDir(
      {
        'src/a.js': 'a\n',
        'src/b.js': 'b\n',
        'config/app.json': '{"from":"build"}\n',
      },
      {
        'assets/shared.txt': 'shared\n',
        'config/app.json': '{"from":"patterns"}\n',
      },
    )
    const fns = {
      a: { handler: 'src/a.handler' },
      b: { handler: 'src/b.handler' },
    }
    const serverless = makeServerless(serviceDir, fns, { bundle: false })
    serverless.service.package.individually = true
    serverless.service.package.patterns = ['assets/**', 'config/**']
    const plugin = new Esbuild(serverless, {})
    plugin.functions = async () => fns
    plugin._buildProperties = async () => ({ bundle: false })
    plugin.builtArtifacts = new Map([
      ['a', { outfile: 'src/a.js', mapfile: null }],
      ['b', { outfile: 'src/b.js', mapfile: null }],
    ])

    await plugin._package()

    for (const alias of ['a', 'b']) {
      const artifact = functionArtifact(serviceDir, alias)
      const names = centralDirectoryNames(artifact)
      expect(names).toContain('assets/shared.txt')
      const entries = await zipEntries(artifact)
      await expect(
        entries['config/app.json'].async('string'),
      ).resolves.toContain('patterns')
    }
    // The copy happens once per run, before any zip is written, so the
    // overwrite warning must not be repeated per function.
    const overwriteWarnings = warnSpy.mock.calls.filter((call) =>
      /replaced esbuild build outputs/.test(call[0]),
    )
    expect(overwriteWarnings).toHaveLength(1)
    expect(overwriteWarnings[0][0]).toContain('1 file')
  })
})

/**
 * The node_modules walk classifies entries by their lstat results, not by the
 * entry name: a directory entry's name carries no trailing slash at the point
 * the filter sees it. Calling every directory a file silently broke the
 * emptied-node_modules accounting — directory husks counted as payload, so an
 * artifact stripped of every dependency FILE still looked healthy.
 */
describe('node_modules directory entries are recognized as directories', () => {
  jest.setTimeout(30_000)

  let warnSpy

  beforeEach(() => {
    warnSpy = jest.spyOn(esbuildLogger, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  const fns = { hello: { handler: 'src/handler.hello' } }
  const emptiedWarning = () =>
    warnSpy.mock.calls.filter((call) =>
      /requires dependencies in the artifact/.test(call[0]),
    )

  it('warns when every dependency FILE is stripped and only directories remain', async () => {
    // The shape that slipped through: the negations match files by extension,
    // so every directory entry survives and an entry filter that counts
    // directories as payload sees a healthy `included` count.
    const { serviceDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{"name":"svc","dependencies":{"dep":"^1.0.0"}}\n',
      'node_modules/dep/index.js': 'module.exports = 1\n',
      'node_modules/dep/package.json': '{"name":"dep"}\n',
      'node_modules/dep/lib/util.js': 'module.exports = 2\n',
    })
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = [
      '!node_modules/**/*.js',
      '!node_modules/**/*.json',
    ]
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    const names = centralDirectoryNames(serviceArtifact(serviceDir))
    // Directory husks and nothing else.
    expect(names.filter((n) => n.startsWith('node_modules/'))).toEqual(
      expect.arrayContaining(['node_modules/dep/']),
    )
    expect(
      names.filter((n) => n.startsWith('node_modules/') && !n.endsWith('/')),
    ).toEqual([])
    expect(emptiedWarning()).toHaveLength(1)
  })

  it('stays silent when node_modules holds nothing but empty directories', async () => {
    // Nothing was excluded — there were no dependency files to begin with, so
    // there is no pattern to blame.
    const { serviceDir, buildDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{"name":"svc","dependencies":{"dep":"^1.0.0"}}\n',
    })
    fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep', 'lib'), {
      recursive: true,
    })
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!node_modules/**/*.js']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    expect(emptiedWarning()).toHaveLength(0)
  })

  it('stays silent when the patterns strip only directory husks', async () => {
    // Same empty node_modules, but now the negation DOES match the directory
    // entries, so the walk-scoped exclusion count is non-zero while not one
    // dependency file was lost. Counting entries rather than files here claims
    // the patterns emptied node_modules when there was never anything in it.
    const { serviceDir, buildDir } = seedBuildDir({
      'src/handler.js': 'x\n',
      'package.json': '{"name":"svc","dependencies":{"dep":"^1.0.0"}}\n',
    })
    fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep', 'lib'), {
      recursive: true,
    })
    const serverless = makeServerless(serviceDir, fns)
    serverless.service.package.patterns = ['!node_modules/**']
    const plugin = new Esbuild(serverless, {})

    await plugin._packageAll(fns)

    // Guard the premise: the husks really were stripped, so only the
    // file-scoping of the counter can be what suppresses the warning.
    expect(
      centralDirectoryNames(serviceArtifact(serviceDir)).filter((name) =>
        name.startsWith('node_modules/'),
      ),
    ).toEqual([])
    expect(emptiedWarning()).toHaveLength(0)
  })
})
