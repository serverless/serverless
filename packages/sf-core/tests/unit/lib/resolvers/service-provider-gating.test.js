import { log } from '@serverless/util'
import { ResolverManager } from '../../../../src/lib/resolvers/manager.js'
import { validateCustomResolverConfigs } from '../../../../src/lib/resolvers/validation.js'
import { providerRegistry } from '../../../../src/lib/resolvers/registry/index.js'
import { Service } from '../../../../src/lib/resolvers/providers/service/service.js'

/**
 * Gating tests for the compose-only `service` resolver provider.
 *
 * These exercise the REAL registry, manager, and validation (no module
 * mocking) so the availability rule is verified end to end. Every cell of the
 * brief's behavior matrix is pinned:
 *
 *   | Context             | `${service:...}` token      | `type: service` instance |
 *   |---------------------|-----------------------------|--------------------------|
 *   | serverless.yml mgr  | literal pass-through         | validation error         |
 *   | compose-file mgr    | available (attempts resolve) | valid                    |
 *   | child (inherited)   | filtered from inheritance    | n/a                      |
 */

const logger = log.get('test:service-provider-gating')

const buildManager = (serviceConfigFile, { isComposeConfigFile } = {}) =>
  new ResolverManager(
    logger,
    serviceConfigFile,
    '/path/to/config',
    { stage: 'dev' },
    null,
    null,
    null,
    false,
    '4.0.0',
    { isComposeConfigFile },
  )

describe('service provider gating', () => {
  describe('registry', () => {
    it('registers the service provider type', () => {
      expect(providerRegistry.get('service')).toBe(Service)
    })
  })

  describe('${service:...} token availability', () => {
    it('leaves the token literal in a serverless.yml manager (filtered out)', async () => {
      const config = {
        service: 'svc',
        provider: { name: 'aws' },
        custom: { serviceRef: '${service:orders-db.QueueUrl}' },
      }
      const manager = buildManager(config, { isComposeConfigFile: false })

      await manager.loadPlaceholders()
      await manager.resolveConfigFile({ printResolvedVariables: false })

      expect(config.custom.serviceRef).toBe('${service:orders-db.QueueUrl}')
    })

    it('defers the token in a compose-file manager (left literal by the up-front pass)', async () => {
      const config = {
        service: 'svc',
        provider: { name: 'aws' },
        custom: { serviceRef: '${service:orders-db.QueueUrl}' },
      }
      const manager = buildManager(config, { isComposeConfigFile: true })

      await manager.loadPlaceholders()

      // The service provider is AVAILABLE in a compose-file manager, but actual
      // token resolution belongs to the dispatch-time pass (once dependencies
      // are deployed). The up-front resolveConfigFile pass therefore defers the
      // token, leaving it literal rather than resolving it.
      await manager.resolveConfigFile({ printResolvedVariables: false })

      expect(config.custom.serviceRef).toBe('${service:orders-db.QueueUrl}')
    })

    it('does not filter a user resolver instance named "service" (matched by type, not name)', async () => {
      // Regression guard: registering the `service` TYPE must not clobber a
      // user resolver INSTANCE that happens to be named `service` but is a
      // different, non-compose-only type. Availability is decided by the
      // instance's declared type, so it stays resolvable in serverless.yml.
      process.env.GATING_TEST_VAR = 'from-env'
      const config = {
        service: 'svc',
        stages: { default: { resolvers: { service: { type: 'env' } } } },
        custom: { ref: '${service:GATING_TEST_VAR}' },
      }
      const manager = buildManager(config, { isComposeConfigFile: false })

      try {
        await manager.loadPlaceholders()
        await manager.resolveConfigFile({ printResolvedVariables: false })
        expect(config.custom.ref).toBe('from-env')
      } finally {
        delete process.env.GATING_TEST_VAR
      }
    })
  })

  describe('type: service instance validation', () => {
    const serviceInstanceConfig = {
      stages: {
        default: {
          resolvers: {
            shared: { type: 'service' },
          },
        },
      },
    }

    it('rejects a type: service instance in serverless.yml context', () => {
      expect(() =>
        validateCustomResolverConfigs(serviceInstanceConfig, {
          isComposeConfigFile: false,
        }),
      ).toThrow(/compose/i)
    })

    it('accepts a type: service instance in compose-file context', () => {
      expect(() =>
        validateCustomResolverConfigs(serviceInstanceConfig, {
          isComposeConfigFile: true,
        }),
      ).not.toThrow()
    })

    it('defaults to serverless.yml context (rejects) when no options passed', () => {
      expect(() =>
        validateCustomResolverConfigs(serviceInstanceConfig),
      ).toThrow(/compose/i)
    })
  })

  describe('getResolverProviders inheritance filter', () => {
    it('excludes compose-only providers from the inherited set', () => {
      const manager = buildManager(
        { service: 'svc' },
        { isComposeConfigFile: true },
      )

      manager.addResolverProvider('shared', {
        instance: { constructor: Service },
        resolvers: {},
      })
      manager.addResolverProvider('normal', {
        instance: { constructor: { composeOnly: false, type: 'aws' } },
        resolvers: {},
      })

      const inherited = manager.getResolverProviders()

      expect(inherited).toHaveProperty('normal')
      expect(inherited).not.toHaveProperty('shared')
    })
  })
})
