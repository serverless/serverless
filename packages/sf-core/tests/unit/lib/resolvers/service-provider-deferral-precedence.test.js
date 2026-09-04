import { jest } from '@jest/globals'
import { ResolverManager } from '../../../../src/lib/resolvers/manager.js'
import { AbstractProvider } from '../../../../src/lib/resolvers/providers/index.js'
import { providerRegistry } from '../../../../src/lib/resolvers/registry/index.js'

/**
 * Stage-precedence and shadowing rules for the compose-file manager's up-front
 * deferral of service-provider tokens.
 *
 * Deferral decides which provider names the up-front `resolveConfigFile` pass
 * skips (their tokens stay literal until the dispatch-time pass). It must agree
 * with how the resolver is actually LOADED: `loadProvider` selects the WHOLE
 * resolver block from the first stage in `[stage, 'default']` that declares the
 * instance, and availability gating resolves an instance by its DECLARED type.
 * A name that is not service-typed under those rules must resolve up front.
 *
 * These use the REAL registry, manager, and providers (no module mocking).
 */

const buildLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
})

const buildManager = (
  serviceConfigFile,
  { isComposeConfigFile = true, stage = 'dev', logger = buildLogger() } = {},
) => ({
  logger,
  manager: new ResolverManager(
    logger,
    serviceConfigFile,
    '/path/to/config',
    { stage },
    null,
    null,
    null,
    false,
    '4.0.0',
    { isComposeConfigFile },
  ),
})

const withEnv = async (vars, fn) => {
  Object.assign(process.env, vars)
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(vars)) delete process.env[key]
  }
}

describe('deferral honours [stage, default] block precedence', () => {
  // `pruneUnusedStages` removes every stage block except the active stage AND
  // `default` — so `default` is always still present when deferral is computed.
  // A union over all stage blocks therefore still sees a `default` declaration
  // that the active stage has fully shadowed, and wrongly defers the name.
  test('an active-stage non-service redeclaration of a default service-typed name resolves up front', async () => {
    const config = {
      stages: {
        default: { resolvers: { shared: { type: 'service' } } },
        dev: {
          resolvers: { shared: { type: 'env' } },
          params: { v: '${shared:PRECEDENCE_TEST_VAR}' },
        },
      },
    }
    const { manager } = buildManager(config)

    await withEnv({ PRECEDENCE_TEST_VAR: 'from-env' }, async () => {
      await manager.loadPlaceholders()
      await manager.resolveConfigFile({ printResolvedVariables: false })
    })

    // The effective `shared` is `type: env` — not service-typed at all.
    expect(manager.getServiceTypedInstanceNames()).toEqual([])
    // ...so its token resolves in the up-front pass instead of staying literal.
    expect(config.stages.dev.params.v).toBe('from-env')
  })

  test('a default-block service-typed instance is still deferred when the active stage does not redeclare it', async () => {
    const config = {
      stages: {
        default: { resolvers: { shared: { type: 'service' } } },
        dev: { params: { v: '${shared:orders-db.TopicArn}' } },
      },
    }
    const { manager } = buildManager(config)

    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    expect(manager.getServiceTypedInstanceNames()).toEqual(['shared'])
    expect(config.stages.dev.params.v).toBe('${shared:orders-db.TopicArn}')
  })
})

