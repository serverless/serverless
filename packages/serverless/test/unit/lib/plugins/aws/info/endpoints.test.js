import { describe, expect, it, jest } from '@jest/globals'
import getStackInfo from '../../../../../../lib/plugins/aws/info/get-stack-info.js'
import display from '../../../../../../lib/plugins/aws/info/display.js'
import {
  endpointLinesOf,
  externalHttpApiEndpointOf,
} from '../../../../../../lib/plugins/aws/info/endpoints.js'

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
      if (method === 'listExports') {
        return { Exports: [{ Name: 'shared-http-api-id', Value: 'ext789' }] }
      }
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

// The same lines, from the helpers Dev Mode uses for its start-up lines and `dev status`.
describe('info endpoint lines, from the stack outputs alone', () => {
  const FUNCTION_URL = 'https://xyz.lambda-url.us-east-1.on.aws/'
  const naming = plugin({ outputs: [] }).provider.naming
  const linesOf = ({ functions, outputs }) => {
    const { serverless } = plugin({ outputs, functions })
    return endpointLinesOf({ serverless, outputs, naming })
  }

  it('are the lines displayEndpoints sets', async () => {
    const functions = {
      root: { events: [{ http: 'GET /' }] },
      legacy: { events: [{ http: { method: 'post', path: '/a//b/' } }] },
      orders: { events: [{ httpApi: 'GET /orders/{id}' }] },
      web: { url: true, events: [] },
    }
    const outputs = [
      { OutputKey: 'ServiceEndpoint', OutputValue: REST },
      { OutputKey: 'HttpApiUrl', OutputValue: HTTP_API },
      { OutputKey: 'ServiceEndpointWebsocket', OutputValue: WEBSOCKET },
      { OutputKey: 'webLambdaFunctionUrl', OutputValue: FUNCTION_URL },
      {
        OutputKey: 'CloudFrontDistributionDomainName',
        OutputValue: 'd111.cloudfront.net',
      },
    ]
    const info = plugin({ outputs, functions })
    await info.getStackInfo()
    info.displayEndpoints()
    const displayed = info.serverless.serviceOutputs.get('endpoints')
    expect(displayed).toEqual([
      `GET - ${REST}`,
      `POST - ${REST}/a/b`,
      `GET - ${HTTP_API}/orders/{id}`,
      WEBSOCKET,
      'CloudFront - d111.cloudfront.net',
      `web: ${FUNCTION_URL}`,
    ])
    expect(linesOf({ functions, outputs })).toEqual(displayed)
  })

  it('a lone function URL is a bare URL, as info prints it', () => {
    expect(
      linesOf({
        functions: { web: { url: true, events: [] } },
        outputs: [
          { OutputKey: 'webLambdaFunctionUrl', OutputValue: FUNCTION_URL },
        ],
      }),
    ).toEqual([FUNCTION_URL])
  })
})

describe('the HTTP API that provider.httpApi.id names', () => {
  const lookUp = ({ httpApiId }) => {
    const { provider, serverless } = plugin({ outputs: [], httpApiId })
    return {
      provider,
      url: externalHttpApiEndpointOf({ provider, service: serverless.service }),
    }
  }

  it('a plain id: its URL, from ApiGatewayV2', async () => {
    const { provider, url } = lookUp({ httpApiId: 'ext789' })
    expect(await url).toBe(EXTERNAL_HTTP_API)
    expect(provider.request).toHaveBeenCalledWith('ApiGatewayV2', 'getApi', {
      ApiId: 'ext789',
    })
  })

  it('an Fn::ImportValue: the export, then its URL', async () => {
    const { provider, url } = lookUp({
      httpApiId: { 'Fn::ImportValue': 'shared-http-api-id' },
    })
    expect(await url).toBe(EXTERNAL_HTTP_API)
    expect(provider.request.mock.calls.map(([, method]) => method)).toEqual([
      'listExports',
      'getApi',
    ])
    expect(provider.request).toHaveBeenLastCalledWith(
      'ApiGatewayV2',
      'getApi',
      { ApiId: 'ext789' },
    )
  })

  it('none named: no call', async () => {
    const { provider, url } = lookUp({})
    expect(await url).toBeUndefined()
    expect(provider.request).not.toHaveBeenCalled()
  })

  it('its routes are listed as info lists them', async () => {
    const functions = { orders: { events: [{ httpApi: 'GET /orders/{id}' }] } }
    const info = plugin({ outputs: [], httpApiId: 'ext789', functions })
    await info.getStackInfo()
    info.displayEndpoints()
    const displayed = info.serverless.serviceOutputs.get('endpoint')
    expect(displayed).toBe(`GET - ${EXTERNAL_HTTP_API}/orders/{id}`)
    expect(
      endpointLinesOf({
        serverless: info.serverless,
        outputs: [],
        naming: info.provider.naming,
        externalHttpApiEndpoint: EXTERNAL_HTTP_API,
      }),
    ).toEqual([displayed])
  })

  it('a failed lookup still fails info as before', async () => {
    const info = plugin({ outputs: [], httpApiId: 'ext789' })
    info.provider.request.mockImplementation(async (service, method) => {
      if (method === 'describeStacks') return { Stacks: [{ Outputs: [] }] }
      throw new Error('Not Found')
    })
    await expect(info.getStackInfo()).rejects.toMatchObject({
      code: 'UNABLE_TO_RESOLVE_HTTP_API_ID',
      message: 'Could not resolve provider.httpApi.id parameter. Not Found',
    })
  })
})
