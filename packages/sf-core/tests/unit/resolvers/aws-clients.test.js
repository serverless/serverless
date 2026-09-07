import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { jest } from '@jest/globals'
import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { S3Client } from '@aws-sdk/client-s3'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STSClient } from '@aws-sdk/client-sts'

const mockAddProxyToAwsClient = jest.fn((client) => client)

jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: mockAddProxyToAwsClient,
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options = {}) {
      super(message)
      this.code = code
      this.originalMessage = options.originalMessage
      this.originalName = options.originalName
    }
  },
  ServerlessErrorCodes: {
    resolvers: {
      RESOLVER_AWS_RATE_EXCEEDED: 'RESOLVER_AWS_RATE_EXCEEDED',
      RESOLVER_INVALID_CF_ADDRESS: 'RESOLVER_INVALID_CF_ADDRESS',
    },
  },
}))

const {
  createClient,
  resetAwsResolverState,
  MAX_SOCKETS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_MODE,
} = await import('../../../src/lib/resolvers/providers/aws/clients.js')

const credentials = { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' }
const region = 'us-east-1'
const originalEnv = { ...process.env }
const tempDirs = []

/** A throwaway directory holding an `~/.aws/config` stand-in, removed in `afterAll`. */
const makeConfigDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-aws-config-'))
  tempDirs.push(dir)
  return dir
}

describe('AWS resolver client factory', () => {
  beforeEach(() => {
    // Isolate from the developer's ~/.aws/config and shell.
    process.env.AWS_CONFIG_FILE = '/nonexistent/aws-config'
    process.env.AWS_SHARED_CREDENTIALS_FILE = '/nonexistent/aws-credentials'
    delete process.env.AWS_PROFILE
    delete process.env.AWS_MAX_ATTEMPTS
    delete process.env.AWS_RETRY_MODE
    mockAddProxyToAwsClient.mockReset()
    mockAddProxyToAwsClient.mockImplementation((client) => client)
    resetAwsResolverState()
  })

  afterAll(() => {
    process.env = originalEnv
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
  })

  test('builds the client class for each supported service', () => {
    expect(
      createClient({ service: 'cloudformation', credentials, region }),
    ).toBeInstanceOf(CloudFormationClient)
    expect(
      createClient({ service: 'ssm', credentials, region }),
    ).toBeInstanceOf(SSMClient)
    expect(createClient({ service: 's3', credentials, region })).toBeInstanceOf(
      S3Client,
    )
    expect(
      createClient({ service: 'sts', credentials, region }),
    ).toBeInstanceOf(STSClient)
  })

  test('rejects an unsupported service', () => {
    expect(() =>
      createClient({ service: 'dynamodb', credentials, region }),
    ).toThrow('Unsupported AWS resolver service: dynamodb')
  })

  test('passes region and follows S3 region redirects', async () => {
    const s3 = createClient({ service: 's3', credentials, region: 'eu-west-1' })
    expect(await s3.config.region()).toBe('eu-west-1')
    expect(s3.config.followRegionRedirects).toBe(true)
  })

  test('every client shares one keep-alive request handler with a 500-socket pool', async () => {
    const a = createClient({ service: 'cloudformation', credentials, region })
    const b = createClient({ service: 'ssm', credentials, region })
    expect(a.config.requestHandler).toBe(b.config.requestHandler)
    const handlerConfig = await a.config.requestHandler.configProvider
    expect(handlerConfig.httpsAgent.keepAlive).toBe(true)
    expect(handlerConfig.httpsAgent.maxSockets).toBe(MAX_SOCKETS)
    expect(MAX_SOCKETS).toBe(500)
  })

  test('defaults to standard retries with 10 attempts when nothing is configured', async () => {
    const client = createClient({
      service: 'cloudformation',
      credentials,
      region,
    })
    expect(await client.config.maxAttempts()).toBe(DEFAULT_MAX_ATTEMPTS)
    expect(await client.config.retryMode()).toBe(DEFAULT_RETRY_MODE)
    expect(DEFAULT_MAX_ATTEMPTS).toBe(10)
    expect(DEFAULT_RETRY_MODE).toBe('standard')
  })

  test('AWS_MAX_ATTEMPTS and AWS_RETRY_MODE override the framework defaults', async () => {
    process.env.AWS_MAX_ATTEMPTS = '4'
    process.env.AWS_RETRY_MODE = 'adaptive'
    const client = createClient({ service: 'ssm', credentials, region })
    expect(await client.config.maxAttempts()).toBe(4)
    expect(await client.config.retryMode()).toBe('adaptive')
  })

  test('~/.aws/config max_attempts and retry_mode override the framework defaults', async () => {
    const configFile = path.join(makeConfigDir(), 'config')
    fs.writeFileSync(
      configFile,
      '[default]\nmax_attempts = 6\nretry_mode = adaptive\n',
    )
    process.env.AWS_CONFIG_FILE = configFile
    const client = createClient({
      service: 'cloudformation',
      credentials,
      region,
    })
    expect(await client.config.maxAttempts()).toBe(6)
    expect(await client.config.retryMode()).toBe('adaptive')
  })

  test('environment variables win over ~/.aws/config', async () => {
    const configFile = path.join(makeConfigDir(), 'config')
    fs.writeFileSync(configFile, '[default]\nmax_attempts = 6\n')
    process.env.AWS_CONFIG_FILE = configFile
    process.env.AWS_MAX_ATTEMPTS = '4'
    const client = createClient({
      service: 'cloudformation',
      credentials,
      region,
    })
    expect(await client.config.maxAttempts()).toBe(4)
  })

  test('applies the proxy helper with the shared pool size and reuses the first proxied handler', () => {
    let installed = 0
    mockAddProxyToAwsClient.mockImplementation((client) => {
      installed += 1
      client.config.requestHandler = { handle: jest.fn(), id: installed }
      return client
    })
    const a = createClient({ service: 'cloudformation', credentials, region })
    const b = createClient({ service: 'sts', credentials, region })
    expect(mockAddProxyToAwsClient).toHaveBeenCalledTimes(2)
    expect(mockAddProxyToAwsClient.mock.calls[0][1]).toEqual({
      agentOptions: { maxSockets: 500 },
    })
    expect(a.config.requestHandler).toEqual({
      handle: expect.any(Function),
      id: 1,
    })
    expect(b.config.requestHandler).toBe(a.config.requestHandler)
  })

  test('a request-handler override replaces the shared handler (test seam)', () => {
    const fake = { handle: jest.fn() }
    resetAwsResolverState({ requestHandler: fake })
    const client = createClient({
      service: 'cloudformation',
      credentials,
      region,
    })
    expect(client.config.requestHandler).toBe(fake)
  })
})
