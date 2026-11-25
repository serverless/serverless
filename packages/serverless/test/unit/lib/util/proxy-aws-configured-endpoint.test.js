// With a proxy set, addProxyToAwsClient sends a client's requests through it unless NO_PROXY
// covers AWS's own endpoints. A request to an endpoint the user configured with AWS_ENDPOINT_URL
// (a local emulator such as AWS Emulator or LocalStack) goes direct when NO_PROXY lists its host.
// These tests use real SDK clients, a local stand-in for the endpoint and a local stand-in for the
// proxy, and check which of the two each request reached.
import http from 'http'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { addProxyToAwsClient } from '@serverless/util'

const VARIABLES = [
  'proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_STS',
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_CONFIG_FILE',
  'AWS_PROFILE',
]

const CALLER_IDENTITY = `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <GetCallerIdentityResult>
    <Arn>arn:aws:iam::000000000000:user/emulator</Arn>
    <UserId>EMULATOR</UserId>
    <Account>000000000000</Account>
  </GetCallerIdentityResult>
  <ResponseMetadata><RequestId>1</RequestId></ResponseMetadata>
</GetCallerIdentityResponse>`

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })

let endpointServer
let proxyServer
const reached = { endpoint: 0, proxy: 0 }
let saved

beforeAll(async () => {
  endpointServer = await listen((req, res) => {
    reached.endpoint += 1
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/xml' })
      res.end(CALLER_IDENTITY)
    })
  })
  // A plain HTTP proxy receives absolute-form requests for http: targets; it answers them itself,
  // so a request that took the proxy is told apart from one that went direct.
  proxyServer = await listen((req, res) => {
    reached.proxy += 1
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/xml' })
      res.end(CALLER_IDENTITY)
    })
  })
  // An https: target arrives as CONNECT; the stand-in refuses the tunnel.
  proxyServer.on('connect', (req, socket) => {
    reached.proxy += 1
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
  })
})
afterAll(async () => {
  endpointServer.closeAllConnections()
  proxyServer.closeAllConnections()
  await new Promise((resolve) => endpointServer.close(resolve))
  await new Promise((resolve) => proxyServer.close(resolve))
})
beforeEach(() => {
  saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]))
  for (const name of VARIABLES) delete process.env[name]
  process.env.AWS_CONFIG_FILE = '/nonexistent/sls-proxy-endpoint-config'
  reached.endpoint = 0
  reached.proxy = 0
})
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

const endpointUrl = () => `http://127.0.0.1:${endpointServer.address().port}`
const proxyUrl = () => `http://127.0.0.1:${proxyServer.address().port}`

const callerIdentity = async (clientConfig = {}) => {
  const client = addProxyToAwsClient(
    new STSClient({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' },
      maxAttempts: 1,
      ...clientConfig,
    }),
  )
  try {
    return await client.send(new GetCallerIdentityCommand({}))
  } finally {
    client.destroy()
  }
}

describe('addProxyToAwsClient with a configured endpoint', () => {
  test('a configured endpoint that NO_PROXY lists is reached without the proxy', async () => {
    process.env.HTTP_PROXY = proxyUrl()
    process.env.NO_PROXY = 'localhost,127.0.0.1'
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    const result = await callerIdentity()
    expect(result.Account).toBe('000000000000')
    expect(reached).toEqual({ endpoint: 1, proxy: 0 })
  })

  test('a service-specific endpoint variable counts too', async () => {
    process.env.HTTP_PROXY = proxyUrl()
    process.env.NO_PROXY = '127.0.0.1'
    process.env.AWS_ENDPOINT_URL_STS = endpointUrl()
    await callerIdentity()
    expect(reached).toEqual({ endpoint: 1, proxy: 0 })
  })

  test('a configured endpoint that NO_PROXY does not list takes the proxy', async () => {
    process.env.HTTP_PROXY = proxyUrl()
    process.env.NO_PROXY = '127.0.0.1'
    process.env.AWS_ENDPOINT_URL = 'https://emulator.example.com:9297'
    // The stand-in proxy refuses the CONNECT tunnel to that host
    await expect(callerIdentity()).rejects.toThrow()
    expect(reached).toEqual({ endpoint: 0, proxy: 1 })
  })

  test('without a configured endpoint every request takes the proxy, as before', async () => {
    process.env.HTTP_PROXY = proxyUrl()
    process.env.NO_PROXY = '127.0.0.1'
    // An endpoint the code passes to the client is not a configured endpoint, so NO_PROXY listing
    // its host changes nothing: the stand-in proxy gets the CONNECT and refuses it.
    await expect(
      callerIdentity({ endpoint: 'https://127.0.0.1:9297' }),
    ).rejects.toThrow()
    expect(reached).toEqual({ endpoint: 0, proxy: 1 })
  })

  test('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS keeps the proxy for every request', async () => {
    process.env.HTTP_PROXY = proxyUrl()
    process.env.NO_PROXY = '127.0.0.1'
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    // The SDK then calls AWS's STS endpoint through the proxy, which refuses the tunnel
    await expect(callerIdentity()).rejects.toThrow()
    expect(reached).toEqual({ endpoint: 0, proxy: 1 })
  })

  test('without a proxy the configured endpoint is reached directly, as before', async () => {
    process.env.NO_PROXY = '127.0.0.1'
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    await callerIdentity()
    expect(reached).toEqual({ endpoint: 1, proxy: 0 })
  })
})
