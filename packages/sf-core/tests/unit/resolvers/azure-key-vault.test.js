import { jest } from '@jest/globals'
import { AzureKeyVault } from '../../../src/lib/resolvers/providers/azure-key-vault/azure-key-vault.js'

describe('Azure Key Vault Resolver', () => {
  let mockLogger
  let originalEnv
  let originalFetch

  const createResolver = (providerConfig = {}) =>
    new AzureKeyVault({
      logger: mockLogger,
      providerConfig: { type: 'azureKeyVault', ...providerConfig },
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
        AzureKeyVault.validateConfig({
          type: 'azureKeyVault',
          vaultUrl: 'https://myvault.vault.azure.net',
          token: 'my-token',
          apiVersion: '7.4',
        }),
      ).not.toThrow()
    })

    test('rejects unknown properties', () => {
      expect(() =>
        AzureKeyVault.validateConfig({
          type: 'azureKeyVault',
          unknown: 'value',
        }),
      ).toThrow()
    })
  })

  describe('resolveCredentials', () => {
    test('uses config values', async () => {
      const resolver = createResolver({
        token: 'config-token',
        vaultUrl: 'https://myvault.vault.azure.net',
      })
      const credentials = await resolver.resolveCredentials()
      expect(credentials.token).toBe('config-token')
      expect(credentials.vaultUrl).toBe('https://myvault.vault.azure.net')
    })

    test('falls back to environment variables', async () => {
      process.env.AZURE_ACCESS_TOKEN = 'env-token'
      process.env.AZURE_KEY_VAULT_URL = 'https://envvault.vault.azure.net'
      const resolver = createResolver({})
      const credentials = await resolver.resolveCredentials()
      expect(credentials.token).toBe('env-token')
      expect(credentials.vaultUrl).toBe('https://envvault.vault.azure.net')
    })
  })

  describe('resolveVariable', () => {
    test('resolves secret with vaultUrl in config', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ value: 'my-secret-value' }),
      })

      const resolver = createResolver({
        token: 'test-token',
        vaultUrl: 'https://myvault.vault.azure.net',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'azureKeyVault',
        resolutionDetails: {},
        key: 'my-secret',
      })

      expect(result).toBe('my-secret-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://myvault.vault.azure.net/secrets/my-secret',
        ),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      )
    })

    test('resolves secret with version in key', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ value: 'versioned-value' }),
      })

      const resolver = createResolver({
        token: 'test-token',
        vaultUrl: 'https://myvault.vault.azure.net',
      })

      const result = await resolver.resolveVariable({
        resolverType: 'azureKeyVault',
        resolutionDetails: {},
        key: 'my-secret/abc123',
      })

      expect(result).toBe('versioned-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/secrets/my-secret/abc123'),
        expect.any(Object),
      )
    })

    test('resolves secret with vault name in key', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ value: 'vault-value' }),
      })

      const resolver = createResolver({ token: 'test-token' })

      const result = await resolver.resolveVariable({
        resolverType: 'azureKeyVault',
        resolutionDetails: {},
        key: 'myvault/my-secret',
      })

      expect(result).toBe('vault-value')
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://myvault.vault.azure.net/secrets/my-secret',
        ),
        expect.any(Object),
      )
    })

    test('throws when no token is provided', async () => {
      const resolver = createResolver({
        vaultUrl: 'https://myvault.vault.azure.net',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'azureKeyVault',
          resolutionDetails: {},
          key: 'my-secret',
        }),
      ).rejects.toThrow('No Azure access token provided')
    })

    test('throws when no vault URL is provided and key has no vault name', async () => {
      const resolver = createResolver({ token: 'test-token' })

      await expect(
        resolver.resolveVariable({
          resolverType: 'azureKeyVault',
          resolutionDetails: {},
          key: 'my-secret',
        }),
      ).rejects.toThrow('No vault URL specified')
    })

    test('throws on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
        text: async () => 'secret not found',
      })

      const resolver = createResolver({
        token: 'test-token',
        vaultUrl: 'https://myvault.vault.azure.net',
      })

      await expect(
        resolver.resolveVariable({
          resolverType: 'azureKeyVault',
          resolutionDetails: {},
          key: 'missing-secret',
        }),
      ).rejects.toThrow('Error fetching secret from Azure Key Vault')
    })

    test('throws for unsupported resolver type', async () => {
      const resolver = createResolver({
        token: 'test-token',
        vaultUrl: 'https://myvault.vault.azure.net',
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
