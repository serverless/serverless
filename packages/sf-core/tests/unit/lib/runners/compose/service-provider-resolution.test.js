import { jest } from '@jest/globals'

// Mock state.js so the pinned cross-stage get-state call is observable without
// touching any real runner/AWS wiring. Mirrors state.test.js and a pinned
// cross-stage resolution harness: mock the sibling module via jest.unstable_mockModule
// before importing the module under test.
//
// NB: every import that pulls in state.js MUST be dynamic and come AFTER this
// call — a static top-level import would load (and cache) the real state.js
// before the mock registers, and the pinned fetch would hit real runner/AWS
// wiring instead of the jest.fn().
jest.unstable_mockModule(
  '../../../../../src/lib/runners/compose/state.js',
  () => ({ resolveConfigAndGetState: jest.fn() }),
)

// Import router.js first to resolve a pre-existing circular-import ordering
// issue (compose.js -> ./index.js -> router.js -> compose.js). Dynamic + after
// the mock so state.js is not loaded before it is mocked.
await import('../../../../../src/lib/router.js')

const { parseComposeGraph } =
  await import('../../../../../src/lib/runners/compose/index.js')
const { resolveConfigAndGetState } =
  await import('../../../../../src/lib/runners/compose/state.js')
const { ResolverManager } =
  await import('../../../../../src/lib/resolvers/manager.js')
const { resolveServiceParams } =
  await import('../../../../../src/lib/runners/compose/service-params.js')
const { log } = await import('@serverless/util')
const graphlib = (await import('@dagrejs/graphlib')).default

const logger = log.get('test:service-provider-resolution')

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
 * production does, sharing ONE config object.
 *
 * Service tokens (`${service:...}`/`${shared:...}`) cannot be present while
 * parseComposeGraph runs (its dependency scan does not resolve them directly —
 * ordering is handled by the dependency graph scan), so services declare `dependsOn` for ordering and their
 * params are injected AFTER the graph is built. Because the graph node's
 * `inputs` IS the shared config's `services[alias]`, the injected params land in
 * both places at once — exactly as they would post-parse in production.
 */