describe('the built-in `service` name can be shadowed by a user instance', () => {
  // Availability gating already resolves an instance by its declared type, so a
  // `service: {type: env}` instance stays usable. Deferral must agree: the
  // built-in name is deferred only when it is NOT shadowed by an effective
  // declaration of a non-compose-only type.
  test('an instance named `service` of a non-service type resolves up front', async () => {
    const config = {
      stages: {
        default: {
          resolvers: { service: { type: 'env' } },
          params: { v: '${service:SHADOW_TEST_VAR}' },
        },
      },
    }
    const { manager } = buildManager(config)

    await withEnv({ SHADOW_TEST_VAR: 'from-env' }, async () => {
      await manager.loadPlaceholders()
      await manager.resolveConfigFile({ printResolvedVariables: false })
    })

    expect(config.stages.default.params.v).toBe('from-env')
  })

  test('the built-in `service` name is still deferred when nothing shadows it', async () => {
    const config = {
      stages: { default: { params: { v: '${service:orders-db.TopicArn}' } } },
    }
    const { manager } = buildManager(config)

    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    expect(config.stages.default.params.v).toBe('${service:orders-db.TopicArn}')
  })

  test('an instance named `service` that IS service-typed stays deferred', async () => {
    const config = {
      stages: {
        default: {
          resolvers: { service: { type: 'service', stage: 'prod' } },
          params: { v: '${service:orders-db.TopicArn}' },
        },
      },
    }
    const { manager } = buildManager(config)

    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    expect(config.stages.default.params.v).toBe('${service:orders-db.TopicArn}')
  })
})

describe('deferred tokens stay literal wherever they sit', () => {
  // The manager only defers them; reporting the ones no later pass will reach
  // belongs to the caller that deferred them (see the compose service-params
  // suite). What the manager owes is that a deferred token is left untouched.
  test('a deferred token outside services.<alias>.params is left as a literal', async () => {
    const config = {
      stages: {
        default: {
          resolvers: { shared: { type: 'service' } },
          params: { topLevel: '${shared:orders-db.TopicArn}' },
        },
      },
      services: { api: { path: 'api' } },
    }
    const { manager, logger } = buildManager(config)

    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    expect(config.stages.default.params.topLevel).toBe(
      '${shared:orders-db.TopicArn}',
    )
    expect(logger.warning).not.toHaveBeenCalled()
  })

  test('outside a compose-file manager the token passes through untouched', async () => {
    const config = {
      stages: {
        default: { params: { topLevel: '${service:orders-db.TopicArn}' } },
      },
    }
    const { manager, logger } = buildManager(config, {
      isComposeConfigFile: false,
    })

    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    // Outside a compose file the `service` provider is not available at all, so
    // its token is never selected and passes through as a literal (pre-existing
    // behavior).
    expect(config.stages.default.params.topLevel).toBe(
      '${service:orders-db.TopicArn}',
    )
    expect(logger.warning).not.toHaveBeenCalled()
  })
})

describe('one precedence lookup backs provider construction', () => {
  // Construction used to read the resolver block with its own pair of
  // `stages.<stage>` / `stages.default` lookups, separate from the block
  // selection every classification question goes through. Pin the whole-block
  // `[stage, 'default']` precedence at the point where it is observable: the
  // class of the provider actually instantiated for the instance name.
  class StageBlockProvider extends AbstractProvider {
    static type = 'precedence-stage-block'
    static resolvers = ['value']
    static defaultResolver = 'value'
    static validateConfig() {}
  }

  class DefaultBlockProvider extends AbstractProvider {
    static type = 'precedence-default-block'
    static resolvers = ['value']
    static defaultResolver = 'value'
    static validateConfig() {}
  }

  beforeAll(() => {
    providerRegistry.register(StageBlockProvider.type, StageBlockProvider)
    providerRegistry.register(DefaultBlockProvider.type, DefaultBlockProvider)
  })

  afterAll(() => {
    delete providerRegistry.providers[StageBlockProvider.type]
    delete providerRegistry.providers[DefaultBlockProvider.type]
  })

  const buildConfig = () => ({
    stages: {
      default: { resolvers: { picked: { type: DefaultBlockProvider.type } } },
      dev: { resolvers: { picked: { type: StageBlockProvider.type } } },
    },
  })

  test('the active stage block shadows the default one', () => {
    const { manager } = buildManager(buildConfig(), { stage: 'dev' })

    expect(manager.getProvider('picked').instance.constructor.type).toBe(
      StageBlockProvider.type,
    )
  })

  test('the default block is used when the active stage does not declare the instance', () => {
    const { manager } = buildManager(buildConfig(), { stage: 'prod' })

    expect(manager.getProvider('picked').instance.constructor.type).toBe(
      DefaultBlockProvider.type,
    )
  })
})
