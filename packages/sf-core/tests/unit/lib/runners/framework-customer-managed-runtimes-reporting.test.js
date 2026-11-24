import { TraditionalRunner } from '../../../../src/lib/runners/framework.js'

// getAnalysisEventDetails only reads instance fields — call it on a minimal
// fake `this` to avoid constructing the full runner. Mirrors
// framework-image-runtimes-analytics.test.js.
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

const aliasArn =
  'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod'

test('reports a customer-managed runtime as "custom", never its ARN', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws', runtime: aliasArn },
    functions: {
      a: { handler: 'a.h', runtime: { Ref: 'RuntimeStable' } },
      b: { handler: 'b.h', runtime: 'nodejs24.x' },
    },
  })
  expect(details.providerRuntime).toBe('custom')
  expect(details.runtimes).toEqual(['custom', 'nodejs24.x'])
  expect(JSON.stringify(details)).not.toContain('123456789012')
  expect(JSON.stringify(details)).not.toContain('RuntimeStable')
})