const buildScenario = async ({
  services,
  resolvers,
  params: composeParams,
  runStage,
  keepNodes,
  options = {},
}) => {
  const configuration = {
    ...(resolvers || composeParams
      ? {
          stages: {
            default: {
              ...(resolvers ? { resolvers } : {}),
              ...(composeParams ? { params: composeParams } : {}),
            },
          },
        }
      : {}),
    services: Object.fromEntries(
      Object.entries(services).map(([name, def]) => [
        name,
        { path: name, ...(def.dependsOn ? { dependsOn: def.dependsOn } : {}) },
      ]),
    ),
  }

  const compose = await parseComposeGraph({
    servicePath: '/tmp/service-provider-resolution',
    configuration,
    versions: {},
    runStage,
  })

  // Inject params into the shared config (== each graph node's inputs).
  for (const [name, def] of Object.entries(services)) {
    if (def.params) {
      configuration.services[name].params = { ...def.params }
      configuration.services[name].parsedParams = buildParsedParams(def.params)
    }
  }

  const manager = new ResolverManager(
    logger,
    configuration,
    '/tmp/service-provider-resolution',
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

  // Restrict the run graph to the consumer service(s) so resolution is
  // exercised in isolation (dependencies are read from localState / mock).
  const nodeData = new Map(keepNodes.map((n) => [n, compose.graph.node(n)]))
  compose.graph = new graphlib.Graph()
  for (const [name, data] of nodeData) {
    compose.graph.setNode(name, data)
  }

  return compose
}

// Run the graph with a stub runner that captures the resolved params handed to
// each dispatched service.
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

describe('service-provider dispatch-pass resolution', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  test('same-stage ${service:...} resolves from localState with zero fetches', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { dbHost: '${service:orders-db.DbEndpoint}' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState({
        'orders-db': { outputs: { DbEndpoint: 'db.alice.internal' } },
      }),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('db.alice.internal')
  })

  test('pinned ${shared:...} (effectiveStage !== runStage) get-states at the PINNED stage', async () => {
    resolveConfigAndGetState.mockResolvedValue({
      state: { outputs: { DbEndpoint: 'db.prod.internal' } },
    })
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { dbHost: '${shared:orders-db.DbEndpoint}' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).toHaveBeenCalledTimes(1)
    expect(resolveConfigAndGetState.mock.calls[0][0].options.stage).toBe('prod')
    expect(resolveConfigAndGetState.mock.calls[0][0].compose.serviceName).toBe(
      'orders-db',
    )
    expect(seen.api.dbHost).toBe('db.prod.internal')
  })

  test('two references to the same pinned dep@stage trigger exactly one fetch (single-flight memoization)', async () => {
    resolveConfigAndGetState.mockResolvedValue({
      state: { outputs: { DbEndpoint: 'db.prod.internal' } },
    })
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api1: { params: { dbHost: '${shared:orders-db.DbEndpoint}' } },
        api2: { params: { dbHost: '${shared:orders-db.DbEndpoint}' } },
      },
      keepNodes: ['api1', 'api2'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).toHaveBeenCalledTimes(1)
    expect(seen.api1.dbHost).toBe('db.prod.internal')
    expect(seen.api2.dbHost).toBe('db.prod.internal')
  })

  test('concurrent dispatch of two consumers stays single-flight (shared promise, one fetch)', async () => {
    // Delay the fetch so both consumers reach getOutputs before it settles —
    // proves the memo stores the in-flight PROMISE, not just the resolved value.
    let resolveFetch
    resolveConfigAndGetState.mockImplementation(
      () =>
        new Promise((res) => {
          resolveFetch = () =>
            res({ state: { outputs: { DbEndpoint: 'db.prod.internal' } } })
        }),
    )
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api1: { params: { dbHost: '${shared:orders-db.DbEndpoint}' } },
        api2: { params: { dbHost: '${shared:orders-db.DbEndpoint}' } },
      },
      keepNodes: ['api1', 'api2'],
    })

    const seenPromise = run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState(),
    })
    // Let both consumers register their interest in the same fetch, then settle.
    await new Promise((r) => setTimeout(r, 20))
    resolveFetch()
    const seen = await seenPromise

    expect(resolveConfigAndGetState).toHaveBeenCalledTimes(1)
    expect(seen.api1.dbHost).toBe('db.prod.internal')
    expect(seen.api2.dbHost).toBe('db.prod.internal')
  })

  // print is NOT short-circuited: it resolves service references for real and
  // only falls back to the NOT_AVAILABLE_IN_PRINT_COMMAND sentinel when a
  // reference cannot resolve — the same matrix as the dot form
  // (`${producer.Output}`), which reads the last deployed state.
  test('print resolves a real value when the referenced state exists', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { dbHost: '${service:orders-db.DbEndpoint}' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState({
        'orders-db': { outputs: { DbEndpoint: 'db.alice.internal' } },
      }),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('db.alice.internal')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('print performs the pinned cross-stage read (no longer short-circuited)', async () => {
    resolveConfigAndGetState.mockResolvedValue({
      state: { outputs: { DbEndpoint: 'db.prod.internal' } },
    })
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api: { params: { dbHost: '${shared:orders-db.DbEndpoint}' } },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).toHaveBeenCalledTimes(1)
    expect(resolveConfigAndGetState.mock.calls[0][0].options.stage).toBe('prod')
    expect(seen.api.dbHost).toBe('db.prod.internal')
  })

  test('print falls back to the sentinel when the reference cannot resolve', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { dbHost: '${service:orders-db.DbEndpoint}' },
        },
      },
      keepNodes: ['api'],
    })

    // No state for orders-db at all: the provider's missing-state error becomes
    // the sentinel in print mode instead of failing the run.
    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(seen.api.dbHost).toBe('NOT_AVAILABLE_IN_PRINT_COMMAND')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('print falls back to the sentinel for an unknown alias (parity with dot form)', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: { params: { dbHost: '${service:nonexistent.DbEndpoint}' } },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(seen.api.dbHost).toBe('NOT_AVAILABLE_IN_PRINT_COMMAND')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('remove short-circuits to empty string before any fetch', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api: { params: { dbHost: '${shared:orders-db.DbEndpoint}' } },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['remove'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('')
  })

  test('missing pinned dependency throws a teaching error naming the PINNED stage', async () => {
    resolveConfigAndGetState.mockResolvedValue(undefined) // no state at prod
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api: { params: { dbHost: '${shared:orders-db.DbEndpoint}' } },
      },
      keepNodes: ['api'],
    })

    const error = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState(),
    }).catch((e) => e)
    expect(error.message).toMatch(/--stage prod/)
    // The teaching error surfaces as-is — not wrapped in the manager's generic
    // "Failed to resolve variable … : Error: …" envelope, which would repeat the
    // key and bury the fix.
    expect(error.message).not.toMatch(/Failed to resolve variable/)
    expect(error.message).toMatch(/^Could not resolve the parameter/)
    expect(resolveConfigAndGetState).toHaveBeenCalledTimes(1)
  })

  test('dot-form and service params coexist: each resolves via its own path', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: {
            // service-provider token (new dispatch pass)
            dbHost: '${service:orders-db.DbEndpoint}',
            // dot-form token (untouched legacy loop)
            queueUrl: '${orders-db.QueueUrl}',
            // plain literal
            region: 'us-east-1',
          },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState({
        'orders-db': {
          outputs: {
            DbEndpoint: 'db.alice.internal',
            QueueUrl: 'https://sqs/alice/q',
          },
        },
      }),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('db.alice.internal') // service provider
    expect(seen.api.queueUrl).toBe('https://sqs/alice/q') // dot-form loop
    expect(seen.api.region).toBe('us-east-1') // literal
  })

  test('the run stage comes from the Compose instance, not from the execution options', async () => {
    // The compose file's resolver manager owns the run stage; the Compose
    // instance carries it. Executing with NO stage option must therefore still
    // resolve at stage 'alice': the unpinned reference stays same-stage, and an
    // instance pinned to 'alice' is same-stage too — both read this run's
    // localState, neither triggers a pinned cross-stage get-state.
    const compose = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'alice' } },
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: {
            dbHost: '${service:orders-db.DbEndpoint}',
            pinnedToRunStage: '${shared:orders-db.DbEndpoint}',
          },
        },
      },
      keepNodes: ['api'],
    })

    const seen = {}
    const runnerFunction = jest.fn(async (args) => {
      seen[args.compose.serviceName] = args.compose.params
      return {}
    })
    await compose.executeComponentsGraph({
      command: ['deploy'],
      reverse: false,
      composeOrgName: 'org',
      // Deliberately empty: no --stage/-s to read a run stage from.
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction,
      state: freshState({
        'orders-db': { outputs: { DbEndpoint: 'db.alice.internal' } },
      }),
      isMultipleComponents: false,
    })

    expect(seen.api.dbHost).toBe('db.alice.internal')
    expect(seen.api.pinnedToRunStage).toBe('db.alice.internal')
    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
  })
})

