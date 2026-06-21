import { jest } from '@jest/globals'
import { CloudflareKv } from '../../../src/lib/resolvers/providers/cloudflare-kv/cloudflare-kv.js'

describe('Cloudflare KV Resolver', () => {
  let mockLogger
  let originalEnv
  let originalFetch

  const createResolver = (providerConfig = {}) =>
    new CloudflareKv({
      logger: mockLogger,
      providerConfig: { type: 'cloudflareKv', ...providerConfig },
      serviceConfigFile: {},
      configFileDirPath: '/test',
      options: {},
      stage: 'dev',
      dashboard: null,
      composeParams: null,
      resolveVariableFunc: null,
      resolveConfigurationPropertyFunc: null,
      versionFramework: '4.0.0',
    })

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    originalEnv = { ...process.env }
    originalFetch = global.fetch
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  describe('validateConfig', () => {
    test('accepts valid config', () => {
      expect(() =>
        CloudflareKv.validateConfig({
          type: 'cloudflareKv',
          accountId: 'my-account',
          namespaceId: 'my-namespace',
          apiToken: 'my-token',
        }),
      ).not.toThrow()
    })

    test('rejects unknown properties', () => {
      expect(() =>
        CloudflareKv.validateConfig({
          type: 'cloudflareKv',
          unknown: 'value',
        }),
      ).toThrow()
    })
  })

  describe('resolveCredentials', () => {
    test('uses config values', async () => {
      const resolver = createResolver({
        apiToken: 'config-token',
        accountId: 'config-account',
      })
      const credentials = await resolver.resolveCredentials()
      expect(credentials.apiToken).toBe('config-token')
      expect(credentials.accountId).toBe('config-account')
    })

    test('falls back to environment variables', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'env-token'
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account'
      const resolver = createResolver({})
      const credentials = await resolver.resolveCredentials()
      expect(credentials.apiToken).toBe('env-token')
      expect(credentials.accountId).toBe('env-account')
    })
  })

  describe('resolveVariable', () => {
    test('resolves KV value with namespaceId in config', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'my-value',
      })

      const resolver = createResolver({
        apiToken: 'test-token',
        accountId: 'my-account',
        namespaceId: 'my-namespace',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'cloudflareKv',
        resolutionDetails: {},
        key: 'my-key',
      })

      expect(result).toBe('my-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/accounts/my-account/storage/kv/namespaces/my-namespace/values/my-key',
        ),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      )
    })

    test('resolves KV value with namespaceId in key', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'ns-value',
      })

      const resolver = createResolver({
        apiToken: 'test-token',
        accountId: 'my-account',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'cloudflareKv',
        resolutionDetails: {},
        key: 'my-namespace/my-key',
      })

      expect(result).toBe('ns-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/namespaces/my-namespace/values/my-key'),
        expect.any(Object),
      )
    })

    test('throws when no API token is provided', async () => {
      const resolver = createResolver({
        accountId: 'my-account',
        namespaceId: 'my-namespace',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'cloudflareKv',
          resolutionDetails: {},
          key: 'my-key',
        }),
      ).rejects.toThrow('No Cloudflare API token provided')
    })

    test('throws when no account ID is provided', async () => {
      const resolver = createResolver({
        apiToken: 'test-token',
        namespaceId: 'my-namespace',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'cloudflareKv',
          resolutionDetails: {},
          key: 'my-key',
        }),
      ).rejects.toThrow('No Cloudflare account ID provided')
    })

    test('throws when no namespace ID is provided', async () => {
      const resolver = createResolver({
        apiToken: 'test-token',
        accountId: 'my-account',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'cloudflareKv',
          resolutionDetails: {},
          key: 'my-key',
        }),
      ).rejects.toThrow('No namespace ID specified')
    })

    test('throws on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
        text: async () => 'key not found',
      })

      const resolver = createResolver({
        apiToken: 'test-token',
        accountId: 'my-account',
        namespaceId: 'my-namespace',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'cloudflareKv',
          resolutionDetails: {},
          key: 'missing-key',
        }),
      ).rejects.toThrow('Error fetching value from Cloudflare KV')
    })

    test('throws for unsupported resolver type', async () => {
      const resolver = createResolver({
        apiToken: 'test-token',
        accountId: 'my-account',
        namespaceId: 'my-namespace',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'unknown',
          resolutionDetails: {},
          key: 'test',
        }),
      ).rejects.toThrow('Resolver unknown is not supported')
    })
  })
})
