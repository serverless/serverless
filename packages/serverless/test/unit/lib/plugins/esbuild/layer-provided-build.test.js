/**
 * A service whose handlers ALL live in a Lambda layer — the manual Datadog /
 * New Relic wrapper shape, `handler:
 * /opt/nodejs/node_modules/datadog-lambda-js/handler.handler` plus a `layers`
 * list — resolves no esbuild entry point at all. That is a normal, working
 * configuration, and the build says so: it warns that the handlers are assumed
 * to be layer-provided and carries on.
 *
 * Carrying on has to mean carrying on. The build directory is still the
 * artifact definition for these functions, so it must exist and be clean by the
 * time `_preparePackageJson` writes into it and packaging walks it. The
 * no-entry-points path returned before resetting, so `.serverless/build` never
 * existed and `_preparePackageJson` wrote into a directory that was not there —
 * a raw ENOENT immediately after the plugin told the user it had handled the
 * configuration.
 *
 * Clean matters as much as present: a service that switched a handler over to a
 * layer-provided path still has that handler's outfile sitting in the build
 * directory from the last deploy, and it must not ship.
 *
 * The packager install is stubbed; these tests are about the build directory
 * and the artifact, not about a real `npm install`.
 */

import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'
import { log } from '@serverless/util'

const spawnMock = jest.fn(() => {
  const child = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdout = new EventEmitter()
  const promise = Promise.resolve()
  promise.child = child
  process.nextTick(() => child.emit('close', 0))
  return promise
})

jest.unstable_mockModule('child-process-ext/spawn.js', () => ({
  default: spawnMock,
}))

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const esbuildLogger = log.get('esbuild')
const createdDirs = []

afterAll(() => {
  for (const dir of createdDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// `realpathSync` because macOS resolves the temp dir through a symlink
// (`/var` -> `/private/var`) and esbuild reports real paths.
function makeServiceDir(files = {}) {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-layer-')),
  )
  createdDirs.push(serviceDir)
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(serviceDir, ...name.split('/'))
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
  return serviceDir
}

const LAYER_HANDLER = {
  handler: '/opt/nodejs/node_modules/datadog-lambda-js/handler.handler',
  layers: ['arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Node20-x:1'],
}

function makePlugin(serviceDir, fns) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    compose: { isWithinCompose: false },
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs20.x' },
      package: {},
      build: { esbuild: {} },
      functions: fns,
      getFunction: (name) => fns[name],
      getAllFunctions: () => Object.keys(fns),
    },
    pluginManager: { spawn: async () => {} },
  }
  return new Esbuild(serverless, {})
}

const buildDirOf = (serviceDir) => path.join(serviceDir, '.serverless', 'build')

async function zipNames(serviceDir) {
  const zip = await JsZip.loadAsync(
    fs.readFileSync(path.join(serviceDir, '.serverless', 'svc.zip')),
  )
  return Object.keys(zip.files).sort()
}

// A minimal service that declares nothing to install and carries a lockfile,
// so `_preparePackageJson` exercises both the manifest write and the lockfile
// copy without depending on what a real install would generate.
const BASE_FILES = {
  'package.json': '{"name":"svc","dependencies":{}}\n',
  'package-lock.json': '{"lockfileVersion":3}\n',
}

describe('a service whose handlers are all layer-provided', () => {
  jest.setTimeout(30_000)

  let warnSpy

  beforeEach(() => {
    spawnMock.mockClear()
    warnSpy = jest.spyOn(esbuildLogger, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  const layerWarnings = () =>
    warnSpy.mock.calls
      .map((call) => call[0])
      .filter((message) => message.includes('provided by a Lambda layer'))

  it('builds, prepares and packages end to end', async () => {
    const serviceDir = makeServiceDir(BASE_FILES)
    const fns = { dd: LAYER_HANDLER }
    const plugin = makePlugin(serviceDir, fns)

    await expect(plugin._build()).resolves.toBeUndefined()

    // The warning is the promise that this configuration was handled...
    expect(layerWarnings()).toHaveLength(1)
    // ...so the build directory it implies has to be there, and empty.
    expect(fs.existsSync(buildDirOf(serviceDir))).toBe(true)
    expect(fs.readdirSync(buildDirOf(serviceDir))).toEqual([])

    await expect(plugin._preparePackageJson()).resolves.toBeUndefined()

    // The post-zip handler assertion must not fire: a layer-provided function
    // has no outfile, so there is nothing in the artifact to miss.
    await expect(plugin._packageAll(fns)).resolves.toBeUndefined()

    expect(await zipNames(serviceDir)).toEqual([
      'package-lock.json',
      'package.json',
    ])
  })

  it('wipes an outfile left by a build made before the handler moved to a layer', async () => {
    const serviceDir = makeServiceDir(BASE_FILES)
    const stale = path.join(buildDirOf(serviceDir), 'src', 'handler.js')
    fs.mkdirSync(path.dirname(stale), { recursive: true })
    fs.writeFileSync(stale, 'module.exports.handler = "STALE"\n')
    const fns = { dd: LAYER_HANDLER }
    const plugin = makePlugin(serviceDir, fns)

    await plugin._build()

    expect(fs.existsSync(stale)).toBe(false)

    await plugin._preparePackageJson()
    await plugin._packageAll(fns)

    expect(await zipNames(serviceDir)).not.toContain('src/handler.js')
  })

  it('leaves dev mode holding its last-good outputs', async () => {
    // Dev mode never resets, on this path or any other — a failed incremental
    // rebuild must not leave the dev loop with nothing to serve.
    const serviceDir = makeServiceDir(BASE_FILES)
    const previous = path.join(buildDirOf(serviceDir), 'src', 'handler.js')
    fs.mkdirSync(path.dirname(previous), { recursive: true })
    fs.writeFileSync(previous, 'last good\n')
    const fns = { dd: { ...LAYER_HANDLER, originalHandler: '/opt/x.handler' } }
    const plugin = makePlugin(serviceDir, fns)

    await plugin._build('originalHandler')

    expect(fs.readFileSync(previous, 'utf8')).toBe('last good\n')
  })

  it('still builds the buildable function in a mixed service', async () => {
    const serviceDir = makeServiceDir({
      ...BASE_FILES,
      'src/api.ts':
        'export const handler = async (): Promise<object> => ({ statusCode: 200 })\n',
    })
    const fns = { dd: LAYER_HANDLER, api: { handler: 'src/api.handler' } }
    const plugin = makePlugin(serviceDir, fns)

    await plugin._build()

    // The layered function is still reported, and the buildable one is built.
    expect(layerWarnings()).toHaveLength(1)
    expect(plugin.builtArtifacts.get('api').outfile).toBe('src/api.js')
    expect(plugin.builtArtifacts.get('dd')).toBeUndefined()

    await plugin._preparePackageJson()
    await plugin._packageAll(fns)

    expect(await zipNames(serviceDir)).toEqual(
      expect.arrayContaining(['package.json', 'src/api.js']),
    )
  })
})
