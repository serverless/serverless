import { jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => {
  const noopFn = () => ({
    notice: () => {},
    remove: () => {},
    get: () => noopFn(),
  })
  return {
    log: {
      get: () => ({
        info: () => {},
        debug: () => {},
        writeCompose: () => {},
        logoCompose: () => {},
      }),
    },
    progress: { get: noopFn },
    style: {
      aside: (v) => v,
      bold: (v) => v,
      strong: (v) => v,
      error: (v) => v,
      warning: (v) => v,
    },
    ServerlessError: class ServerlessError extends Error {
      constructor(message, code, options) {
        super(message)
        this.code = code
        if (options?.stack === false) this.stack = undefined
      }
    },
    ServerlessErrorCodes: {
      compose: {
        COMPOSE_COULD_NOT_RESOLVE_PARAM: 'COMPOSE_COULD_NOT_RESOLVE_PARAM',
        COMPOSE_CONFIGURATION_INVALID: 'COMPOSE_CONFIGURATION_INVALID',
        COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST:
          'COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST',
        COMPOSE_GRAPH_CIRCULAR_DEPENDENCY: 'COMPOSE_GRAPH_CIRCULAR_DEPENDENCY',
      },
    },
  }
})
jest.unstable_mockModule('../../../../../src/lib/router.js', () => ({
  getRunner: jest.fn(),
  route: jest.fn(),
}))
jest.unstable_mockModule('../../../../../src/utils/index.js', () => ({
  getHumanFriendlyTime: jest.fn(),
}))

const { parseComposeGraph } =
  await import('../../../../../src/lib/runners/compose/index.js')

const TWO_SERVICES = {
  services: {
    producer: { path: './producer' },
    consumer: {
      path: './consumer',
      params: { queueUrl: '${producer.QueueUrl}' },
    },
  },
}

const buildCompose = () =>
  parseComposeGraph({
    servicePath: '/tmp/project',
    configuration: TWO_SERVICES,
    versions: { serverless_framework: '4.0.0' },
    runStage: 'dev',
  })

const mockState = () => ({
  localState: {},
  putServiceState: jest.fn(),
  getServiceState: jest.fn(),
})

const runnerOutput = (state) => ({
  state,
  serviceUniqueId: 'stack-producer',
  runnerType: 'traditional',
})

