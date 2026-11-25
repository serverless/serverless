// With a proxy set, the AWS SDK v2 requests go through it. A request to an endpoint the user
// configured with AWS_ENDPOINT_URL (a local emulator such as AWS Emulator or LocalStack) goes
// direct when NO_PROXY lists its host, as it does for the AWS SDK v3 clients.
import http from 'http'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals'

const VARIABLES = [
  'proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'AWS_ENDPOINT_URL',
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_CONFIG_FILE',
  'AWS_PROFILE',
  'SLS_AWS_REQUEST_MAX_RETRIES',
]
const saved = Object.fromEntries(
  VARIABLES.map((name) => [name, process.env[name]]),
)
for (const name of VARIABLES) delete process.env[name]

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })

const reached = { endpoint: 0, proxy: 0 }
const endpointServer = await listen((req, res) => {
  reached.endpoint += 1
  req.resume()
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'text/xml' })
    res.end(
      '<DescribeStacksResponse><DescribeStacksResult><Stacks/></DescribeStacksResult></DescribeStacksResponse>',
    )
  })
})
// The stand-in proxy counts each tunnel request and refuses it.
const proxyServer = await listen((req, res) => {
  reached.proxy += 1
  res.writeHead(403)
  res.end()
})
proxyServer.on('connect', (req, socket) => {
  reached.proxy += 1
  socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
})

// The request module reads the proxy and retry variables once, when it loads.
process.env.SLS_AWS_REQUEST_MAX_RETRIES = '0'
process.env.HTTP_PROXY = `http://127.0.0.1:${proxyServer.address().port}`
const { default: awsRequest } =
  await import('../../../../../lib/aws/v2/request.js')
const { default: sdk } = await import('../../../../../lib/aws/v2/sdk.js')

const endpointUrl = `http://127.0.0.1:${endpointServer.address().port}`
let serviceCount = 0
const describeStacks = () =>
  awsRequest(
    {
      name: 'CloudFormation',
      params: {
        accessKeyId: `AKIDPROXY${++serviceCount}`,
        secretAccessKey: 'secret',
        region: 'us-east-1',
      },
    },
    'describeStacks',
    {},
  )

beforeEach(() => {
  reached.endpoint = 0
  reached.proxy = 0
  process.env.AWS_CONFIG_FILE = '/nonexistent/sls-v2-proxy-config'
})
afterEach(() => {
  delete process.env.NO_PROXY
  delete process.env.AWS_ENDPOINT_URL
  delete sdk.config.cloudformation
})
afterAll(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  endpointServer.closeAllConnections()
  proxyServer.closeAllConnections()
  await new Promise((resolve) => endpointServer.close(resolve))
  await new Promise((resolve) => proxyServer.close(resolve))
})

describe('AWS SDK v2 requests behind a proxy', () => {
  test('a configured endpoint that NO_PROXY lists is reached without the proxy', async () => {
    process.env.NO_PROXY = 'localhost,127.0.0.1'
    process.env.AWS_ENDPOINT_URL = endpointUrl
    const result = await describeStacks()
    expect(result.Stacks).toEqual([])
    expect(reached).toEqual({ endpoint: 1, proxy: 0 })
  })

  test('a configured endpoint that NO_PROXY does not list takes the proxy', async () => {
    process.env.NO_PROXY = 'example.com'
    process.env.AWS_ENDPOINT_URL = endpointUrl
    await expect(describeStacks()).rejects.toThrow()
    expect(reached.endpoint).toBe(0)
    expect(reached.proxy).toBeGreaterThan(0)
  })

  test('an endpoint a plugin sets in the SDK configuration (serverless-localstack) that NO_PROXY lists is reached without the proxy', async () => {
    process.env.NO_PROXY = '127.0.0.1'
    sdk.config.update({ cloudformation: { endpoint: endpointUrl } })
    await describeStacks()
    expect(reached).toEqual({ endpoint: 1, proxy: 0 })
  })

  test('an endpoint a plugin sets that NO_PROXY does not list takes the proxy, as before', async () => {
    process.env.NO_PROXY = 'example.com'
    sdk.config.update({ cloudformation: { endpoint: endpointUrl } })
    await expect(describeStacks()).rejects.toThrow()
    expect(reached.endpoint).toBe(0)
    expect(reached.proxy).toBeGreaterThan(0)
  })
})
