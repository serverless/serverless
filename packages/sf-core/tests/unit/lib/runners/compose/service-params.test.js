import { jest } from '@jest/globals'

// Mock state.js so a pinned cross-stage get-state is observable without
// touching any real runner/AWS wiring (same harness shape as
// service-provider-resolution.test.js).
//
// NB: every import that pulls in state.js MUST be dynamic and come AFTER this
// call — a static top-level import would load (and cache) the real state.js
// before the mock registers.
jest.unstable_mockModule(
  '../../../../../src/lib/runners/compose/state.js',
  () => ({ resolveConfigAndGetState: jest.fn() }),
)

// Import router.js first to resolve a pre-existing circular-import ordering
// issue (compose.js -> ./index.js -> router.js -> compose.js).
await import('../../../../../src/lib/router.js')

const { parseComposeGraph } =
  await import('../../../../../src/lib/runners/compose/index.js')
const { resolveConfigAndGetState } =
  await import('../../../../../src/lib/runners/compose/state.js')
const { ResolverManager } =
  await import('../../../../../src/lib/resolvers/manager.js')
const { warnAboutUnreachableServiceReferences } =
  await import('../../../../../src/lib/runners/compose/service-params.js')
const { log } = await import('@serverless/util')
const graphlib = (await import('@dagrejs/graphlib')).default

const logger = log.get('test:compose-service-params')

// Mirror getAllComponents' parsedParams derivation so injected params behave
// exactly like config-parsed ones for the byte-identical dot-form loop.
const composeParamRegex = /(?<=\$\{)[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+(?=\})/
const buildParsedParams = (params) => {
  const parsed = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string') {
      parsed[key] = value
      continue
    }
    const matches = value.match(composeParamRegex)
    parsed[key] = Array.isArray(matches) ? matches[0] : value
  }
  return parsed
}

/**
 * Build a Compose instance + real ResolverManager wired together the way
 * production does, sharing ONE config object. Service tokens are injected after
 * the graph is parsed (the dependency scan does not resolve them), and because
 * a graph node's `inputs` IS the shared config's `services[alias]`, they land in
 * both places at once — exactly as they would post-parse in production.
 */
const buildScenario = async ({
  services,
  resolvers,
  runStage,
  keepNodes,
  options = {},
}) => {
  const configuration = {
    ...(resolvers ? { stages: { default: { resolvers } } } : {}),
    services: Object.fromEntries(
      Object.entries(services).map(([name, def]) => [
        name,
        { path: name, ...(def.dependsOn ? { dependsOn: def.dependsOn } : {}) },
      ]),
    ),
  }

  const compose = await parseComposeGraph({
    servicePath: '/tmp/compose-service-params',
    configuration,
    versions: {},
    runStage,
  })

  for (const [name, def] of Object.entries(services)) {
    if (def.params) {
      configuration.services[name].params = { ...def.params }
      configuration.services[name].parsedParams = buildParsedParams(def.params)
    }
  }

  const manager = new ResolverManager(
    logger,
    configuration,
    '/tmp/compose-service-params',
    { stage: runStage, ...options },
    null,
    null,
    null,
    false,
    '4.0.0',
    {
      isComposeConfigFile: true,
    },
  )
  await manager.loadPlaceholders()
  await manager.resolveConfigFile({ printResolvedVariables: false })
  compose.resolverManager = manager

  // Restrict the run graph to the consumer service so resolution is exercised
  // in isolation (dependencies are read from localState / the mock).
  const nodeData = new Map(keepNodes.map((n) => [n, compose.graph.node(n)]))
  compose.graph = new graphlib.Graph()
  for (const [name, data] of nodeData) {
    compose.graph.setNode(name, data)
  }

  return compose
}

const run = (compose, { command, runStage, state }) => {
  const seen = {}
  const runnerFunction = jest.fn(async (args) => {
    seen[args.compose.serviceName] = args.compose.params
    return {}
  })
  return compose
    .executeComponentsGraph({
      command,
      reverse: false,
      composeOrgName: 'org',
      options: { stage: runStage },
      resolverProviders: {},
      params: {},
      runnerFunction,
      state,
      isMultipleComponents: false,
    })
    .then(() => seen)
}

const freshState = (localState = {}) => ({
  localState,
  getServiceState: jest.fn(),
  putServiceState: jest.fn(),
})