describe('updateLocalState state authority', () => {
  afterEach(() => {
    process.exitCode = undefined
    jest.clearAllMocks()
  })

  test.each([
    ['deploy', { outputs: { QueueUrl: 'https://q' } }],
    ['deploy', { outputs: {} }], // stale-clear on last-output removal
    ['info', { outputs: { QueueUrl: 'https://q' } }],
    ['remove', {}], // intentional clear
  ])('%s persists its returned state %j', async (cmd, returned) => {
    const compose = await buildCompose()
    const state = mockState()
    await compose.updateLocalState({
      alias: 'producer',
      runnerOutput: runnerOutput(returned),
      command: [cmd],
      state,
      graph: compose.graph,
    })
    expect(state.putServiceState).toHaveBeenCalledWith({
      serviceUniqueId: 'stack-producer',
      runnerType: 'traditional',
      value: JSON.stringify(returned),
    })
    expect(state.localState.producer).toEqual(returned)
  })

  test.each([
    ['package'],
    ['print'],
    ['logs'],
    ['invoke'],
    ['deploy function'],
  ])('%s never persists, even a fabricated {} state', async (cmdString) => {
    const compose = await buildCompose()
    const state = mockState()
    state.getServiceState.mockResolvedValue({
      outputs: { QueueUrl: 'https://q' },
    })
    await compose.updateLocalState({
      alias: 'producer',
      runnerOutput: runnerOutput({}), // fabricated empty state (pre-fix producer shape)
      command: cmdString.split(' '),
      state,
      graph: compose.graph,
    })
    expect(state.putServiceState).not.toHaveBeenCalled()
    // The fabricated {} is discarded; localState carries the stored value.
    expect(state.localState.producer).toEqual({
      outputs: { QueueUrl: 'https://q' },
    })
  })

  test('non-writer falls back to the store when the service has dependents', async () => {
    const compose = await buildCompose()
    const state = mockState()
    const stored = { outputs: { QueueUrl: 'https://q' } }
    state.getServiceState.mockResolvedValue(stored)
    await compose.updateLocalState({
      alias: 'producer', // consumer depends on it → predecessors non-empty
      runnerOutput: runnerOutput(undefined), // honest post-fix producer shape
      command: ['package'],
      state,
      graph: compose.graph,
    })
    expect(state.getServiceState).toHaveBeenCalledWith({
      serviceUniqueId: 'stack-producer',
      runnerType: 'traditional',
    })
    expect(state.localState.producer).toEqual(stored)
    expect(state.putServiceState).not.toHaveBeenCalled()
  })

  test('non-writer skips the store read for a service without dependents', async () => {
    const compose = await buildCompose()
    const state = mockState()
    await compose.updateLocalState({
      alias: 'consumer', // nothing depends on consumer
      runnerOutput: runnerOutput(undefined),
      command: ['package'],
      state,
      graph: compose.graph,
    })
    expect(state.getServiceState).not.toHaveBeenCalled()
    expect(state.putServiceState).not.toHaveBeenCalled()
  })

  test('never-deployed service (no serviceUniqueId) reads nothing, localState null', async () => {
    const compose = await buildCompose()
    const state = mockState()
    await compose.updateLocalState({
      alias: 'producer',
      runnerOutput: {
        state: undefined,
        serviceUniqueId: null,
        runnerType: 'traditional',
      },
      command: ['package'],
      state,
      graph: compose.graph,
    })
    expect(state.getServiceState).not.toHaveBeenCalled()
    expect(state.localState.producer).toBeNull()
  })

  test('get-state never persists (writer list does not reintroduce it)', async () => {
    const compose = await buildCompose()
    const state = mockState()
    await compose.updateLocalState({
      alias: 'producer',
      runnerOutput: runnerOutput({ outputs: { QueueUrl: 'https://q' } }),
      command: ['get-state'],
      state,
      graph: compose.graph,
    })
    expect(state.putServiceState).not.toHaveBeenCalled()
    expect(state.localState.producer).toEqual({
      outputs: { QueueUrl: 'https://q' },
    })
  })

  test('a non-writer returning a garbage string cannot reach the store or localState-as-state', async () => {
    const compose = await buildCompose()
    const state = mockState()
    state.getServiceState.mockResolvedValue({
      outputs: { QueueUrl: 'https://q' },
    })
    await compose.updateLocalState({
      alias: 'producer',
      runnerOutput: runnerOutput('service: producer\n...rendered yaml...'),
      command: ['print'],
      state,
      graph: compose.graph,
    })
    expect(state.putServiceState).not.toHaveBeenCalled()
    expect(state.localState.producer).toEqual({
      outputs: { QueueUrl: 'https://q' },
    })
  })
})

