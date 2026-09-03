import { TraditionalRunner } from '../../../../src/lib/runners/framework.js'

// getAnalysisEventDetails only reads instance fields — call it on a minimal
// fake `this` to avoid constructing the full runner. Mirrors
// framework-mcp-analytics.test.js.
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

test('attaches provisionedPollers block when an event configures it', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws' },
    functions: {
      worker: {
        events: [
          {
            sqs: {
              arn: 'arn:aws:sqs:r:a:q',
              provisionedPollers: { min: 2, max: 10 },
            },
          },
        ],
      },
    },
  })
  expect(details.provisionedPollers).toEqual({
    sqs: { configured: 1, min: [2], max: [10] },
  })
})

test('omits the field entirely when unused', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws' },
    functions: { worker: { events: [{ sqs: 'arn:aws:sqs:r:a:q' }] } },
  })
  expect(details).not.toHaveProperty('provisionedPollers')
})
