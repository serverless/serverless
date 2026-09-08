import { Readable } from 'node:stream'
import { jest } from '@jest/globals'

const mockSendAwsRequest = jest.fn()

jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/clients.js',
  () => ({ sendAwsRequest: mockSendAwsRequest }),
)

const { Terraform, resetTerraformOutputsCache } =
  await import('../../../src/lib/resolvers/providers/terraform/terraform.js')

/** A Terraform v4 state document with the given outputs, as S3 would return it. */
const stateDocument = (outputs) =>
  JSON.stringify({
    version: 4,
    terraform_version: '1.9.0',
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, value]) => [
        name,
        { value, type: typeof value === 'string' ? 'string' : ['object', {}] },
      ]),
    ),
  })

/** One S3 GetObject output whose Body streams `body` exactly once. */
const s3Response = (body) => ({ Body: Readable.from([Buffer.from(body)]) })

const s3Config = (overrides = {}) => ({
  type: 'terraform',
  backend: 's3',
  bucket: 'state-bucket',
  key: 'prod/network.tfstate',
  region: 'us-east-1',
  ...overrides,
})

/** A provider instance the way the ResolverManager builds one — one per service. */
const provider = (providerConfig) =>
  new Terraform({
    logger: { debug: jest.fn(), info: jest.fn() },
    providerConfig,
    serviceConfigFile: {},
    configFileDirPath: '/tmp',
    options: {},
    stage: 'dev',
  })

const resolve = (instance, key) =>
  instance.resolveVariable({
    resolverType: 'outputs',
    resolutionDetails: null,
    key,
  })