describe('service-provider dispatch-pass resolution — nested tokens', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  // `${service:${opt:db}.DbEndpoint}` — the INNER token belongs to an ordinary
  // provider and is resolved by the up-front compose pass, so by dispatch time
  // the service reference is flat. Each command path must see the flat form.
  const innerNestedScenario = () =>
    buildScenario({
      runStage: 'alice',
      options: { db: 'orders-db' },
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { dbHost: '${service:${opt:db}.DbEndpoint}' },
        },
      },
      keepNodes: ['api'],
    })

  test('deploy: an ordinary token nested INSIDE a service reference resolves end to end', async () => {
    const compose = await innerNestedScenario()

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState({
        'orders-db': { outputs: { DbEndpoint: 'db.alice.internal' } },
      }),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('db.alice.internal')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('remove: the short-circuit rewrite sees the flat token and yields an empty string', async () => {
    const compose = await innerNestedScenario()

    const seen = await run(compose, {
      command: ['remove'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(seen.api.dbHost).toBe('')
  })

  test('print: the sentinel fallback applies to the nested form too', async () => {
    const compose = await innerNestedScenario()

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(seen.api.dbHost).toBe('NOT_AVAILABLE_IN_PRINT_COMMAND')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: a service reference nested INSIDE another provider resolves the enclosing token as well', async () => {
    // `${opt:${service:orders-db.OptionName}}` — the OUTER token is an ordinary
    // provider whose inner placeholder was deferred, so the up-front pass could
    // not resolve it. The dispatch pass must resolve both, not stop after the
    // inner one and hand the service a half-resolved `${opt:db}` literal.
    const compose = await buildScenario({
      runStage: 'alice',
      options: { db: 'orders-db' },
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: { dbHost: '${opt:${service:orders-db.OptionName}}' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState({ 'orders-db': { outputs: { OptionName: 'db' } } }),
    })

    expect(seen.api.dbHost).toBe('orders-db')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })
})

describe('service-provider dispatch-pass resolution — non-string params', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  // Compose's own param handling (getAllComponents + the dot-form loop) only
  // accepts string values, so non-string params never reach the graph run in
  // production. The service pass is exercised directly here to pin its own
  // contract: only string keys carrying a service reference are resolved and
  // returned; every other value is left exactly as declared.
  test('resolveServiceParams returns only the string keys that carry a service reference', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders-db': {},
        api: {
          dependsOn: ['orders-db'],
          params: {
            dbHost: '${service:orders-db.DbEndpoint}',
            retries: 3,
            enabled: true,
            tags: ['a', 'b'],
            region: 'us-east-1',
          },
        },
      },
      keepNodes: ['api'],
    })

    const resolved = await resolveServiceParams({
      manager: compose.resolverManager,
      alias: 'api',
      composeContext: {
        runStage: 'alice',
        aliases: ['orders-db', 'api'],
        command: ['deploy'],
        getOutputs: async () => ({ DbEndpoint: 'db.alice.internal' }),
        shortCircuitValue: () => undefined,
      },
    })

    expect(resolved).toEqual({ dbHost: 'db.alice.internal' })
    const params = compose.resolverManager.serviceConfigFile.services.api.params
    expect(params.retries).toBe(3)
    expect(params.enabled).toBe(true)
    expect(params.tags).toEqual(['a', 'b'])
    expect(params.region).toBe('us-east-1')
  })
})

