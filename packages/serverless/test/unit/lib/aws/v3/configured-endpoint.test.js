// Every AWS SDK v3 client the Framework's v3 request path creates (SLS_AWS_SDK=3, and the calls
// that ask for it) sends its requests to the endpoint the user configured with AWS_ENDPOINT_URL,
// AWS_ENDPOINT_URL_<SERVICE> or endpoint_url in the shared config file, such as a local AWS
// Emulator, and keeps AWS's endpoints when none is configured. These tests use the real factory
// and SDK clients, and a local stand-in for the endpoint.
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import {
  afterAll,
  afterEach,
  beforeAll,
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
  'AWS_ENDPOINT_URL_CLOUDWATCH_LOGS',
  'AWS_ENDPOINT_URL_S3',
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_PROFILE',
]
const saved = Object.fromEntries(
  VARIABLES.map((name) => [name, process.env[name]]),
)
for (const name of VARIABLES) delete process.env[name]

const { createV3ClientFactory } =
  await import('../../../../../lib/aws/v3/client-factory.js')
const { default: v3Request } =
  await import('../../../../../lib/aws/v3/request.js')

// Every service the v3 request path serves, with the variable AWS names for it alone
const SERVICES = {
  S3: 'AWS_ENDPOINT_URL_S3',
  STS: 'AWS_ENDPOINT_URL_STS',
  ECR: 'AWS_ENDPOINT_URL_ECR',
  CloudFormation: 'AWS_ENDPOINT_URL_CLOUDFORMATION',
  CloudWatch: 'AWS_ENDPOINT_URL_CLOUDWATCH',
  CloudWatchLogs: 'AWS_ENDPOINT_URL_CLOUDWATCH_LOGS',
  Lambda: 'AWS_ENDPOINT_URL_LAMBDA',
  LambdaMicrovms: 'AWS_ENDPOINT_URL_LAMBDA_MICROVMS',
  IAM: 'AWS_ENDPOINT_URL_IAM',
  APIGateway: 'AWS_ENDPOINT_URL_API_GATEWAY',
  ApiGatewayV2: 'AWS_ENDPOINT_URL_APIGATEWAYV2',
  IoT: 'AWS_ENDPOINT_URL_IOT',
}

let server
let requests
let tmpDir
let keyCount = 0

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, host: req.headers.host })
    req.resume()
    req.on('end', () => {
      if (req.method === 'POST') {
        res.writeHead(200, { 'content-type': 'text/xml' })
        res.end(
          '<DescribeStacksResponse><DescribeStacksResult><Stacks/></DescribeStacksResult></DescribeStacksResponse>',
        )
        return
      }
      res.writeHead(200)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
})
afterAll(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})
beforeEach(() => {
  requests = []
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-v3-endpoint-'))
  process.env.AWS_CONFIG_FILE = path.join(tmpDir, 'missing-config')
  process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(tmpDir, 'missing-creds')
})
afterEach(() => {
  for (const name of VARIABLES) delete process.env[name]
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const endpointUrl = () => `http://127.0.0.1:${server.address().port}`

// Each call gets its own credentials, so no memoized client of an earlier test serves it.
const serviceFor = (name) => ({
  name,
  params: {
    accessKeyId: `AKIDV3${++keyCount}`,
    secretAccessKey: 'secret',
    region: 'us-east-1',
  },
})

const configuredEndpointOf = async (name) => {
  const { getV3Client } = createV3ClientFactory()
  const client = getV3Client(serviceFor(name), 'anyMethod')
  try {
    return await client.config.serviceConfiguredEndpoint()
  } finally {
    client.destroy()
  }
}

describe('AWS SDK v3 clients of the v3 request path', () => {
  test.each(Object.keys(SERVICES))(
    '%s uses no configured endpoint when none is set',
    async (name) => {
      await expect(configuredEndpointOf(name)).resolves.toBeUndefined()
    },
  )

  test.each(Object.keys(SERVICES))('%s uses AWS_ENDPOINT_URL', async (name) => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    await expect(configuredEndpointOf(name)).resolves.toBe(
      'https://127.0.0.1:9297',
    )
  })

  test.each(Object.entries(SERVICES))(
    '%s uses its own variable %s over AWS_ENDPOINT_URL',
    async (name, variable) => {
      process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
      process.env[variable] = 'http://127.0.0.1:4566'
      try {
        await expect(configuredEndpointOf(name)).resolves.toBe(
          'http://127.0.0.1:4566',
        )
      } finally {
        delete process.env[variable]
      }
    },
  )

  test.each(Object.keys(SERVICES))(
    '%s uses endpoint_url from the shared config file',
    async (name) => {
      // The shape AWS Emulator writes to ~/.aws/emulator/<port>/config
      const file = path.join(tmpDir, `config-${name}`)
      fs.writeFileSync(
        file,
        '[default]\nregion = us-east-1\nendpoint_url = https://127.0.0.1:9297\n',
      )
      process.env.AWS_CONFIG_FILE = file
      await expect(configuredEndpointOf(name)).resolves.toBe(
        'https://127.0.0.1:9297',
      )
    },
  )

  test('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS turns the settings off', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    await expect(configuredEndpointOf('CloudFormation')).resolves.toBe(
      undefined,
    )
  })

  test('a request reaches the configured endpoint', async () => {
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    const result = await v3Request(
      serviceFor('CloudFormation'),
      'describeStacks',
      {},
    )
    expect(result.Stacks).toEqual([])
    expect(requests).toEqual([
      { method: 'POST', url: '/', host: `127.0.0.1:${server.address().port}` },
    ])
  })

  test('S3 puts the bucket in the path when the endpoint host is an IP address', async () => {
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    await v3Request(serviceFor('S3'), 'headBucket', { Bucket: 'my-bucket' })
    expect(requests).toEqual([
      {
        method: 'HEAD',
        url: '/my-bucket/',
        host: `127.0.0.1:${server.address().port}`,
      },
    ])
  })
})