describe('Terraform resolver', () => {
  beforeEach(() => {
    resetTerraformOutputsCache()
    mockSendAwsRequest.mockReset()
  })

  describe('validateConfig', () => {
    test('accepts the s3, remote and http backends', () => {
      expect(() => Terraform.validateConfig(s3Config())).not.toThrow()
      expect(() =>
        Terraform.validateConfig({
          type: 'terraform',
          backend: 'remote',
          organization: 'my-org',
          workspace: 'my-workspace',
        }),
      ).not.toThrow()
      expect(() =>
        Terraform.validateConfig({
          type: 'terraform',
          backend: 'http',
          address: 'https://state.example.com/prod',
        }),
      ).not.toThrow()
    })

    test('rejects an unknown backend with the documented message', () => {
      expect(() =>
        Terraform.validateConfig({ type: 'terraform', backend: 'gcs' }),
      ).toThrow(
        'Only the "s3", "remote", and "http" backends are supported at this time',
      )
    })

    test('rejects an s3 backend without a bucket', () => {
      const { bucket, ...withoutBucket } = s3Config()
      expect(() => Terraform.validateConfig(withoutBucket)).toThrow(
        "The 'bucket' property is required and must be a string",
      )
    })

    test('rejects unknown keys on the s3 backend', () => {
      expect(() =>
        Terraform.validateConfig(s3Config({ profile: 'other' })),
      ).toThrow(
        "Only 'bucket', 'key', and 'region' are allowed in the s3 backend configuration (unrecognized: 'profile')",
      )
    })

    test('rejects unknown keys on the http backend', () => {
      expect(() =>
        Terraform.validateConfig({
          type: 'terraform',
          backend: 'http',
          address: 'https://state.example.com/prod',
          profile: 'other',
        }),
      ).toThrow(
        "Only 'address', 'username', and 'password' are allowed in the http backend configuration (unrecognized: 'profile')",
      )
    })

    test('rejects unknown keys on the remote backend', () => {
      expect(() =>
        Terraform.validateConfig({
          type: 'terraform',
          backend: 'remote',
          workspaceId: 'ws-123',
          profile: 'other',
        }),
      ).toThrow(
        "Only 'token', 'hostname', 'workspaceId', 'workspace', and 'organization' are allowed in the remote backend configuration (unrecognized: 'profile')",
      )
    })

    test("keeps zod's own message for a wrong field type", () => {
      // The allowed-keys text is attached to the object schema, so it must not
      // replace the message a failing field raises.
      let message
      try {
        Terraform.validateConfig({
          type: 'terraform',
          backend: 'http',
          address: 42,
        })
      } catch (error) {
        message = error.message
      }
      expect(message).toContain('expected string')
      expect(message).not.toContain("Only 'address'")
    })

    test('rejects a remote backend with neither workspaceId nor organization/workspace', () => {
      expect(() =>
        Terraform.validateConfig({ type: 'terraform', backend: 'remote' }),
      ).toThrow(
        "Either 'workspaceId' or 'organization' and 'workspace' are required",
      )
    })
  })

  describe('s3 backend', () => {
    test('sends one GetObject through the shared layer as the terraform service and returns the output', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(stateDocument({ vpc_id: 'vpc-123' })),
      )

      const instance = provider(s3Config())
      const value = await resolve(instance, 'vpc_id')

      expect(value).toBe('vpc-123')
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)
      const request = mockSendAwsRequest.mock.calls[0][0]
      expect(request.service).toBe('terraform')
      expect(request.region).toBe('us-east-1')
      expect(request.target).toBe('state-bucket/prod/network.tfstate')
      expect(request.command.input).toEqual({
        Bucket: 'state-bucket',
        Key: 'prod/network.tfstate',
      })
      expect(request.cache).toBeUndefined()
      expect(typeof request.credentials).toBe('function')
      expect(request.logger).toBe(instance.logger)
    })

    test('reads nested output values with dotted keys', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(stateDocument({ network: { subnets: { a: 'subnet-a' } } })),
      )

      await expect(
        resolve(provider(s3Config()), 'network.subnets.a'),
      ).resolves.toBe('subnet-a')
    })

    test('returns undefined for an output that is not in the state', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(stateDocument({ a: '1' })),
      )

      await expect(
        resolve(provider(s3Config()), 'missing'),
      ).resolves.toBeUndefined()
    })

    test('a state document without outputs resolves to undefined', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(JSON.stringify({ version: 4, terraform_version: '1.9.0' })),
      )

      await expect(resolve(provider(s3Config()), 'a')).resolves.toBeUndefined()
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)
    })

    test('passes the same credential provider to every request', async () => {
      // A fresh body per call: the response body is a stream, read once.
      mockSendAwsRequest.mockImplementation(async () =>
        s3Response(stateDocument({ a: '1' })),
      )

      await resolve(provider(s3Config()), 'a')
      await resolve(provider(s3Config({ key: 'prod/other.tfstate' })), 'a')

      const [first, second] = mockSendAwsRequest.mock.calls.map(([r]) => r)
      expect(first.credentials).toBe(second.credentials)
    })

    test('leaves the region undefined when the resolver has none, so the SDK default chain applies', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(stateDocument({ a: '1' })),
      )
      const { region, ...withoutRegion } = s3Config()

      await resolve(provider(withoutRegion), 'a')

      expect(mockSendAwsRequest.mock.calls[0][0].region).toBeUndefined()
    })

    test('wraps SDK errors exactly as before', async () => {
      const noSuchKey = Object.assign(
        new Error('The specified key does not exist.'),
        { name: 'NoSuchKey' },
      )
      mockSendAwsRequest.mockRejectedValue(noSuchKey)

      await expect(resolve(provider(s3Config()), 'a')).rejects.toThrow(
        'Error fetching Terraform outputs from S3: NoSuchKey: The specified key does not exist.',
      )
    })

    test('wraps a body-read failure exactly as before, without retrying', async () => {
      const cut = new Readable({
        read() {
          this.push('{"outputs":')
          this.destroy(
            Object.assign(new Error('aborted'), { code: 'ECONNRESET' }),
          )
        },
      })
      mockSendAwsRequest.mockResolvedValue({ Body: cut })

      await expect(resolve(provider(s3Config()), 'a')).rejects.toThrow(
        'Error fetching Terraform outputs from S3: Error: aborted',
      )
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)
    })

    test('lets a ServerlessError from the shared layer through untouched', async () => {
      const { ServerlessError } = await import('@serverless/util')
      const rateExceeded = new ServerlessError(
        'Amazon S3 rejected GetObject with "SlowDown: Please reduce your request rate." after 10 attempts (58 s).',
        'RESOLVER_AWS_RATE_EXCEEDED',
      )
      mockSendAwsRequest.mockRejectedValue(rateExceeded)

      await expect(resolve(provider(s3Config()), 'a')).rejects.toBe(
        rateExceeded,
      )
    })

    test('fetches one state file once per process, shared across placeholders and provider instances', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(stateDocument({ a: 'one', b: 'two', c: 'three' })),
      )
      const serviceA = provider(s3Config())
      const serviceB = provider(s3Config())

      const values = await Promise.all([
        resolve(serviceA, 'a'),
        resolve(serviceA, 'b'),
        resolve(serviceA, 'c'),
        resolve(serviceB, 'a'),
        resolve(serviceB, 'b'),
      ])

      expect(values).toEqual(['one', 'two', 'three', 'one', 'two'])
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)
    })

    test('hands each placeholder its own copy of an object-valued output', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(stateDocument({ network: { subnets: { a: 'subnet-a' } } })),
      )
      const serviceA = provider(s3Config())
      const serviceB = provider(s3Config())

      const first = await resolve(serviceA, 'network')
      first.subnets.a = 'mutated'

      const second = await resolve(serviceB, 'network')
      const third = await resolve(serviceA, 'network.subnets')

      expect(second).toEqual({ subnets: { a: 'subnet-a' } })
      expect(third).toEqual({ a: 'subnet-a' })
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)
    })

    test('a different bucket, key or region is a different fetch', async () => {
      mockSendAwsRequest.mockImplementation(async () =>
        s3Response(stateDocument({ a: '1' })),
      )

      await resolve(provider(s3Config()), 'a')
      await resolve(provider(s3Config({ key: 'prod/data.tfstate' })), 'a')
      await resolve(provider(s3Config({ bucket: 'other-bucket' })), 'a')
      await resolve(provider(s3Config({ region: 'eu-west-1' })), 'a')

      expect(mockSendAwsRequest).toHaveBeenCalledTimes(4)
    })

    test('a failed fetch is shared by the placeholders in flight and then forgotten', async () => {
      const noSuchKey = Object.assign(
        new Error('The specified key does not exist.'),
        { name: 'NoSuchKey' },
      )
      mockSendAwsRequest
        .mockRejectedValueOnce(noSuchKey)
        .mockResolvedValueOnce(s3Response(stateDocument({ a: 'later' })))
      const instance = provider(s3Config())

      const results = await Promise.allSettled([
        resolve(instance, 'a'),
        resolve(instance, 'b'),
      ])
      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)

      await expect(resolve(instance, 'a')).resolves.toBe('later')
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(2)
    })

    test('the runners cache invalidation does not drop Terraform state', async () => {
      mockSendAwsRequest.mockResolvedValue(
        s3Response(stateDocument({ a: '1' })),
      )
      const instance = provider(s3Config())

      await resolve(instance, 'a')
      Terraform.invalidateCaches()
      await resolve(provider(s3Config()), 'a')

      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)
    })
  })
})

