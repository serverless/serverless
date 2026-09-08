/**
 * With `bundle: false` the unit of work is no longer the handler file but the
 * partition -- one `esbuild.build()` per (source class, format) group covering
 * the whole project. `buildConcurrency` has to keep capping that work, or a
 * service that set it to stay inside a constrained CI box silently goes back to
 * running every partition at once.
 *
 * Counting calls cannot show that: the cap is about OVERLAP. So `esbuild.build`
 * is wrapped in a spy that records how many invocations are in flight at any
 * moment and then delegates to the real bundler, and the assertion is on that
 * high-water mark. The uncapped test is the control: it proves the probe can
 * see overlap at all, so the capped expectation is not vacuous.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

let realBuild
let inFlight = 0
let peakInFlight = 0
const buildMock = jest.fn(async (props) => {
  inFlight += 1
  peakInFlight = Math.max(peakInFlight, inFlight)
  try {
    return await realBuild(props)
  } finally {
    inFlight -= 1
  }
})

jest.unstable_mockModule('esbuild', () => {
  realBuild = jest.requireActual('esbuild').build
  return { build: buildMock }
})

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

beforeEach(() => {
  buildMock.mockClear()
  inFlight = 0
  peakInFlight = 0
})

// Three source classes, so the build plans three partitions: `.ts` onto the
// `.js` class, `.mts` onto `.mjs`, `.cts` onto `.cjs`.
function makeThreePartitionService() {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-concurrency-')),
  )
  createdServiceDirs.push(serviceDir)
  const files = {
    'package.json': '{"name":"svc"}',
    'src/handler.ts': 'export const hello = async () => ({})\n',
    'src/tool.mts': 'export const tool = 1\n',
    'src/old.cts': 'export const old = 1\n',
  }
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(serviceDir, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
  return serviceDir
}

function makePlugin(serviceDir, esbuildConfig) {
  const functions = { hello: { handler: 'src/handler.hello' } }
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime: 'nodejs20.x' },
      package: {},
      build: { esbuild: esbuildConfig },
      functions,
      getFunction: (alias) => functions[alias],
      getAllFunctions: () => Object.keys(functions),
    },
    pluginManager: { spawn: async () => {} },
  }
  const plugin = new Esbuild(serverless, {})
  plugin.functions = async () => functions
  return plugin
}

const buildDirOf = (serviceDir) => path.join(serviceDir, '.serverless', 'build')

describe('buildConcurrency caps the partition builds', () => {
  jest.setTimeout(60_000)

  it('runs the partitions one at a time under a concurrency of 1', async () => {
    const serviceDir = makeThreePartitionService()
    const plugin = makePlugin(serviceDir, {
      bundle: false,
      buildConcurrency: 1,
    })

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(3)
    expect(peakInFlight).toBe(1)
    // Serializing must not lose a partition.
    for (const output of ['src/handler.js', 'src/tool.mjs', 'src/old.cjs']) {
      expect(fs.existsSync(path.join(buildDirOf(serviceDir), output))).toBe(
        true,
      )
    }
  })

  it('runs them all at once when nothing caps them', async () => {
    // The control. Partitions write disjoint files, so the default is full
    // parallelism -- and this is what the capped run above has to suppress.
    const serviceDir = makeThreePartitionService()
    const plugin = makePlugin(serviceDir, { bundle: false })

    await plugin._build()

    expect(buildMock).toHaveBeenCalledTimes(3)
    expect(peakInFlight).toBe(3)
  })
})
