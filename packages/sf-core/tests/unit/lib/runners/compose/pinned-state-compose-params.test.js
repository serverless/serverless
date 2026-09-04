import { jest } from '@jest/globals'

// Mock state.js so the pinned cross-stage get-state call is observable without
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
const { log } = await import('@serverless/util')
const graphlib = (await import('@dagrejs/graphlib')).default

const logger = log.get('test:pinned-state-compose-params')

/**
 * Build a Compose instance + real ResolverManager wired together the way
 * production does, sharing ONE config object and in production ORDER: params
 * (tokens included) are in the configuration before the compose-file manager's
 * up-front pass, and the graph is built with that manager, so service edges and
 * the graph-build key map come from the placeholder graph exactly as in
 * `ComposeRunner.run()`. The run graph is then narrowed to `keepNodes`.
 */
const buildScenario = async ({
  services,
  resolvers,
  composeParams,
  runStage,
  keepNodes,
}) => {
  const configuration = {
    stages: {
      default: {
        ...(resolvers ? { resolvers } : {}),
        ...(composeParams ? { params: composeParams } : {}),
      },
    },
    services: Object.fromEntries(
      Object.entries(services).map(([name, def]) => [
        name,
        { path: name, ...(def.dependsOn ? { dependsOn: def.dependsOn } : {}) },
      ]),
    ),
  }

  // Production order: the params (tokens included) are in the configuration
  // before the compose-file manager's up-front pass, and the graph is built
  // with that manager — the same sequence `ComposeRunner.run()` follows.
  for (const [name, def] of Object.entries(services)) {
    if (def.params) {
      configuration.services[name].params = { ...def.params }
    }
  }

  const manager = new ResolverManager(
    logger,
    configuration,
    '/tmp/pinned-state-compose-params',
    { stage: runStage },
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

  const compose = await parseComposeGraph({
    servicePath: '/tmp/pinned-state-compose-params',
    configuration,
    versions: {},
    resolverManager: manager,
    runStage,
    instanceStages: manager.getServiceTypedInstanceStages(),
  })

  // Narrow the run graph to the consumer(s), keeping the edges between them so
  // dispatch order stays the production order rather than insertion order.
  const fullGraph = compose.graph
  const nodeData = new Map(keepNodes.map((n) => [n, fullGraph.node(n)]))
  compose.graph = new graphlib.Graph()
  for (const [name, data] of nodeData) {
    compose.graph.setNode(name, data)
  }
  for (const name of nodeData.keys()) {
    for (const successor of fullGraph.successors(name) ?? []) {
      if (nodeData.has(successor)) compose.graph.setEdge(name, successor)
    }
  }

  return { compose, manager }
}

const run = ({ compose, manager, runStage, state }) =>
  compose.executeComponentsGraph({
    command: ['deploy'],
    reverse: false,
    composeOrgName: 'org',
    options: { stage: runStage },
    resolverProviders: {},
    params: manager.params,
    runnerFunction: jest.fn(async () => ({})),
    state,
    isMultipleComponents: false,
  })

const freshState = (localState = {}) => ({
  localState,
  getServiceState: jest.fn(),
  putServiceState: jest.fn(),
})

describe('pinned cross-stage get-state receives the run Compose params', () => {
  beforeEach(() => {
    resolveConfigAndGetState.mockReset()
    resolveConfigAndGetState.mockResolvedValue({
      state: { outputs: { TopicArn: 'arn:aws:sns:::topic' } },
    })
  })

  // The pinned read resolves the DEPENDENCY's own serverless.yml at another
  // stage. That config may consume `${param:...}` supplied by the compose file,
  // and the param provider merges those from `compose.params`. Handing it an
  // empty object makes those params non-existent for the dependency, so its
  // resolution fails with a missing-variable error that aborts the whole
  // Compose run.
  test('forwards the resolved global compose params to the pinned lookup', async () => {
    const { compose, manager } = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      composeParams: { ordersDataSet: 'orders', region: 'eu-west-1' },
      services: {
        'orders-db': {},
        api: { params: { topic: '${shared:orders-db.TopicArn}' } },
      },
      keepNodes: ['api'],
    })

    await run({ compose, manager, runStage: 'alice', state: freshState() })

    expect(resolveConfigAndGetState).toHaveBeenCalledTimes(1)
    const pinnedCall = resolveConfigAndGetState.mock.calls[0][0]
    expect(pinnedCall.options.stage).toBe('prod')
    expect(pinnedCall.compose.serviceName).toBe('orders-db')
    expect(pinnedCall.compose.params).toMatchObject({
      ordersDataSet: 'orders',
      region: 'eu-west-1',
    })
  })

  // A normal dispatch of the dependency would also receive its own
  // `services.<alias>.params` layered over the global ones. The pinned read
  // gets the same, with a documented boundary: dot-form references resolve from
  // the run's local state, and service-typed tokens are left out rather than
  // recursed into.
  test("layers the pinned dependency's own resolved service params over the global ones", async () => {
    const { compose, manager } = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      composeParams: { ordersDataSet: 'orders' },
      services: {
        worker: {},
        'orders-db': {
          params: {
            plainSetting: 'literal-value',
            fromDep: '${worker.JobsQueueUrl}',
            ordersDataSet: 'overridden-by-service',
          },
        },
        api: { params: { topic: '${shared:orders-db.TopicArn}' } },
      },
      keepNodes: ['api'],
    })

    await run({
      compose,
      manager,
      runStage: 'alice',
      state: freshState({
        worker: { outputs: { JobsQueueUrl: 'https://sqs/jobs' } },
      }),
    })

    const pinnedCall = resolveConfigAndGetState.mock.calls[0][0]
    expect(pinnedCall.compose.params).toEqual({
      ordersDataSet: 'overridden-by-service',
      plainSetting: 'literal-value',
      fromDep: 'https://sqs/jobs',
    })
    // The dependency's raw (unresolved) service params travel alongside, as
    // they do for a normal dispatch.
    expect(pinnedCall.compose.serviceParams).toEqual({
      plainSetting: 'literal-value',
      fromDep: 'worker.JobsQueueUrl',
      ordersDataSet: 'overridden-by-service',
    })
  })

  // Boundary: a service-typed token inside the pinned dependency's own params
  // would need dispatch-time compose state (and could recurse back into this
  // very pinned read). Such keys are omitted instead of being forwarded as raw
  // literals, and a dot-form reference whose output is not in local state yet is
  // likewise omitted rather than throwing — this is a read-only lookup.
  test('omits service-typed and not-yet-available params instead of forwarding literals', async () => {
    const { compose, manager } = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      composeParams: { ordersDataSet: 'orders' },
      services: {
        worker: {},
        'orders-db': {
          params: {
            queue: '${service:worker.JobsQueueUrl}',
            notDeployedYet: '${worker.SomeOutput}',
          },
        },
        api: { params: { topic: '${shared:orders-db.TopicArn}' } },
      },
      keepNodes: ['api'],
    })

    await run({ compose, manager, runStage: 'alice', state: freshState() })

    const pinnedCall = resolveConfigAndGetState.mock.calls[0][0]
    expect(pinnedCall.compose.params).toEqual({ ordersDataSet: 'orders' })
    expect(pinnedCall.compose.params.queue).toBeUndefined()
    expect(pinnedCall.compose.params.notDeployedYet).toBeUndefined()
  })
  test("omits the dependency's service-typed params even after its own pass has run", async () => {
    // `api` depends on `orders-db` (the harness keeps that edge), so the
    // dependency's own dispatch pass runs first and prunes its service nodes
    // from the live placeholder graph before the pinned read forwards params.
    // The set of keys to omit must not depend on that order.
    resolveConfigAndGetState.mockResolvedValue({
      state: { outputs: { TopicArn: 'arn:prod' } },
    })
    const { compose, manager } = await buildScenario({
      runStage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      composeParams: { ordersDataSet: 'orders' },
      services: {
        worker: {},
        'orders-db': { params: { queue: '${service:worker.JobsQueueUrl}' } },
        api: {
          dependsOn: ['orders-db'],
          params: { topic: '${shared:orders-db.TopicArn}' },
        },
      },
      keepNodes: ['orders-db', 'api'],
    })

    await run({
      compose,
      manager,
      runStage: 'alice',
      state: freshState({ worker: { outputs: { JobsQueueUrl: 'q' } } }),
    })

    const pinnedCall = resolveConfigAndGetState.mock.calls[0][0]
    expect(pinnedCall.compose.params).toEqual({ ordersDataSet: 'orders' })
  })
})