describe('Terraform resolver — remote and http backends', () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TF_TOKEN_app_terraform_io
  let fetchCalls

  const outputsPayload = (outputs) => ({
    data: Object.entries(outputs).map(([name, value]) => ({
      attributes: { name, value },
    })),
  })

  beforeEach(() => {
    resetTerraformOutputsCache()
    fetchCalls = []
    process.env.TF_TOKEN_app_terraform_io = 'test-token'
    globalThis.fetch = async (url) => {
      const href = String(url)
      fetchCalls.push(href)
      if (href.includes('/organizations/')) {
        return {
          ok: true,
          json: async () => ({ data: { id: 'ws-123' } }),
        }
      }
      if (href.includes('current-state-version-outputs')) {
        return {
          ok: true,
          json: async () => outputsPayload({ a: 'remote-a', b: 'remote-b' }),
        }
      }
      // http backend: the state document itself
      return {
        ok: true,
        json: async () => ({
          outputs: { a: { value: 'http-a' }, b: { value: 'http-b' } },
        }),
      }
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalToken === undefined)
      delete process.env.TF_TOKEN_app_terraform_io
    else process.env.TF_TOKEN_app_terraform_io = originalToken
  })

  test('remote by organization and workspace: one workspace lookup and one outputs read per process', async () => {
    const config = {
      type: 'terraform',
      backend: 'remote',
      organization: 'my-org',
      workspace: 'my-workspace',
    }
    const serviceA = provider(config)
    const serviceB = provider(config)

    const values = await Promise.all([
      resolve(serviceA, 'a'),
      resolve(serviceA, 'b'),
      resolve(serviceB, 'a'),
    ])

    expect(values).toEqual(['remote-a', 'remote-b', 'remote-a'])
    expect(fetchCalls).toHaveLength(2)
    expect(fetchCalls[0]).toContain(
      '/organizations/my-org/workspaces/my-workspace',
    )
    expect(fetchCalls[1]).toContain(
      '/workspaces/ws-123/current-state-version-outputs',
    )
  })

  test('remote by workspaceId: one outputs read per process; another workspace is another read', async () => {
    const one = { type: 'terraform', backend: 'remote', workspaceId: 'ws-1' }
    const two = { type: 'terraform', backend: 'remote', workspaceId: 'ws-2' }

    await resolve(provider(one), 'a')
    await resolve(provider(one), 'b')
    await resolve(provider(two), 'a')

    expect(fetchCalls).toHaveLength(2)
  })

  test('remote: organization and workspace outrank a workspaceId in the memo key too', async () => {
    // The fetcher overwrites workspaceId with the id it looks up from
    // organization/workspace, so the key has to name the workspace that is
    // actually read - otherwise the second config is served the first one's
    // outputs.
    globalThis.fetch = async (url) => {
      const href = String(url)
      fetchCalls.push(href)
      if (href.includes('/organizations/')) {
        return { ok: true, json: async () => ({ data: { id: 'ws-2' } }) }
      }
      const [, readWorkspaceId] = href.match(/\/workspaces\/([^/]+)\//)
      return {
        ok: true,
        json: async () => outputsPayload({ a: `from-${readWorkspaceId}` }),
      }
    }
    const byId = { type: 'terraform', backend: 'remote', workspaceId: 'ws-1' }
    const byName = {
      type: 'terraform',
      backend: 'remote',
      workspaceId: 'ws-1',
      organization: 'my-org',
      workspace: 'w2',
    }

    await expect(resolve(provider(byId), 'a')).resolves.toBe('from-ws-1')
    await expect(resolve(provider(byName), 'a')).resolves.toBe('from-ws-2')

    expect(
      fetchCalls.filter((href) =>
        href.includes('current-state-version-outputs'),
      ),
    ).toHaveLength(2)
  })

  test('http: one read per address per process', async () => {
    const config = {
      type: 'terraform',
      backend: 'http',
      address: 'https://state.example.com/prod',
    }

    const values = await Promise.all([
      resolve(provider(config), 'a'),
      resolve(provider(config), 'b'),
    ])
    await resolve(
      provider({ ...config, address: 'https://state.example.com/staging' }),
      'a',
    )

    expect(values).toEqual(['http-a', 'http-b'])
    expect(fetchCalls).toHaveLength(2)
  })

  test('http: a failed read is forgotten so the next placeholder retries', async () => {
    let attempts = 0
    globalThis.fetch = async () => {
      attempts += 1
      if (attempts === 1) {
        return {
          ok: false,
          statusText: 'Not Found',
          text: async () => '{"message":"404"}',
        }
      }
      return {
        ok: true,
        json: async () => ({ outputs: { a: { value: 'ok' } } }),
      }
    }
    const config = {
      type: 'terraform',
      backend: 'http',
      address: 'https://state.example.com/prod',
    }

    await expect(resolve(provider(config), 'a')).rejects.toThrow(
      'Error fetching Terraform outputs from HTTP backend: Error: Not Found: {"message":"404"}',
    )
    await expect(resolve(provider(config), 'a')).resolves.toBe('ok')
    expect(attempts).toBe(2)
  })
})
