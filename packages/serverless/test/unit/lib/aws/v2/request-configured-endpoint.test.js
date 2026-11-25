// The AWS SDK v2 requests (provider.request) follow the endpoint the user configured with
// AWS_ENDPOINT_URL, AWS_ENDPOINT_URL_<SERVICE> or endpoint_url in the shared config file, as the
// AWS SDK v3 clients the CLI creates already do, so one command talks to one endpoint. Without such
// a setting, the clients are created exactly as before.
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

// The request module reads the proxy variables once, when it loads: load it without a proxy, so
// these tests behave the same on a machine that has one. The proxy case has its own test file.
const PROXY_VARIABLES = [
  'proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
]
const savedProxy = Object.fromEntries(
  PROXY_VARIABLES.map((name) => [name, process.env[name]]),
)
for (const name of PROXY_VARIABLES) delete process.env[name]
const { default: sdk } = await import('../../../../../lib/aws/v2/sdk.js')
const { default: awsRequest } =
  await import('../../../../../lib/aws/v2/request.js')

const VARIABLES = [
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_S3',
  'AWS_ENDPOINT_URL_CLOUDFORMATION',
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_PROFILE',
]

const DESCRIBE_STACKS = `<DescribeStacksResponse xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/">
  <DescribeStacksResult><Stacks/></DescribeStacksResult>
  <ResponseMetadata><RequestId>1</RequestId></ResponseMetadata>
</DescribeStacksResponse>`

const credentials = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
  region: 'us-east-1',
}

let server
let requests
let saved
let tmpDir
let serviceCount = 0

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, host: req.headers.host })
    req.resume()
    req.on('end', () => {
      if (req.headers.host.startsWith('127.0.0.1') && req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/xml' })
        res.end(DESCRIBE_STACKS)
        return
      }
      // S3 HeadBucket and anything else
      res.writeHead(200)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
})
afterAll(async () => {
  for (const [name, value] of Object.entries(savedProxy)) {
    if (value !== undefined) process.env[name] = value
  }
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})
beforeEach(() => {
  requests = []
  saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]))
  for (const name of VARIABLES) delete process.env[name]
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-v2-endpoint-'))
  process.env.AWS_CONFIG_FILE = path.join(tmpDir, 'missing-config')
  process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(tmpDir, 'missing-creds')
})
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete sdk.config.cloudformation
})

const endpointUrl = () => `http://127.0.0.1:${server.address().port}`

// Each test uses its own credentials, so the memoized client of one test never serves another.
const serviceFor = (name) => ({
  name,
  params: { ...credentials, accessKeyId: `AKID${++serviceCount}` },
})

/**
 * Replaces the SDK's client class for `name` while `run` runs, recording the options each client
 * is created with and answering `method` without a network call.
 */
const recordClients = async (name, method, run) => {
  const Original = sdk[name]
  const created = []
  // A plain function, since the SDK's client classes can't be extended with `class`; it keeps
  // the class's static members (serviceIdentifier, apiVersions).
  function Recorder(options) {
    created.push(options)
    const client = new Original(options)
    client[method] = () => ({ promise: async () => ({}) })
    return client
  }
  Object.setPrototypeOf(Recorder, Original)
  sdk[name] = Recorder
  try {
    await run()
  } finally {
    sdk[name] = Original
  }
  return created
}

describe('AWS SDK v2 requests without a configured endpoint', () => {
  test('create the client with the same options as before', async () => {
    const service = serviceFor('CloudFormation')
    const created = await recordClients(
      'CloudFormation',
      'describeStacks',
      () => awsRequest(service, 'describeStacks', {}),
    )
    expect(created).toEqual([service.params])
  })

  test('create the S3 client with the same options as before', async () => {
    const service = serviceFor('S3')
    const created = await recordClients('S3', 'headBucket', () =>
      awsRequest(service, 'headBucket', { Bucket: 'b' }),
    )
    expect(created).toEqual([
      { ...service.params, useAccelerateEndpoint: false },
    ])
  })

  test('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS turns the settings off', async () => {
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    const service = serviceFor('CloudFormation')
    const created = await recordClients(
      'CloudFormation',
      'describeStacks',
      () => awsRequest(service, 'describeStacks', {}),
    )
    expect(created).toEqual([service.params])
  })
})