describe('cross-service param resolution by command', () => {
  afterEach(() => {
    process.exitCode = undefined
    jest.clearAllMocks()
  })

  const capturingRunner =
    (received) =>
    async ({ compose: ctx }) => {
      received[ctx.serviceName] = { ...ctx.params }
      return {
        state: undefined,
        serviceUniqueId: `stack-${ctx.serviceName}`,
        runnerType: 'traditional',
      }
    }

  const neverDeployedRunner =
    (received) =>
    async ({ compose: ctx }) => {
      received[ctx.serviceName] = { ...ctx.params }
      return {
        state: undefined,
        serviceUniqueId: null,
        runnerType: 'traditional',
      }
    }

  // Reporting an empty state object is remove's intentional clear, and the
  // shape a read-only command must never be able to persist or resolve from.
  const emptyStateRunner =
    (received) =>
    async ({ compose: ctx }) => {
      received[ctx.serviceName] = { ...ctx.params }
      return {
        state: {},
        serviceUniqueId: `stack-${ctx.serviceName}`,
        runnerType: 'traditional',
      }
    }

  test('package resolves the consumer param from stored outputs', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    state.getServiceState.mockResolvedValue({
      outputs: { QueueUrl: 'https://q' },
    })
    await compose.executeComponentsGraph({
      command: ['package'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: capturingRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('https://q')
    expect(state.putServiceState).not.toHaveBeenCalled()
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('package with a never-deployed producer fails the consumer with the teaching error', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    // never deployed: no serviceUniqueId → no store read possible
    await compose.executeComponentsGraph({
      command: ['package'],
      options: { stage: 'dev' },
      resolverProviders: {},
      params: {},
      runnerFunction: neverDeployedRunner(received),
      state,
    })
    expect(Object.keys(compose.failedRuns)).toContain('consumer')
    expect(compose.failedRuns.consumer[0].message).toMatch(
      /no deployed state found for service 'producer'/,
    )
    expect(compose.failedRuns.consumer[0].message).toMatch(/--stage dev/)
  })

  test('print shows the real stored value when the producer is deployed', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    state.getServiceState.mockResolvedValue({
      outputs: { QueueUrl: 'https://q' },
    })
    await compose.executeComponentsGraph({
      command: ['print'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: capturingRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('https://q')
  })

  test('print falls back to the sentinel when no state exists, and never fails', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    await compose.executeComponentsGraph({
      command: ['print'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: neverDeployedRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('NOT_AVAILABLE_IN_PRINT_COMMAND')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('an empty-string stored output value passes through (not treated as missing)', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    state.getServiceState.mockResolvedValue({ outputs: { QueueUrl: '' } })
    await compose.executeComponentsGraph({
      command: ['package'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: capturingRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
  })

  test('deployed producer whose stack has zero outputs teaches the (none) listing', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    state.getServiceState.mockResolvedValue({ outputs: {} })
    await compose.executeComponentsGraph({
      command: ['package'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: capturingRunner(received),
      state,
    })
    expect(Object.keys(compose.failedRuns)).toContain('consumer')
    expect(compose.failedRuns.consumer[0].message).toMatch(
      /has no output 'QueueUrl'/,
    )
    expect(compose.failedRuns.consumer[0].message).toMatch(/\(none\)/)
  })

  test('remove still substitutes empty string for refs', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    await compose.executeComponentsGraph({
      command: ['remove'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: emptyStateRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('')
  })

  test('deploy still fails loudly when the producer run yields no outputs and no store state', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    await compose.executeComponentsGraph({
      command: ['deploy'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: neverDeployedRunner(received),
      state,
    })
    expect(Object.keys(compose.failedRuns)).toContain('consumer')
  })

  test('package survives a producer that reports an empty state object', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    state.getServiceState.mockResolvedValue({
      outputs: { QueueUrl: 'https://q' },
    })
    await compose.executeComponentsGraph({
      command: ['package'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: emptyStateRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('https://q')
    expect(Object.keys(compose.failedRuns)).toHaveLength(0)
    // The stored outputs of the producer are left untouched.
    expect(state.putServiceState).not.toHaveBeenCalled()
  })

  test('print survives a producer that reports an empty state object', async () => {
    const compose = await buildCompose()
    const received = {}
    const state = mockState()
    state.getServiceState.mockResolvedValue({
      outputs: { QueueUrl: 'https://q' },
    })
    await compose.executeComponentsGraph({
      command: ['print'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: emptyStateRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('https://q')
    expect(state.putServiceState).not.toHaveBeenCalled()
  })

  test('fan-out: two consumers of one producer both resolve during package', async () => {
    const compose = await parseComposeGraph({
      servicePath: '/tmp/project',
      configuration: {
        services: {
          producer: { path: './producer' },
          consumer: {
            path: './consumer',
            params: { queueUrl: '${producer.QueueUrl}' },
          },
          consumer2: {
            path: './consumer2',
            params: { q2: '${producer.QueueUrl}' },
          },
        },
      },
      versions: { serverless_framework: '4.0.0' },
      runStage: 'dev',
    })
    const received = {}
    const state = mockState()
    state.getServiceState.mockResolvedValue({
      outputs: { QueueUrl: 'https://q' },
    })
    await compose.executeComponentsGraph({
      command: ['package'],
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction: capturingRunner(received),
      state,
    })
    expect(received.consumer.queueUrl).toBe('https://q')
    expect(received.consumer2.q2).toBe('https://q')
  })
})
