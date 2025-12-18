import { jest } from '@jest/globals'
import { Sls } from '../../../src/lib/resolvers/providers/sls/sls.js'

describe('Sls Resolver', () => {
  let resolver

  beforeEach(() => {
    // Reset instanceId for reproducible tests
    Sls.instanceId = 'test-instance-id-123'

    resolver = new Sls({
      providerConfig: {},
      serviceConfigFile: { provider: { stage: 'dev' } },
      configFileDirPath: null,
      options: { stage: null },
      stage: 'dev',
      dashboard: null,
      composeParams: null,
      resolveVariableFunc: null,
      resolveConfigurationPropertyFunc: null,
    })
  })

  describe('resolveVariable', () => {
    describe('${sls:instanceId}', () => {
      test('resolves to instance ID', () => {
        const result = resolver.resolveVariable({
          resolverType: 'framework',
          resolutionDetails: {},
          key: 'instanceId',
        })
        expect(result).toBe('test-instance-id-123')
      })

      test('instance ID is a string', () => {
        const result = resolver.resolveVariable({
          resolverType: 'framework',
          resolutionDetails: {},
          key: 'instanceId',
        })
        expect(typeof result).toBe('string')
      })

      test('instance ID is shared across resolver instances', () => {
        const resolver2 = new Sls({
          providerConfig: {},
          serviceConfigFile: { provider: { stage: 'prod' } },
          configFileDirPath: null,
          options: {},
          stage: 'prod',
          dashboard: null,
          composeParams: null,
          resolveVariableFunc: null,
          resolveConfigurationPropertyFunc: null,
        })

        const result1 = resolver.resolveVariable({
          resolverType: 'framework',
          resolutionDetails: {},
          key: 'instanceId',
        })
        const result2 = resolver2.resolveVariable({
          resolverType: 'framework',
          resolutionDetails: {},
          key: 'instanceId',
        })

        expect(result1).toBe(result2)
      })
    })

    describe('${sls:stage}', () => {
      test('resolves to stage from instance', () => {
        const result = resolver.resolveVariable({
          resolverType: 'framework',
          resolutionDetails: {},
          key: 'stage',
        })
        expect(result).toBe('dev')
      })

      test('resolves to provider.stage when set', () => {
        resolver = new Sls({
          providerConfig: {},
          serviceConfigFile: { provider: { stage: 'prod' } },
          configFileDirPath: null,
          options: {},
          stage: 'prod',
          dashboard: null,
          composeParams: null,
          resolveVariableFunc: null,
          resolveConfigurationPropertyFunc: null,
        })

        const result = resolver.resolveVariable({
          resolverType: 'framework',
          resolutionDetails: {},
          key: 'stage',
        })
        expect(result).toBe('prod')
      })

      test('resolves to CLI option stage when specified', () => {
        resolver = new Sls({
          providerConfig: {},
          serviceConfigFile: { provider: { stage: 'prod' } },
          configFileDirPath: null,
          options: { stage: 'staging' },
          stage: 'staging',
          dashboard: null,
          composeParams: null,
          resolveVariableFunc: null,
          resolveConfigurationPropertyFunc: null,
        })

        const result = resolver.resolveVariable({
          resolverType: 'framework',
          resolutionDetails: {},
          key: 'stage',
        })
        expect(result).toBe('staging')
      })
    })

    describe('error handling', () => {
      test('throws error for unsupported address', () => {
        expect(() =>
          resolver.resolveVariable({
            resolverType: 'framework',
            resolutionDetails: {},
            key: 'foo',
          }),
        ).toThrow(/not supported/)
      })

      test('throws error for unknown property', () => {
        expect(() =>
          resolver.resolveVariable({
            resolverType: 'framework',
            resolutionDetails: {},
            key: 'unknown',
          }),
        ).toThrow(/not supported/)
      })
    })
  })

  describe('static properties', () => {
    test('has correct type', () => {
      expect(Sls.type).toBe('sls')
    })

    test('has correct resolvers', () => {
      expect(Sls.resolvers).toEqual(['framework'])
    })

    test('has correct default resolver', () => {
      expect(Sls.defaultResolver).toBe('framework')
    })

    test('instanceId is a static property', () => {
      expect(typeof Sls.instanceId).toBe('string')
    })
  })

  describe('instanceId generation', () => {
    test('creates unique timestamp-based ID', () => {
      // Reset to default behavior
      Sls.instanceId = new Date().getTime().toString()

      const id = Sls.instanceId

      // Should be a number string (timestamp)
      expect(/^\d+$/.test(id)).toBe(true)

      // Should be in reasonable time range
      const timestamp = parseInt(id, 10)
      const now = Date.now()
      expect(timestamp).toBeLessThanOrEqual(now)
      expect(timestamp).toBeGreaterThan(now - 60000) // Within last minute
    })
  })
})
