import { expect, test } from '@jest/globals'
import {
  endpointLabelOf,
  endpointsOf,
} from '../../../../../../../lib/plugins/aws/dev/control/endpoints.js'

const serviceWith = (functions) => ({
  getAllFunctions: () => Object.keys(functions),
  getFunction: (key) => functions[key],
})
// A placeholder account, built in code so no account-id-shaped literal sits in the source.
const ACCOUNT = '0'.repeat(12)
const naming = {
  getLambdaFunctionUrlOutputLogicalId: (key) =>
    `${key[0].toUpperCase()}${key.slice(1)}LambdaFunctionUrl`,
}

test('lists REST API, HTTP API and function URL endpoints with the URLs of the stack outputs', () => {
  const service = serviceWith({
    createOrder: {
      events: [
        { httpApi: 'POST /orders' },
        { httpApi: { method: 'get', path: '/orders/{id}' } },
      ],
    },
    legacy: {
      events: [
        { http: 'GET legacy/items' },
        { http: { method: 'post', path: '/legacy' } },
      ],
    },
    anything: { events: [{ httpApi: '*' }] },
    stream: { url: { invokeMode: 'RESPONSE_STREAM' } },
    worker: { events: [{ sqs: `arn:aws:sqs:us-east-1:${ACCOUNT}:q` }] },
  })
  // As describeStacks returns them.
  const outputs = [
    ['ServiceEndpoint', 'https://abc.execute-api.us-east-1.amazonaws.com/dev'],
    ['HttpApiUrl', 'https://xyz.execute-api.us-east-1.amazonaws.com'],
    ['StreamLambdaFunctionUrl', 'https://s.lambda-url.us-east-1.on.aws/'],
  ].map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }))
  expect(endpointsOf({ service, outputs, naming })).toEqual([
    {
      method: 'POST',
      url: 'https://xyz.execute-api.us-east-1.amazonaws.com/orders',
      function: 'createOrder',
    },
    {
      method: 'GET',
      url: 'https://xyz.execute-api.us-east-1.amazonaws.com/orders/{id}',
      function: 'createOrder',
    },
    {
      method: 'GET',
      url: 'https://abc.execute-api.us-east-1.amazonaws.com/dev/legacy/items',
      function: 'legacy',
    },
    {
      method: 'POST',
      url: 'https://abc.execute-api.us-east-1.amazonaws.com/dev/legacy',
      function: 'legacy',
    },
    {
      method: 'ANY',
      url: 'https://xyz.execute-api.us-east-1.amazonaws.com',
      function: 'anything',
    },
    {
      method: 'ANY',
      url: 'https://s.lambda-url.us-east-1.on.aws/',
      function: 'stream',
    },
  ])
})

test('an endpoint without its output is left out', () => {
  const service = serviceWith({
    api: { url: true, events: [{ httpApi: 'GET /' }, { http: 'GET /' }] },
  })
  expect(endpointsOf({ service, outputs: [], naming })).toEqual([])
})

const REST = 'https://abc.execute-api.us-east-1.amazonaws.com/dev'
const restOutputs = [{ OutputKey: 'ServiceEndpoint', OutputValue: REST }]

test('an MCP-only service lists each MCP server at the URL deploy and info print, marked as one', () => {
  // The servers' functions have no events of their own: the mcp plugin routes them.
  const service = serviceWith({ crm: { events: [] }, docs: { events: [] } })
  expect(
    endpointsOf({
      service,
      outputs: restOutputs,
      naming,
      mcpServers: [{ name: 'crm' }, { name: 'docs' }],
    }),
  ).toEqual([
    { method: 'ANY', url: `${REST}/crm/mcp`, function: 'crm', mcp: true },
    { method: 'ANY', url: `${REST}/docs/mcp`, function: 'docs', mcp: true },
  ])
})

test('HTTP endpoints come first, then the MCP servers; a custom domain gives the MCP URL', () => {
  const service = {
    ...serviceWith({ api: { events: [{ http: 'GET items' }] }, crm: {} }),
    provider: { domain: { name: 'api.acme.com', basePath: 'v1' } },
  }
  expect(
    endpointsOf({
      service,
      outputs: restOutputs,
      naming,
      mcpServers: [{ name: 'crm' }],
    }),
  ).toEqual([
    { method: 'GET', url: `${REST}/items`, function: 'api' },
    {
      method: 'ANY',
      url: 'https://api.acme.com/v1/crm/mcp',
      function: 'crm',
      mcp: true,
    },
  ])
})

test('an MCP server without a known URL is left out', () => {
  const service = serviceWith({ crm: { events: [] } })
  expect(
    endpointsOf({
      service,
      outputs: [],
      naming,
      mcpServers: [{ name: 'crm' }],
    }),
  ).toEqual([])
})

test('an HTTP API that provider.httpApi.id names lists its routes at the URL AWS gives for it', () => {
  // Such an HTTP API has no stack output: the session looks its URL up as `info` does.
  const service = serviceWith({
    orders: { events: [{ httpApi: 'GET /orders' }] },
  })
  expect(
    endpointsOf({
      service,
      outputs: [],
      naming,
      externalHttpApiEndpoint:
        'https://ext.execute-api.us-east-1.amazonaws.com',
    }),
  ).toEqual([
    {
      method: 'GET',
      url: 'https://ext.execute-api.us-east-1.amazonaws.com/orders',
      function: 'orders',
    },
  ])
})

test('the start-up lines label a route by its method and path, a function URL by its function, and the other endpoints by their kind', () => {
  const url = 'https://abc.execute-api.us-east-1.amazonaws.com/dev'
  expect(
    [
      { kind: 'route', method: 'GET', path: '/hello', url: `${url}/hello` },
      { kind: 'route', method: 'GET', path: '/', url },
      { kind: 'route', method: 'ANY', path: '*', url },
      { kind: 'other', url: 'wss://w.execute-api.us-east-1.amazonaws.com/dev' },
      { kind: 'other', url: 'tcp://other.example' },
      { kind: 'cloudfront', url: 'd111.cloudfront.net' },
      { kind: 'function', name: 'stream', url: 'https://s.lambda-url.on.aws/' },
    ].map(endpointLabelOf),
  ).toEqual([
    'GET /hello',
    'GET /',
    'ANY *',
    'WebSocket',
    '',
    'CloudFront',
    'stream',
  ])
})
