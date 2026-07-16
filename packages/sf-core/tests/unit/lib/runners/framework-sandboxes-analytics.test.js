import { TraditionalRunner } from '../../../../src/lib/runners/framework.js'

// getAnalysisEventDetails only reads instance fields — call it on a minimal
// fake `this` to avoid constructing the full runner.
const detailsFor = (config) =>
  TraditionalRunner.prototype.getAnalysisEventDetails.call({
    config,
    configFilePath: '/svc/serverless.yml',
    serviceUniqueId: undefined,
    integrations: {},
    analyticsMetrics: undefined,
    compiledCloudFormationTemplate: undefined,
    command: ['deploy'],
  })

test('attaches sandboxes block when config defines sandboxes', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws' },
    sandboxes: { runner: { artifact: './app', minimumMemory: 8192 } },
  })
  expect(details.sandboxes).toEqual({
    count: 1,
    artifactTypes: ['source'],
    minimumMemory: [8192],
    observability: { defaults: 1 },
  })
})

test('omits sandboxes key entirely when config has none', () => {
  const details = detailsFor({ service: 'svc', provider: { name: 'aws' } })
  expect('sandboxes' in details).toBe(false)
})

test('a throw while reading sandboxes config is swallowed (defense in depth)', () => {
  const config = { service: 'svc', provider: { name: 'aws' } }
  Object.defineProperty(config, 'sandboxes', {
    enumerable: true,
    get() {
      throw new Error('boom')
    },
  })
  const details = detailsFor(config)
  expect('sandboxes' in details).toBe(false)
  expect(details.providerRuntime).toBeUndefined() // rest of details intact
})