describe('AWS SDK v2 requests with a configured endpoint', () => {
  test('AWS_ENDPOINT_URL sends the request to that endpoint', async () => {
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    const result = await awsRequest(
      serviceFor('CloudFormation'),
      'describeStacks',
      {},
    )
    expect(result.Stacks).toEqual([])
    expect(requests).toEqual([
      { method: 'POST', url: '/', host: `127.0.0.1:${server.address().port}` },
    ])
  })

  test('AWS_ENDPOINT_URL_<SERVICE> wins over AWS_ENDPOINT_URL', async () => {
    process.env.AWS_ENDPOINT_URL = 'http://127.0.0.1:1'
    process.env.AWS_ENDPOINT_URL_CLOUDFORMATION = endpointUrl()
    await awsRequest(serviceFor('CloudFormation'), 'describeStacks', {})
    expect(requests).toHaveLength(1)
  })

  test('endpoint_url in the shared config file sends the request there', async () => {
    // The shape AWS Emulator writes to ~/.aws/emulator/<port>/config
    const configFile = path.join(tmpDir, 'emulator-config')
    fs.writeFileSync(
      configFile,
      `[default]\nregion = us-east-1\nendpoint_url = ${endpointUrl()}\n`,
    )
    process.env.AWS_CONFIG_FILE = configFile
    await awsRequest(serviceFor('CloudFormation'), 'describeStacks', {})
    expect(requests).toHaveLength(1)
  })

  test('S3 puts the bucket in the path when the endpoint host is an IP address', async () => {
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    await awsRequest(serviceFor('S3'), 'headBucket', { Bucket: 'my-bucket' })
    expect(requests).toEqual([
      {
        method: 'HEAD',
        url: '/my-bucket',
        host: `127.0.0.1:${server.address().port}`,
      },
    ])
  })

  test('S3 keeps the bucket in the host name for a host name endpoint, as the v3 clients do', async () => {
    process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.emulator.test:4566'
    const service = serviceFor('S3')
    const created = await recordClients('S3', 'headBucket', () =>
      awsRequest(service, 'headBucket', { Bucket: 'b' }),
    )
    expect(created).toEqual([
      {
        ...service.params,
        useAccelerateEndpoint: false,
        endpoint: 'http://s3.emulator.test:4566',
      },
    ])
  })

  test('S3 Transfer Acceleration does not override the configured endpoint', async () => {
    process.env.AWS_ENDPOINT_URL = endpointUrl()
    const service = serviceFor('S3')
    service.params.isS3TransferAccelerationEnabled = true
    const created = await recordClients('S3', 'upload', () =>
      awsRequest(service, 'upload', { Bucket: 'b', Key: 'k', Body: 'x' }),
    )
    expect(created[0]).toMatchObject({
      endpoint: endpointUrl(),
      useAccelerateEndpoint: false,
      s3ForcePathStyle: true,
    })
  })

  test('an endpoint set in the SDK configuration (serverless-localstack) keeps applying', async () => {
    process.env.AWS_ENDPOINT_URL = 'http://127.0.0.1:1'
    sdk.config.update({ cloudformation: { endpoint: endpointUrl() } })
    const service = serviceFor('CloudFormation')
    const created = await recordClients(
      'CloudFormation',
      'describeStacks',
      () => awsRequest(service, 'describeStacks', {}),
    )
    expect(created).toEqual([service.params])
  })

  test('an endpoint passed with the request keeps applying', async () => {
    process.env.AWS_ENDPOINT_URL = 'http://127.0.0.1:1'
    const service = serviceFor('CloudFormation')
    service.params.endpoint = endpointUrl()
    await awsRequest(service, 'describeStacks', {})
    expect(requests).toHaveLength(1)
  })
})
