import fs from 'fs'
import os from 'os'
import path from 'path'
import { TraditionalRunner } from '../../../../src/lib/runners/framework.js'

let serviceDir

beforeAll(() => {
  serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-web-apps-runner-analytics-')),
  )
  fs.mkdirSync(path.join(serviceDir, 'src'))
  fs.writeFileSync(path.join(serviceDir, 'src', 'server.ts'), '')
})

afterAll(() => {
  fs.rmSync(serviceDir, { recursive: true, force: true })
})

// getAnalysisEventDetails only reads instance fields — call it on a minimal
// fake `this` to avoid constructing the full runner. Mirrors
// framework-sandboxes-analytics.test.js, with a real service directory so the
// esbuild selection rules can see the entry file.
const detailsFor = (config) =>
  TraditionalRunner.prototype.getAnalysisEventDetails.call({
    config,
    configFilePath: path.join(serviceDir, 'serverless.yml'),
    serviceUniqueId: undefined,
    integrations: {},
    analyticsMetrics: undefined,
    compiledCloudFormationTemplate: undefined,
    command: ['deploy'],
  })

test('attaches webApps block when config defines web apps', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws' },
    webApps: { site: { entry: 'src/server.ts', timeout: 60 } },
  })
  expect(details.webApps).toEqual({
    count: 1,
    entryKinds: { ts: 1 },
    bundled: 1,
    url: { public: 1 },
    explicit: { timeout: 1 },
  })
})

test('isEsbuildEnabled resolves entries against the service directory', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws' },
    webApps: { site: { entry: 'src/server.ts' } },
  })
  expect(details.isEsbuildEnabled).toBe(true)
})

test('omits webApps key entirely when config has none', () => {
  const details = detailsFor({ service: 'svc', provider: { name: 'aws' } })
  expect('webApps' in details).toBe(false)
})

test('a throw while reading webApps config is swallowed (defense in depth)', () => {
  const config = { service: 'svc', provider: { name: 'aws' } }
  Object.defineProperty(config, 'webApps', {
    enumerable: true,
    get() {
      throw new Error('boom')
    },
  })
  const details = detailsFor(config)
  expect('webApps' in details).toBe(false)
  expect(details.isEsbuildEnabled).toBe(false)
  expect(details.providerRuntime).toBeUndefined() // rest of details intact
})
