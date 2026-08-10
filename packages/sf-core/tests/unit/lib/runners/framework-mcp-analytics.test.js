import { TraditionalRunner } from '../../../../src/lib/runners/framework.js'

// getAnalysisEventDetails only reads instance fields — call it on a minimal
// fake `this` to avoid constructing the full runner. Mirrors
// framework-sandboxes-analytics.test.js.
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

test('attaches mcp block when config defines MCP servers', () => {
  const details = detailsFor({
    service: 'svc',
    provider: { name: 'aws', endpointType: 'REGIONAL' },
    mcp: {
      servers: {
        crm: {
          server: 'src/crm.mjs',
          state: true,
          authorizer: 'aws_iam',
          oauthDiscovery: {
            issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_x',
          },
        },
      },
    },
  })
  expect(details.mcp).toEqual({
    count: 1,
    authorizer: 1,
    authorizerTypes: ['aws_iam'],
    oauthDiscovery: 1,
    oauthDiscoveryUrlSources: ['stage'],
    issuerTypes: ['cognito'],
    state: { true: 1 },
    endpointType: 'REGIONAL',
  })
})

test('omits mcp key entirely when config has none', () => {
  const details = detailsFor({ service: 'svc', provider: { name: 'aws' } })
  expect('mcp' in details).toBe(false)
})

test('a throw while reading mcp config is swallowed (defense in depth)', () => {
  const config = { service: 'svc', provider: { name: 'aws' } }
  Object.defineProperty(config, 'mcp', {
    enumerable: true,
    get() {
      throw new Error('boom')
    },
  })
  const details = detailsFor(config)
  expect('mcp' in details).toBe(false)
  expect(details.providerRuntime).toBeUndefined() // rest of details intact
})