// Nesting matrix: every combination of a service reference with another
// variable — a token nested inside the reference, the reference nested inside
// another token, and a reference pinned to another stage — pinned at the value
// each one actually produces on each command path.
//
// Deliberately NOT pinned: a fallback placed on the service reference itself
// (`${service:orders-db.Missing, 'x'}` and `${shared:orders-db.DbEndpoint,
// 'x'}` against undeployed state), which currently rejects instead of falling
// back. That behavior is still under decision, so no test fixes it in place.
describe('service-provider dispatch-pass resolution — nesting matrix', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  // Deployed state for both dependency services. `orders-db.EnvName` names an
  // environment variable so an enclosing `${env:...}` has something to look up,
  // and `registry.DbAlias` names a service so a reference can select one.
  const dbState = () =>
    freshState({
      'orders-db': {
        outputs: { DbEndpoint: 'db.alice.internal', EnvName: 'DB_HOST_ENV' },
      },
      registry: { outputs: { DbAlias: 'orders-db' } },
    })

  // One consumer (`api`) reading from two dependencies. `dependsOn` orders the
  // graph; only `api` is dispatched, so its params are the resolution under
  // test and the dependency values come from localState (or the state mock).
  const nestingScenario = ({ params, resolvers, composeParams, options }) =>
    buildScenario({
      runStage: 'alice',
      options,
      resolvers,
      params: composeParams,
      services: {
        'orders-db': {},
        registry: {},
        api: { dependsOn: ['orders-db', 'registry'], params },
      },
      keepNodes: ['api'],
    })

  // Set env vars (an `undefined` value unsets the key) for the duration of
  // `fn`, restoring the previous values afterwards either way.
  const withEnv = async (env, fn) => {
    const saved = Object.keys(env).map((key) => [key, process.env[key]])
    const apply = (entries) => {
      for (const [key, value] of entries) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
    apply(Object.entries(env))
    try {
      return await fn()
    } finally {
      apply(saved)
    }
  }

  test('deploy: a compose ${param:...} nested inside a service reference picks the dependency', async () => {
    const compose = await nestingScenario({
      composeParams: { dbAlias: 'orders-db' },
      params: { dbHost: '${service:${param:dbAlias}.DbEndpoint}' },
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: dbState(),
    })

    expect(seen.api.dbHost).toBe('db.alice.internal')
    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: a service reference nested inside another service reference resolves both levels', async () => {
    const compose = await nestingScenario({
      params: { dbHost: '${service:${service:registry.DbAlias}.DbEndpoint}' },
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: dbState(),
    })

    expect(seen.api.dbHost).toBe('db.alice.internal')
    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: a service reference supplying the KEY of an enclosing ${env:...} resolves both levels', async () => {
    const compose = await nestingScenario({
      params: { dbHost: '${env:${service:orders-db.EnvName}}' },
    })

    const seen = await withEnv({ DB_HOST_ENV: 'from-env' }, () =>
      run(compose, {
        command: ['deploy'],
        runStage: 'alice',
        state: dbState(),
      }),
    )

    expect(seen.api.dbHost).toBe('from-env')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('remove: the whole-value short-circuit wins over the enclosing ${env:...}', async () => {
    const compose = await nestingScenario({
      params: { dbHost: '${env:${service:orders-db.EnvName}}' },
    })

    const seen = await withEnv({ DB_HOST_ENV: 'from-env' }, () =>
      run(compose, {
        command: ['remove'],
        runStage: 'alice',
        state: freshState(),
      }),
    )

    // The rewrite replaces the ENTIRE value, enclosing token included, so
    // remove never asks the env provider for anything.
    expect(seen.api.dbHost).toBe('')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('print: an enclosing ${env:...} with no fallback rejects on the print sentinel', async () => {
    const compose = await nestingScenario({
      params: { dbHost: '${env:${service:orders-db.EnvName}}' },
    })

    // Documented caveat: print substitutes the sentinel for the unresolvable
    // service reference, so the ENCLOSING variable receives the placeholder as
    // its key — `${env:NOT_AVAILABLE_IN_PRINT_COMMAND}` — and there is no such
    // environment variable. The value-level short-circuit that rescues `remove`
    // does not apply, because print keeps resolving the outer token.
    await withEnv({ DB_HOST_ENV: 'from-env' }, async () => {
      await expect(
        run(compose, {
          command: ['print'],
          runStage: 'alice',
          state: freshState(),
        }),
      ).rejects.toThrow(
        /Cannot resolve '\$\{env:NOT_AVAILABLE_IN_PRINT_COMMAND\}'/,
      )
    })

    expect(Object.keys(compose.failedRuns)).toEqual(['api'])
  })

  test('print: a fallback on the enclosing variable rescues the sentinel key', async () => {
    const compose = await nestingScenario({
      params: { dbHost: "${env:${service:orders-db.EnvName}, 'n/a'}" },
    })

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(seen.api.dbHost).toBe('n/a')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: a fallback on the enclosing variable covers a resolved-but-missing env var', async () => {
    const compose = await nestingScenario({
      params: {
        dbHost: "${env:${service:orders-db.EnvName}, 'outer-default'}",
      },
    })

    // The service reference resolves (state is present) and hands the env
    // provider a real key; the variable is simply not set, so the fallback on
    // the ENCLOSING token supplies the value.
    const seen = await withEnv({ DB_HOST_ENV: undefined }, () =>
      run(compose, {
        command: ['deploy'],
        runStage: 'alice',
        state: dbState(),
      }),
    )

    expect(seen.api.dbHost).toBe('outer-default')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: a stage-pinned reference inside an enclosing ${env:...} get-states at the pinned stage', async () => {
    resolveConfigAndGetState.mockResolvedValue({
      state: { outputs: { EnvName: 'DB_HOST_ENV' } },
    })
    const compose = await nestingScenario({
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      params: { dbHost: '${env:${shared:orders-db.EnvName}}' },
    })

    const seen = await withEnv({ DB_HOST_ENV: 'from-env' }, () =>
      run(compose, {
        command: ['deploy'],
        runStage: 'alice',
        state: freshState(),
      }),
    )

    expect(resolveConfigAndGetState.mock.calls[0][0].options.stage).toBe('prod')
    expect(seen.api.dbHost).toBe('from-env')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: a nested reference inside a larger string keeps the surrounding literal', async () => {
    const compose = await nestingScenario({
      options: { db: 'orders-db' },
      params: {
        url: 'postgres://${service:${opt:db}.DbEndpoint}:5432/orders',
      },
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: dbState(),
    })

    expect(seen.api.url).toBe('postgres://db.alice.internal:5432/orders')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('print: a nested reference inside a larger string yields the sentinel in place', async () => {
    const compose = await nestingScenario({
      options: { db: 'orders-db' },
      params: {
        url: 'postgres://${service:${opt:db}.DbEndpoint}:5432/orders',
      },
    })

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: freshState(),
    })

    // No whole-value short-circuit here: the reference is only part of the
    // value, so the sentinel is substituted in place rather than replacing it.
    expect(seen.api.url).toBe(
      'postgres://NOT_AVAILABLE_IN_PRINT_COMMAND:5432/orders',
    )
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: two service references in one value both resolve', async () => {
    const compose = await nestingScenario({
      params: {
        pair: '${service:orders-db.DbEndpoint}|${service:registry.DbAlias}',
      },
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: dbState(),
    })

    expect(seen.api.pair).toBe('db.alice.internal|orders-db')
    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deploy: a service reference in fallback position resolves', async () => {
    // `${opt:missing, service:...}` — the reference is a fallback, so the value
    // text never contains `${service:`. The key is found through the graph.
    const compose = await nestingScenario({
      params: { dbHost: '${opt:missing, service:orders-db.DbEndpoint}' },
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: dbState(),
    })

    expect(seen.api.dbHost).toBe('db.alice.internal')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('remove: a service reference in fallback position short-circuits whole-value', async () => {
    const compose = await nestingScenario({
      params: { dbHost: '${opt:missing, service:orders-db.DbEndpoint}' },
    })

    const seen = await run(compose, {
      command: ['remove'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(seen.api.dbHost).toBe('')
    expect(resolveConfigAndGetState).not.toHaveBeenCalled()
  })
})

describe('service-provider dispatch-pass resolution — declared fallbacks', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  // A service reference reports "nothing here" by throwing a teaching error,
  // where `${aws:cf:...}` returns null. Without special handling the throw
  // would deny the variable its declared fallbacks, so `${service:x.Y, 'z'}`
  // behaved unlike every other variable in the Framework. It no longer does.
  const scenario = (params) =>
    buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': {},
        api: { dependsOn: ['orders-db'], params },
      },
      keepNodes: ['api'],
    })

  const deployedState = () =>
    freshState({
      'orders-db': { outputs: { DbEndpoint: 'db.alice.internal' } },
    })

  test('a missing output falls back instead of failing the run', async () => {
    const compose = await scenario({
      dbHost: "${service:orders-db.Missing, 'fallback-value'}",
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    })

    expect(seen.api.dbHost).toBe('fallback-value')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('an unknown service does not fall back — a typo is not a missing value', async () => {
    // A static unknown alias fails at graph build (see the edges suite); this
    // harness bypasses the build, so it exercises the provider's own check —
    // the backstop for an alias produced by a deferred inner reference.
    const compose = await scenario({
      dbHost: "${service:nonexistent.DbEndpoint, 'fallback-value'}",
    })

    const error = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    }).catch((e) => e)

    expect(error.message).toMatch(/'nonexistent' is not a known service/)
  })

  test('a service alias with an underscore resolves', async () => {
    // The alias is whatever the compose file declares under `services`; the
    // reference grammar splits on the first dot and leaves alias validity to
    // the known-services check.
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        orders_db: {},
        api: {
          dependsOn: ['orders_db'],
          params: { h: '${service:orders_db.Host}' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState({
        orders_db: { outputs: { Host: 'db.alice.internal' } },
      }),
    })

    expect(seen.api.h).toBe('db.alice.internal')
  })

  test('print fails on an operational failure of a pinned read instead of rendering the placeholder', async () => {
    // The placeholder stands for "not available yet"; a credentials or state
    // store failure is neither, and hiding it behind the placeholder would
    // make print report success with a fabricated value.
    resolveConfigAndGetState.mockRejectedValue(
      new Error(
        'ExpiredToken: The security token included in the request is expired',
      ),
    )
    const compose = await scenario({ dbHost: '${shared:orders-db.DbEndpoint}' })

    const error = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: deployedState(),
    }).catch((e) => e)

    expect(error.message).toMatch(/ExpiredToken/)
  })

  test('an output key that only exists on Object.prototype is a missing output', async () => {
    const compose = await scenario({
      dbHost: '${service:orders-db.toString}',
    })

    const error = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    }).catch((e) => e)

    expect(error.message).toMatch(/has no output 'toString'/)
  })

  test('a service alias containing a dot resolves; the output key follows the last dot', async () => {
    const compose = await buildScenario({
      runStage: 'alice',
      services: {
        'orders.db': {},
        api: {
          dependsOn: ['orders.db'],
          params: { h: '${service:orders.db.Host}' },
        },
      },
      keepNodes: ['api'],
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState({
        'orders.db': { outputs: { Host: 'db.alice.internal' } },
      }),
    })

    expect(seen.api.h).toBe('db.alice.internal')
  })

  test('two params referencing the same missing output each take their own fallback', async () => {
    // The second lookup of the same key hits the resolver cache; a cached
    // rejection must still be treated as "no value" for that param too.
    const compose = await scenario({
      a: "${service:orders-db.Missing, 'first'}",
      b: "${service:orders-db.Missing, 'second'}",
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    })

    expect(seen.api).toEqual(
      expect.objectContaining({ a: 'first', b: 'second' }),
    )
  })

  test('a malformed reference does not fall back', async () => {
    const compose = await scenario({
      dbHost: "${service:orders-db, 'fallback-value'}",
    })

    const error = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    }).catch((e) => e)

    expect(error.message).toMatch(/expected a reference of the shape/)
  })

  test('an operational failure reading a pinned dependency propagates past a fallback', async () => {
    resolveConfigAndGetState.mockRejectedValue(
      new Error(
        'ExpiredToken: The security token included in the request is expired',
      ),
    )
    const compose = await scenario({
      dbHost: "${shared:orders-db.DbEndpoint, 'fallback-value'}",
    })

    const error = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    }).catch((e) => e)

    expect(error.message).toMatch(/ExpiredToken/)
  })

  test('an undeployed pinned dependency falls back', async () => {
    resolveConfigAndGetState.mockResolvedValue(undefined) // no state at prod
    const compose = await scenario({
      dbHost: "${shared:orders-db.DbEndpoint, 'localhost'}",
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: freshState(),
    })

    expect(resolveConfigAndGetState).toHaveBeenCalledTimes(1)
    expect(seen.api.dbHost).toBe('localhost')
  })

  test('another service reference can be the fallback', async () => {
    const compose = await scenario({
      dbHost: '${service:orders-db.Missing, service:orders-db.DbEndpoint}',
    })

    const seen = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    })

    expect(seen.api.dbHost).toBe('db.alice.internal')
  })

  test('with no fallback declared the teaching error is unchanged', async () => {
    const compose = await scenario({
      dbHost: '${service:orders-db.Missing}',
    })

    const error = await run(compose, {
      command: ['deploy'],
      runStage: 'alice',
      state: deployedState(),
    }).catch((e) => e)

    expect(error.message).toMatch(/^Could not resolve the parameter/)
    expect(error.message).toMatch(/has no output 'Missing'/)
    expect(error.message).toMatch(/Available outputs: DbEndpoint/)
  })

  test('print still renders the placeholder, not the fallback', async () => {
    // print never fails on an unresolvable reference: the provider substitutes
    // its sentinel and returns, so the fallback is never reached. Same as the
    // existing `${alias.Output}` form, and it keeps `print` output honest about
    // what is actually deployed.
    const compose = await scenario({
      dbHost: "${service:orders-db.Missing, 'fallback-value'}",
    })

    const seen = await run(compose, {
      command: ['print'],
      runStage: 'alice',
      state: deployedState(),
    })

    expect(seen.api.dbHost).toBe('NOT_AVAILABLE_IN_PRINT_COMMAND')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })
})
