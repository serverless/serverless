import { describe, expect, it, jest } from '@jest/globals'
import getStackInfo from '../../../../../../lib/plugins/aws/info/get-stack-info.js'
import display from '../../../../../../lib/plugins/aws/info/display.js'

// `info --json` prints gatheredData as is, so every endpoint in it is a plain
// URL. Which of them belong to an HTTP API is kept on the plugin, for the
// human-readable routes list.
const REST = 'https://rest123.execute-api.us-east-1.amazonaws.com/dev'
const HTTP_API = 'https://http456.execute-api.us-east-1.amazonaws.com'
const EXTERNAL_HTTP_API = 'https://ext789.execute-api.us-east-1.amazonaws.com'
const WEBSOCKET = 'wss://ws000.execute-api.us-east-1.amazonaws.com/dev'

const plugin = ({ outputs, httpApiId, functions = {} }) => ({
  ...getStackInfo,
  ...display,
  options: {},
  serverless: {
    compose: {},
    serviceOutputs: new Map(),
    httpApiEventsPlugin: {
      resolveConfiguration: () => {
        for (const fn of Object.values(functions)) {
          for (const event of fn.events) {
            if (!event.httpApi) continue
            const [method, path] = event.httpApi.split(' ')
            event.resolvedMethod = method
            event.resolvedPath = path
          }
        }
      },
    },
    service: {
      service: 'orders',
      provider: httpApiId ? { httpApi: { id: httpApiId } } : {},
      functions,
      getAllFunctions: () => Object.keys(functions),
      getFunction: (name) => functions[name],
      getAllLayers: () => [],
    },
  },
  provider: {
    request: jest.fn(async (service, method) => {
      if (method === 'describeStacks') return { Stacks: [{ Outputs: outputs }] }
      if (method === 'getApi') return { ApiEndpoint: EXTERNAL_HTTP_API }
      throw new Error(`unexpected ${service}.${method}`)
    }),
    getStage: () => 'dev',
    getRegion: () => 'us-east-1',
    naming: {
      getStackName: () => 'orders-dev',
      getServiceEndpointRegex: () => /^(ServiceEndpoint|HttpApiUrl)/,
      getLambdaFunctionUrlOutputLogicalId: (fn) => `${fn}LambdaFunctionUrl`,
      getLambdaLayerOutputLogicalId: (layer) => `${layer}LayerArn`,
      getCloudFrontDistributionDomainNameLogicalId: () =>
        'CloudFrontDistributionDomainName',
    },
  },
})

describe('info endpoints', () => {
  it('lists every endpoint as a plain URL, with no type prefix', async () => {
    const info = plugin({
      outputs: [
        { OutputKey: 'ServiceEndpoint', OutputValue: REST },
        { OutputKey: 'HttpApiUrl', OutputValue: HTTP_API },
        { OutputKey: 'ServiceEndpointWebsocket', OutputValue: WEBSOCKET },
      ],
    })
    await info.getStackInfo()
    expect(info.gatheredData.info.endpoints).toEqual([
      REST,
      HTTP_API,
      WEBSOCKET,
    ])
    expect(JSON.stringify(info.gatheredData)).not.toContain('httpApi: ')
  })

  it('an HTTP API attached by provider.httpApi.id is a plain URL too', async () => {
    const info = plugin({ outputs: [], httpApiId: 'ext789' })
    await info.getStackInfo()
    expect(info.gatheredData.info.endpoints).toEqual([EXTERNAL_HTTP_API])
  })

  it('still lists each API type with its own routes', async () => {
    const functions = {
      legacy: { events: [{ http: 'GET legacy/items' }] },
      orders: { events: [{ httpApi: 'GET /orders/{id}' }] },
    }
    const info = plugin({
      functions,
      outputs: [
        { OutputKey: 'ServiceEndpoint', OutputValue: REST },
        { OutputKey: 'HttpApiUrl', OutputValue: HTTP_API },
        { OutputKey: 'ServiceEndpointWebsocket', OutputValue: WEBSOCKET },
      ],
    })
    await info.getStackInfo()
    info.displayEndpoints()
    expect(info.serverless.serviceOutputs.get('endpoints')).toEqual([
      `GET - ${REST}/legacy/items`,
      `GET - ${HTTP_API}/orders/{id}`,
      WEBSOCKET,
    ])
  })
})
