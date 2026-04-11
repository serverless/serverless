import { jest } from '@jest/globals'
import { GcpSecretManager } from '../../../src/lib/resolvers/providers/gcp-secret-manager/gcp-secret-manager.js'

describe('GCP Secret Manager Resolver', () => {
  let mockLogger
  let originalEnv
  let originalFetch

  const createResolver = (providerConfig = {}) =>
    new GcpSecretManager({
      logger: mockLogger,
      providerConfig: { type: 'gcpSecretManager', ...providerConfig },
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
        GcpSecretManager.validateConfig({
          type: 'gcpSecretManager',
          project: 'my-project',
          token: 'my-token',
          version: '1',
        }),
      ).not.toThrow()
    })

    test('rejects unknown properties', () => {
      expect(() =>
        GcpSecretManager.validateConfig({
          type: 'gcpSecretManager',
          unknown: 'value',
        }),
      ).toThrow()
    })
  })

  describe('resolveCredentials', () => {
    test('uses config values', async () => {
      const resolver = createResolver({
        token: 'config-token',
        project: 'config-project',
      })
      const credentials = await resolver.resolveCredentials()
      expect(credentials.token).toBe('config-token')
      expect(credentials.project).toBe('config-project')
    })

    test('falls back to environment variables', async () => {
      process.env.GCP_ACCESS_TOKEN = 'env-token'
      process.env.GCP_PROJECT = 'env-project'
      const resolver = createResolver({})
      const credentials = await resolver.resolveCredentials()
      expect(credentials.token).toBe('env-token')
      expect(credentials.project).toBe('env-project')
    })
  })

  describe('resolveVariable', () => {
    test('resolves secret by name', async () => {
      const secretValue = 'my-secret-value'
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          payload: {
            data: Buffer.from(secretValue).toString('base64'),
          },
        }),
      })

      const resolver = createResolver({
        token: 'test-token',
        project: 'my-project',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'gcpSecretManager',
        resolutionDetails: {},
        key: 'my-secret',
      })

      expect(result).toBe('my-secret-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'projects/my-project/secrets/my-secret/versions/latest:access',
        ),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      )
    })

    test('resolves secret with project in key', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          payload: {
            data: Buffer.from('value').toString('base64'),
          },
        }),
      })

      const resolver = createResolver({ token: 'test-token' })

      const result = await resolver.resolveVariable({
        resolverType: 'gcpSecretManager',
        resolutionDetails: {},
        key: 'other-project/my-secret',
      })

      expect(result).toBe('value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('projects/other-project/secrets/my-secret'),
        expect.any(Object),
      )
    })

    test('resolves secret with specific version', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          payload: {
            data: Buffer.from('versioned-value').toString('base64'),
          },
        }),
      })

      const resolver = createResolver({
        token: 'test-token',
        project: 'my-project',
        version: '5',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'gcpSecretManager',
        resolutionDetails: {},
        key: 'my-secret',
      })

      expect(result).toBe('versioned-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('versions/5:access'),
        expect.any(Object),
      )
    })

    test('throws when no token is provided', async () => {
      const resolver = createResolver({ project: 'my-project' })

      await expect(
        resolver.resolveVariable({
          resolverType: 'gcpSecretManager',
          resolutionDetails: {},
          key: 'my-secret',
        }),
      ).rejects.toThrow('No GCP access token provided')
    })

    test('throws when no project is provided', async () => {
      const resolver = createResolver({ token: 'test-token' })

      await expect(
        resolver.resolveVariable({
          resolverType: 'gcpSecretManager',
          resolutionDetails: {},
          key: 'my-secret',
        }),
      ).rejects.toThrow('No GCP project specified')
    })

    test('throws on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
        text: async () => 'secret not found',
      })

      const resolver = createResolver({
        token: 'test-token',
        project: 'my-project',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'gcpSecretManager',
          resolutionDetails: {},
          key: 'missing-secret',
        }),
      ).rejects.toThrow('Error fetching secret from GCP Secret Manager')
    })

    test('throws for unsupported resolver type', async () => {
      const resolver = createResolver({
        token: 'test-token',
        project: 'my-project',
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
