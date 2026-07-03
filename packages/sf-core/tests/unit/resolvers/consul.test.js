import { jest } from '@jest/globals'
import { Consul } from '../../../src/lib/resolvers/providers/consul/consul.js'

describe('Consul KV Resolver', () => {
  let mockLogger
  let originalEnv
  let originalFetch

  const createResolver = (providerConfig = {}) =>
    new Consul({
      logger: mockLogger,
      providerConfig: { type: 'consul', ...providerConfig },
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
        Consul.validateConfig({
          type: 'consul',
          address: 'http://consul:8500',
          token: 'my-token',
          datacenter: 'dc1',
          namespace: 'default',
        }),
      ).not.toThrow()
    })

    test('rejects unknown properties', () => {
      expect(() =>
        Consul.validateConfig({
          type: 'consul',
          unknown: 'value',
        }),
      ).toThrow()
    })
  })

  describe('resolveCredentials', () => {
    test('uses config values', async () => {
      const resolver = createResolver({
        token: 'config-token',
        address: 'http://consul:8500',
      })
      const credentials = await resolver.resolveCredentials()
      expect(credentials.token).toBe('config-token')
      expect(credentials.address).toBe('http://consul:8500')
    })

    test('falls back to environment variables', async () => {
      process.env.CONSUL_HTTP_TOKEN = 'env-token'
      process.env.CONSUL_HTTP_ADDR = 'http://env-consul:8500'
      const resolver = createResolver({})
      const credentials = await resolver.resolveCredentials()
      expect(credentials.token).toBe('env-token')
      expect(credentials.address).toBe('http://env-consul:8500')
    })

    test('defaults to localhost', async () => {
      const resolver = createResolver({})
      const credentials = await resolver.resolveCredentials()
      expect(credentials.address).toBe('http://localhost:8500')
    })
  })

  describe('resolveVariable', () => {
    test('resolves KV value', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'my-value',
      })

      const resolver = createResolver({
        address: 'http://consul:8500',
        token: 'test-token',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'consul',
        resolutionDetails: {},
        key: 'config/myapp/setting',
      })

      expect(result).toBe('my-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/kv/'),
        expect.objectContaining({
          headers: { 'X-Consul-Token': 'test-token' },
        }),
      )
    })

    test('resolves without token (no auth header)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'open-value',
      })

      const resolver = createResolver({
        address: 'http://consul:8500',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'consul',
        resolutionDetails: {},
        key: 'config/key',
      })

      expect(result).toBe('open-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: {} }),
      )
    })

    test('sends datacenter and namespace query params', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'dc-value',
      })

      const resolver = createResolver({
        address: 'http://consul:8500',
        datacenter: 'dc1',
        namespace: 'team-a',
      })

      await resolver.resolveVariable({
        resolverType: 'consul',
        resolutionDetails: {},
        key: 'config/key',
      })

      const calledUrl = global.fetch.mock.calls[0][0]
      expect(calledUrl).toContain('dc=dc1')
      expect(calledUrl).toContain('ns=team-a')
    })

    test('throws on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
        text: async () => 'key not found',
      })

      const resolver = createResolver({
        address: 'http://consul:8500',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'consul',
          resolutionDetails: {},
          key: 'missing/key',
        }),
      ).rejects.toThrow('Error fetching value from Consul KV')
    })

    test('throws for unsupported resolver type', async () => {
      const resolver = createResolver({
        address: 'http://consul:8500',
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
