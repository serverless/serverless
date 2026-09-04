import { jest } from '@jest/globals'
import { ResolverManager } from '../../../../src/lib/resolvers/manager.js'
import { AbstractProvider } from '../../../../src/lib/resolvers/providers/index.js'
import { providerRegistry } from '../../../../src/lib/resolvers/registry/index.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

/**
 * Generic, compose-agnostic ResolverManager primitives:
 *
 * - `getPlaceholderKeysUsingProviders()` — which keys under a config path use a
 *   given set of provider names, answered from the parsed placeholder graph
 *   (so a reference nested inside another variable counts, in either
 *   direction) instead of by matching text against the config values.
 * - `resolveUnderPath()` — one resolution pass scoped to a config path.
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
  { isComposeConfigFile = true, options = { stage: 'dev' } } = {},
) => {
  const logger = buildLogger()
  return {
    logger,
    manager: new ResolverManager(
      logger,
      serviceConfigFile,
      '/path/to/config',
      options,
      null,
      null,
      null,
      false,
      '4.0.0',
      { isComposeConfigFile },
    ),
  }
}

describe('getPlaceholderKeysUsingProviders', () => {
  // `opt` values are supplied so the non-deferred half of every nested shape
  // really does resolve in the up-front pass — the production situation the
  // dispatch-time pass runs in.
  const options = { stage: 'dev', db: 'db', region: 'x' }
  const pathPrefix = ['services', 'api', 'params']
  const providerNames = ['service', 'shared']

  const buildConfig = () => ({
    stages: { default: { resolvers: { shared: { type: 'service' } } } },
    services: {
      api: {
        path: 'api',
        params: {
          flat: '${service:db.Host}',
          nestedInner: '${service:${opt:db}.Host}',
          nestedOuter: '${opt:${service:db.Name}}',
          twoReferences: '${service:db.Host}:${shared:db.Port}',
          namedInstance: '${shared:db.Host}',
          optOnly: '${opt:region}',
          literal: 'plain-text',
          numeric: 42,
        },
      },
      worker: {
        path: 'worker',
        params: { otherService: '${service:db.Host}' },
      },
    },
  })

  const loadedManager = async () => {
    const config = buildConfig()
    const { manager } = buildManager(config, { options })
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })
    return { config, manager }
  }

  test('includes every key whose value uses one of the providers, once each', async () => {
    const { manager } = await loadedManager()

    const keys = manager.getPlaceholderKeysUsingProviders({
      pathPrefix,
      providerNames,
    })

    expect([...keys].sort()).toEqual([
      'flat',
      'namedInstance',
      'nestedInner',
      'nestedOuter',
      'twoReferences',
    ])
    // Two references in one value still name the key once.
    expect(keys.filter((key) => key === 'twoReferences')).toHaveLength(1)
  })

  test('excludes keys with no reference to those providers, and non-string values', async () => {
    const { manager } = await loadedManager()

    const keys = manager.getPlaceholderKeysUsingProviders({
      pathPrefix,
      providerNames,
    })

    expect(keys).not.toContain('optOnly')
    expect(keys).not.toContain('literal')
    expect(keys).not.toContain('numeric')
  })

  test('is scoped to the given path, so another service’s params are excluded', async () => {
    const { manager } = await loadedManager()

    expect(
      manager.getPlaceholderKeysUsingProviders({ pathPrefix, providerNames }),
    ).not.toContain('otherService')
    expect(
      manager.getPlaceholderKeysUsingProviders({
        pathPrefix: ['services', 'worker', 'params'],
        providerNames,
      }),
    ).toEqual(['otherService'])
  })

  test('sees a reference nested INSIDE another variable, which the value text no longer shows', async () => {
    const { config, manager } = await loadedManager()

    // The enclosing `${opt:...}` cannot resolve while its inner reference is
    // deferred, so the key is still a literal here — and its top-level
    // placeholder names `opt`, not a service provider. Only the parsed graph
    // knows a service reference is in there.
    expect(config.services.api.params.nestedOuter).toBe(
      '${opt:${service:db.Name}}',
    )

    expect(
      manager.getPlaceholderKeysUsingProviders({ pathPrefix, providerNames }),
    ).toContain('nestedOuter')
  })

  test('sees a reference whose own inner variable already resolved', async () => {
    const { config, manager } = await loadedManager()

    // The inner `${opt:db}` resolves up front, leaving the deferred outer
    // reference in the value.
    expect(config.services.api.params.nestedInner).toBe('${service:db.Host}')

    expect(
      manager.getPlaceholderKeysUsingProviders({ pathPrefix, providerNames }),
    ).toContain('nestedInner')
  })

  test('returns nothing when no provider name is asked for', async () => {
    const { manager } = await loadedManager()

    expect(
      manager.getPlaceholderKeysUsingProviders({
        pathPrefix,
        providerNames: [],
      }),
    ).toEqual([])
  })
})

describe('resolveUnderPath', () => {
  test('resolves only under the given path prefix', async () => {
    const config = {
      custom: { inside: '${opt:token}' },
      other: { outside: '${opt:token}' },
    }
    const { manager } = buildManager(config, {
      isComposeConfigFile: false,
      options: { stage: 'dev', token: 'resolved-value' },
    })
    await manager.loadPlaceholders()

    await manager.resolveUnderPath({ pathPrefix: ['custom'] })

    expect(config.custom.inside).toBe('resolved-value')
    expect(config.other.outside).toBe('${opt:token}')
  })
})

describe('getPlaceholderKeysUsingProviders — fallback position', () => {
  test('a reference in fallback position qualifies its key', async () => {
    // The up-front pass defers a node when ANY fallback names a deferred
    // provider, so this key stays unresolved and must be owned by the later
    // pass — value text alone would not show the reference.
    const config = {
      services: {
        api: {
          path: 'api',
          params: { host: '${opt:missing, service:db.Host}' },
        },
      },
    }
    const { manager } = buildManager(config)
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    expect(
      manager.getPlaceholderKeysUsingProviders({
        pathPrefix: ['services', 'api', 'params'],
        providerNames: ['service'],
      }),
    ).toEqual(['host'])
    expect(config.services.api.params.host).toBe(
      '${opt:missing, service:db.Host}',
    )
  })
})

describe('getUnresolvedPlaceholders', () => {
  test('reports every still-unresolved placeholder of the named providers, with token and path', async () => {
    const config = {
      stages: {
        default: {
          resolvers: { shared: { type: 'service' } },
          params: { topLevel: '${shared:orders-db.TopicArn}' },
        },
      },
      services: {
        api: { path: 'api', params: { topic: '${service:db.Host}' } },
      },
    }
    const { manager } = buildManager(config)
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    const unresolved = manager.getUnresolvedPlaceholders({
      providerNames: ['service', 'shared'],
    })

    expect(unresolved).toEqual(
      expect.arrayContaining([
        {
          original: '${shared:orders-db.TopicArn}',
          path: ['stages', 'default', 'params', 'topLevel'],
        },
        {
          original: '${service:db.Host}',
          path: ['services', 'api', 'params', 'topic'],
        },
      ]),
    )
    expect(unresolved).toHaveLength(2)
  })

  test('a placeholder that resolved is not reported', async () => {
    const config = { custom: { region: '${opt:token}' } }
    const { manager } = buildManager(config, {
      isComposeConfigFile: false,
      options: { stage: 'dev', token: 'resolved-value' },
    })
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    expect(config.custom.region).toBe('resolved-value')
    expect(
      manager.getUnresolvedPlaceholders({ providerNames: ['opt'] }),
    ).toEqual([])
  })

  test('placeholders of other providers, and an empty provider list, report nothing', async () => {
    const config = {
      stages: {
        default: {
          resolvers: { shared: { type: 'service' } },
          params: { topLevel: '${shared:orders-db.TopicArn}' },
        },
      },
    }
    const { manager } = buildManager(config)
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    expect(
      manager.getUnresolvedPlaceholders({ providerNames: ['env'] }),
    ).toEqual([])
    expect(manager.getUnresolvedPlaceholders({ providerNames: [] })).toEqual([])
  })
})

describe('resolveStage as the compose run stage', () => {
  test('a top-level provider.stage in the compose file wins over the default when no --stage is given', async () => {
    // The compose runner reads `resolverManager.stage` as the run stage. With
    // no CLI stage, that is whatever the compose file declares under
    // `provider.stage` (undocumented but accepted), and `dev` otherwise — the
    // same value that selects `stages.<stage>` params.
    const declared = buildManager(
      { provider: { stage: 'prod' }, services: { api: { path: 'api' } } },
      { options: {} },
    ).manager
    const plain = buildManager(
      { services: { api: { path: 'api' } } },
      { options: {} },
    ).manager

    expect(await declared.resolveStage()).toBe('prod')
    expect(await plain.resolveStage()).toBe('dev')
  })
})

describe('getPlaceholderReferences', () => {
  // Every reference to one of the named providers under a path, one entry per
  // fallback, with the key as the graph holds it now — the input the compose
  // edge scan needs, in place of re-parsing config text (which cannot see a
  // reference that carries a fallback, or one whose inner variable resolved).
  const options = { stage: 'dev', db: 'orders-db', region: 'x' }
  const pathPrefix = ['services', 'api']
  const providerNames = ['service', 'shared']

  const buildConfig = () => ({
    stages: {
      default: { resolvers: { shared: { type: 'service', stage: 'prod' } } },
    },
    services: {
      api: {
        path: 'api',
        params: {
          flat: '${service:orders-db.Host}',
          withFallback: "${service:orders-db.Host, 'fb'}",
          inFallbackPosition: '${opt:missing, service:orders-db.Port}',
          nestedInner: '${service:${opt:db}.Host}',
          deferredInner: '${service:${service:registry.Alias}.Host}',
          twoReferences: '${service:orders-db.Host}:${shared:orders-db.Port}',
          embedded: 'https://${shared:orders-db.Host}/x',
          optOnly: '${opt:region}',
          literal: 'plain-text',
        },
      },
      worker: {
        path: 'worker',
        params: { otherService: '${service:orders-db.Host}' },
      },
    },
  })

  const references = async () => {
    const config = buildConfig()
    const { manager } = buildManager(config, { options })
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })
    return manager.getPlaceholderReferences({ pathPrefix, providerNames })
  }

  const byKey = (refs, key) =>
    refs.filter((ref) => ref.path.join('.') === `services.api.params.${key}`)

  test('a plain reference yields its provider and key', async () => {
    expect(byKey(await references(), 'flat')).toEqual([
      {
        path: ['services', 'api', 'params', 'flat'],
        original: '${service:orders-db.Host}',
        providerName: 'service',
        key: 'orders-db.Host',
      },
    ])
  })

  test('a reference carrying a fallback is reported (the text scan misses it)', async () => {
    expect(byKey(await references(), 'withFallback')).toEqual([
      expect.objectContaining({
        original: "${service:orders-db.Host, 'fb'}",
        providerName: 'service',
        key: 'orders-db.Host',
      }),
    ])
  })

  test('a reference in fallback position is reported; the other fallbacks are not', async () => {
    expect(byKey(await references(), 'inFallbackPosition')).toEqual([
      expect.objectContaining({
        providerName: 'service',
        key: 'orders-db.Port',
      }),
    ])
  })

  test('an inner variable that already resolved is substituted into the key', async () => {
    expect(byKey(await references(), 'nestedInner')).toEqual([
      expect.objectContaining({
        providerName: 'service',
        key: 'orders-db.Host',
      }),
    ])
  })

  test('a deferred inner reference is reported as its own node and left in the enclosing key', async () => {
    const refs = byKey(await references(), 'deferredInner')
    expect(refs.map((ref) => ref.key).sort()).toEqual([
      '${service:registry.Alias}.Host',
      'registry.Alias',
    ])
  })

  test('two references in one value yield two entries; an embedded one is found', async () => {
    const refs = await references()
    expect(
      byKey(refs, 'twoReferences')
        .map((ref) => ref.providerName)
        .sort(),
    ).toEqual(['service', 'shared'])
    expect(byKey(refs, 'embedded')).toEqual([
      expect.objectContaining({
        providerName: 'shared',
        key: 'orders-db.Host',
      }),
    ])
  })

  test('other providers, literals, other paths and an empty provider list report nothing', async () => {
    const refs = await references()
    expect(byKey(refs, 'optOnly')).toEqual([])
    expect(byKey(refs, 'literal')).toEqual([])
    expect(refs.some((ref) => ref.path[1] === 'worker')).toBe(false)

    const config = buildConfig()
    const { manager } = buildManager(config, { options })
    await manager.loadPlaceholders()
    expect(
      manager.getPlaceholderReferences({ pathPrefix, providerNames: [] }),
    ).toEqual([])
  })

  test('a resolved placeholder is not reported', async () => {
    const config = { custom: { region: '${opt:region}' } }
    const { manager } = buildManager(config, {
      isComposeConfigFile: false,
      options,
    })
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })
    expect(config.custom.region).toBe('x')
    expect(
      manager.getPlaceholderReferences({
        pathPrefix: ['custom'],
        providerNames: ['opt'],
      }),
    ).toEqual([])
  })
})

describe('declared fallbacks and a typed not-found error', () => {
  // A provider normally reports an absent value with null; one with something
  // to teach about the absence throws RESOLVER_VALUE_NOT_FOUND with that text.
  // The fallback loop must treat the two alike, and keep the text when no
  // fallback remains. Any other error stays fatal, fallbacks or not.
  class NotFoundProbeProvider extends AbstractProvider {
    static type = 'not-found-probe'
    static resolvers = ['value']
    static defaultResolver = 'value'
    static validateConfig() {}
    async resolveVariable({ key }) {
      if (key === 'missing') {
        throw new ServerlessError(
          `No value for '${key}' in the probe — create it first.`,
          ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND,
        )
      }
      if (key === 'broken') {
        throw new Error('probe exploded')
      }
      return `probe-${key}`
    }
  }

  beforeAll(() => {
    providerRegistry.register(NotFoundProbeProvider.type, NotFoundProbeProvider)
  })
  afterAll(() => {
    delete providerRegistry.providers[NotFoundProbeProvider.type]
  })

  const resolved = async (custom) => {
    const config = {
      stages: {
        default: { resolvers: { probe: { type: NotFoundProbeProvider.type } } },
      },
      custom,
    }
    const { manager } = buildManager(config, { isComposeConfigFile: false })
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })
    return config.custom
  }

  test('a not-found error gives the next fallback its turn — literal or another resolver', async () => {
    const custom = await resolved({
      literal: "${probe:missing, 'fb'}",
      chained: '${probe:missing, probe:present}',
      plain: '${probe:present}',
    })
    expect(custom).toEqual({
      literal: 'fb',
      chained: 'probe-present',
      plain: 'probe-present',
    })
  })

  test('with no fallback left the provider error is rethrown unchanged', async () => {
    const error = await resolved({ v: '${probe:missing}' }).catch((e) => e)
    expect(error).toBeInstanceOf(ServerlessError)
    expect(error.code).toBe(
      ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND,
    )
    expect(error.message).toBe(
      "No value for 'missing' in the probe — create it first.",
    )
  })

  test('any other error is fatal even when a fallback is declared', async () => {
    const error = await resolved({ v: "${probe:broken, 'fb'}" }).catch((e) => e)
    expect(error.message).toMatch(/probe exploded/)
  })

  test('a not-found in last position after a null fallback is rethrown unchanged', async () => {
    const error = await resolved({ v: '${opt:absent, probe:missing}' }).catch(
      (e) => e,
    )
    expect(error.code).toBe(
      ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND,
    )
    expect(error.message).toBe(
      "No value for 'missing' in the probe — create it first.",
    )
  })

  test('a survived not-found is not cached: the same key resolves later in the run', async () => {
    // The resolver cache memoizes the in-flight promise per key. A rejection
    // that a fallback survived must not stay cached, or a later lookup of the
    // same key — after the value has appeared — replays the stale error.
    class FlakyProbeProvider extends AbstractProvider {
      static type = 'flaky-probe'
      static resolvers = ['value']
      static defaultResolver = 'value'
      static validateConfig() {}
      static calls = 0
      async resolveVariable({ key }) {
        FlakyProbeProvider.calls += 1
        if (FlakyProbeProvider.calls === 1) {
          throw new ServerlessError(
            `No value for '${key}' yet`,
            ServerlessErrorCodes.resolvers.RESOLVER_VALUE_NOT_FOUND,
          )
        }
        return `probe-${key}`
      }
    }
    providerRegistry.register(FlakyProbeProvider.type, FlakyProbeProvider)
    try {
      const config = {
        stages: {
          default: { resolvers: { flaky: { type: FlakyProbeProvider.type } } },
        },
        first: { v: "${flaky:later, 'fb'}" },
        second: { v: '${flaky:later}' },
      }
      const { manager } = buildManager(config, { isComposeConfigFile: false })
      await manager.loadPlaceholders()
      await manager.resolveAndReplacePlaceholdersInConfig({
        selectedProviders: ['flaky'],
        selectedPaths: [['first']],
      })
      expect(config.first.v).toBe('fb')
      await manager.resolveAndReplacePlaceholdersInConfig({
        selectedProviders: ['flaky'],
        selectedPaths: [['second']],
      })
      expect(config.second.v).toBe('probe-later')
    } finally {
      delete providerRegistry.providers[FlakyProbeProvider.type]
    }
  })
})
