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

test('reports a container-image function as the runtime value "image"', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws' },
    functions: { inference: { image: 'app' } },
  })
  expect(details.runtimes).toEqual(['image'])
})

test('reports "image" alongside explicit runtimes in a mixed service, deduplicated', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws' },
    functions: {
      a: { image: { name: 'app' } },
      b: { handler: 'h.b', runtime: 'nodejs22.x' },
      c: { image: 'other' },
    },
  })
  expect(details.runtimes).toEqual(['image', 'nodejs22.x'])
})

test('leaves runtimes unchanged for zip functions and omits the key when none is explicit', () => {
  expect(
    detailsFor({
      service: 'svc',
      provider: { name: 'aws', runtime: 'python3.12' },
      functions: { a: { handler: 'h.a' } },
    }).runtimes,
  ).toBeUndefined()
  expect(
    detailsFor({
      service: 'svc',
      provider: { name: 'aws' },
      functions: { a: { handler: 'h.a', runtime: 'java21' } },
    }).runtimes,
  ).toEqual(['java21'])
})

test('a throw while reading a function is swallowed and the rest of details stays intact', () => {
  const fn = { handler: 'h.a' }
  Object.defineProperty(fn, 'image', {
    enumerable: true,
    get() {
      throw new Error('boom')
    },
  })
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws', runtime: 'nodejs22.x' },
    functions: { a: fn },
  })
  expect('runtimes' in details).toBe(false)
  expect(details.providerRuntime).toBe('nodejs22.x')
})
