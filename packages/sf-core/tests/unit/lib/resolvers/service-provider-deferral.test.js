import { log } from '@serverless/util'
import { ResolverManager } from '../../../../src/lib/resolvers/manager.js'

/**
 * Deferral tests for the compose-only `service` resolver provider.
 *
 * The compose-file manager's up-front `resolveConfigFile` pass must leave
 * service-provider param tokens untouched so a later dispatch-time pass can
 * resolve them once dependencies are deployed. Concretely, the built-in
 * `service` type name AND every declared instance whose effective `type` is a
 * compose-only type (e.g. `${shared:...}`) are excluded from the up-front
 * `selectedProviders` list, so those tokens pass through as literals.
 *
 * Stage precedence and built-in shadowing are covered by
 * service-provider-deferral-precedence.test.js.
 *
 * Everything else still resolves in the up-front pass: `${env:}`, `${param:}`,
 * and crucially the service-typed instances' own `stage:` config fields.
 *
 * These exercise the REAL registry, manager, and validation (no module
 * mocking) so the deferral is verified end to end.
 */

const logger = log.get('test:service-provider-deferral')

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

describe('service provider deferral', () => {
  describe('up-front compose pass', () => {
    it('defers service tokens as literals while resolving everything else', async () => {
      process.env.DEFERRAL_TEST_HOME = 'from-env'
      const config = {
        service: 'svc',
        provider: { name: 'aws' },
        stages: {
          default: {
            resolvers: {
              shared: { type: 'service', stage: '${param:dataStage}' },
            },
          },
        },
        params: {
          default: {
            dataStage: 'prod',
            a: '${service:x.Y}',
            b: '${shared:x.Y}',
            c: '${env:DEFERRAL_TEST_HOME}',
          },
        },
      }
      const manager = buildManager(config, { isComposeConfigFile: true })

      try {
        await manager.loadPlaceholders()
        await manager.resolveConfigFile({ printResolvedVariables: false })

        // Service-provider param tokens are deferred: left literal.
        expect(config.params.default.a).toBe('${service:x.Y}')
        expect(config.params.default.b).toBe('${shared:x.Y}')

        // Everything else resolves in the up-front pass.
        expect(config.params.default.c).toBe('from-env')
        expect(config.params.default.dataStage).toBe('prod')

        // The service-typed instance's own `stage:` config field still
        // resolves in the up-front pass (its inner `${param:...}` is our
        // grammar, not a deferred service token).
        expect(config.stages.default.resolvers.shared.stage).toBe('prod')
      } finally {
        delete process.env.DEFERRAL_TEST_HOME
      }
    })
  })

  describe('getServiceTypedInstanceNames', () => {
    it('collects instance names of compose-only type from the active and default stage blocks', () => {
      const config = {
        stages: {
          default: { resolvers: { shared: { type: 'service' } } },
          dev: {
            resolvers: { pinned: { type: 'service' }, aws1: { type: 'aws' } },
          },
        },
      }
      const manager = buildManager(config, { isComposeConfigFile: true })

      const names = manager.getServiceTypedInstanceNames()

      expect(names).toEqual(expect.arrayContaining(['shared', 'pinned']))
      expect(names).not.toContain('aws1')
    })

    it('returns an empty list when no service-typed instances are declared', () => {
      const manager = buildManager(
        { stages: { default: { resolvers: { aws1: { type: 'aws' } } } } },
        { isComposeConfigFile: true },
      )

      expect(manager.getServiceTypedInstanceNames()).toEqual([])
    })
  })
})
