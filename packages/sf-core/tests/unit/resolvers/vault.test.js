import { Vault } from '../../../src/lib/resolvers/providers/vault/vault.js'

describe('Vault resolver', () => {
  describe('validateConfig', () => {
    test('accepts a valid configuration', () => {
      expect(() =>
        Vault.validateConfig({
          type: 'vault',
          token: 'hvs.token',
          address: 'https://vault.example.com',
          version: 'v2',
          path: 'secret/data/app',
        }),
      ).not.toThrow()
    })

    test('rejects unknown keys with the allowed-keys message', () => {
      expect(() =>
        Vault.validateConfig({
          type: 'vault',
          address: 'https://vault.example.com',
          namespace: 'admin',
        }),
      ).toThrow(
        "Only 'token', 'address', 'version', and 'path' are allowed in the Vault configuration (unrecognized: 'namespace')",
      )
    })
  })
})