describe('compose service-params pass — whole-value short-circuit', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  // remove/get-state replace the WHOLE param value, exactly as the dot-form
  // loop does. A per-token rewrite would leave the enclosing `${env:}` behind
  // as a literal and hand it to the service.
  const nestedOuterScenario = () =>
    buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { dbHost: '${env:${service:orders-db.EnvName}}' },
        },
      },
      keepNodes: ['api'],
    })

  test('remove: a service reference nested inside another variable yields an empty string', async () => {
    const compose = await nestedOuterScenario()

    const seen = await run(compose, {
      command: ['remove'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('get-state: the nested form yields an empty string too', async () => {
    const compose = await nestedOuterScenario()

    const seen = await run(compose, {
      command: ['get-state'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('remove: a reference inside a larger string replaces the whole value', async () => {
    // The surrounding literal text is NOT preserved: the short-circuit replaces
    // the whole param, which is what the dot-form loop does for its own
    // references (`serviceParams[key] = ''`). Both resolution paths therefore
    // hand a removed service the same value for the same shape.
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { url: 'postgres://${service:orders-db.Host}:5432/x' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['remove'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(seen.api.url).toBe('')
  })

  test('print keeps per-token resolution: the sentinel renders inside the string', async () => {
    // print is not short-circuited — it resolves for real, and the provider
    // substitutes its sentinel for the single unresolvable reference.
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { url: 'postgres://${service:orders-db.Host}:5432/x' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(seen.api.url).toBe(
      'postgres://NOT_AVAILABLE_IN_PRINT_COMMAND:5432/x',
    )
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })
})

describe('compose service-params pass — the compose context stays off the configuration', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  test('a named instance keeps its declared resolver block after a dispatch pass', async () => {
    // A named instance's provider config IS the `stages.<stage>.resolvers.<name>`
    // block of the compose configuration, by reference. Injecting the dispatch
    // wiring there would write callbacks into the user's configuration, so any
    // later serialization of it (a golden comparison, a YAML dump) would carry
    // them. The context is injected on the provider INSTANCE instead.
    resolveConfigAndGetState.mockResolvedValue({
      state: { outputs: { Host: 'db.prod.internal' } },
    })
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api: { params: { dbHost: '${shared:orders-db.Host}' } },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState(),
    })
    expect(seen.api.dbHost).toBe('db.prod.internal')

    const config = compose.resolverManager.serviceConfigFile
    expect(config.stages.default.resolvers.shared).toEqual({
      type: 'service',
      stage: 'prod',
    })
    expect(() => JSON.stringify(config)).not.toThrow()
    expect(
      JSON.parse(JSON.stringify(config)).stages.default.resolvers.shared,
    ).toEqual({ type: 'service', stage: 'prod' })
  })
})

describe('unreachable service references are reported', () => {
  // The dispatch-time pass only revisits `services.<alias>.params`. A service
  // reference anywhere else is never resolved and would ship to child services
  // as a literal, silently. Warn instead of failing: an unknown provider name
  // passing through as a literal predates the service provider.
  const warningsFor = async (config) => {
    const warnLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      notice: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    }
    const manager = new ResolverManager(
      warnLogger,
      config,
      '/tmp/compose-service-params',
      { stage: 'dev' },
      null,
      null,
      null,
      false,
      '4.0.0',
      { isComposeConfigFile: true },
    )
    await manager.loadPlaceholders()
    await manager.resolveConfigFile({ printResolvedVariables: false })

    // Nothing is reported until the compose runner asks: the manager only
    // defers, the caller that deferred decides what is misplaced.
    expect(warnLogger.warning).not.toHaveBeenCalled()

    const emitted = []
    warnAboutUnreachableServiceReferences({
      manager,
      logger: { warning: (message) => emitted.push(message) },
    })
    return emitted
  }

  test('a reference outside services.<alias>.params is reported, with its token, location and the fix', async () => {
    const warnings = await warningsFor({
      stages: {
        default: {
          resolvers: { shared: { type: 'service' } },
          params: { topLevel: '${shared:orders-db.TopicArn}' },
        },
      },
      services: { api: { path: 'api' } },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('${shared:orders-db.TopicArn}')
    expect(warnings[0]).toContain('stages.default.params.topLevel')
    expect(warnings[0]).toContain("'services.<service>.params'")
    expect(warnings[0]).toContain('${param:...}')
  })

  test('a correctly placed reference is silent, including its parsedParams mirror', async () => {
    // `getAllComponents` writes a `parsedParams` mirror of
    // `services.<alias>.params` onto the same config object, and a service
    // reference is copied there verbatim. The mirror is the SAME correctly
    // placed reference seen twice — reporting it would tell the user to move a
    // reference that is already where it belongs.
    const warnings = await warningsFor({
      stages: { default: { resolvers: { shared: { type: 'service' } } } },
      services: {
        api: {
          path: 'api',
          params: { topic: '${shared:orders-db.TopicArn}' },
          parsedParams: { topic: '${shared:orders-db.TopicArn}' },
        },
      },
    })

    expect(warnings).toEqual([])
  })

  test('both the built-in type and a named instance are covered, in one report per token', async () => {
    const warnings = await warningsFor({
      stages: {
        default: {
          resolvers: { shared: { type: 'service' } },
          params: {
            viaInstance: '${shared:orders-db.TopicArn}',
            viaBuiltIn: '${service:orders-db.TopicArn}',
          },
        },
      },
      services: { api: { path: 'api', params: { ok: '${service:db.Host}' } } },
    })

    expect(warnings).toHaveLength(2)
    expect(warnings.join(' ')).toContain('stages.default.params.viaInstance')
    expect(warnings.join(' ')).toContain('stages.default.params.viaBuiltIn')
    expect(warnings.join(' ')).not.toContain('services.api.params.ok')
  })

  test('a compose file with no service references reports nothing', async () => {
    const warnings = await warningsFor({
      stages: { default: { params: { region: 'us-east-1' } } },
      services: { api: { path: 'api', params: { plain: '${param:region}' } } },
    })

    expect(warnings).toEqual([])
  })
})
