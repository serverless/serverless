import { jest } from '@jest/globals'
import { parseComposeGraph } from '../../../../src/lib/runners/compose/index.js'

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
      aside: (s) => s,
      bold: (s) => s,
      strong: (s) => s,
      error: (s) => s,
    },
    ServerlessError: class ServerlessError extends Error {
      constructor(message, code, opts) {
        super(message)
        this.code = code
        if (opts?.stack === false) this.stack = undefined
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

/**
 * Helper to build a two-service compose configuration where
 * service-b depends on service-a's output via a param reference.
 */
const buildTwoServiceConfig = () => ({
  services: {
    'service-a': {
      path: './service-a',
    },
    'service-b': {
      path: './service-b',
      params: {
        apiUrl: '${service-a.apiEndpoint}',
      },
    },
  },
})

/**
 * Helper to create a mock state object.
 */
const createMockState = (localState = {}) => ({
  localState,
  putServiceState: jest.fn(),
  getServiceState: jest.fn(),
})

/**
 * Creates a mock runner function that returns the given state and IDs.
 */
const createMockRunnerFunction =
  ({
    state = {},
    serviceUniqueId = 'stack-id-123',
    runnerType = 'traditional',
  } = {}) =>
  async () => ({ state, serviceUniqueId, runnerType })

describe('Compose', () => {
  beforeEach(() => {
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('executeComponentsGraph - param resolution', () => {
    test('package command uses placeholder for unresolved cross-service params', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const receivedParams = {}
      // service-a returns no outputs (as package does in practice)
      const mockRunner = async ({ compose: composeCtx }) => {
        receivedParams[composeCtx.serviceName] = { ...composeCtx.params }
        return {
          state: {},
          serviceUniqueId: `stack-${composeCtx.serviceName}`,
          runnerType: 'traditional',
        }
      }

      const state = createMockState()

      await compose.executeComponentsGraph({
        command: ['package'],
        options: {},
        resolverProviders: {},
        params: {},
        runnerFunction: mockRunner,
        state,
      })

      // service-b should receive the placeholder, not throw
      expect(receivedParams['service-b'].apiUrl).toBe(
        'NOT_AVAILABLE_AT_PACKAGE_TIME',
      )
    })

    test('print command uses placeholder for unresolved cross-service params', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const receivedParams = {}
      const mockRunner = async ({ compose: composeCtx }) => {
        receivedParams[composeCtx.serviceName] = { ...composeCtx.params }
        return {
          state: {},
          serviceUniqueId: `stack-${composeCtx.serviceName}`,
          runnerType: 'traditional',
        }
      }

      const state = createMockState()

      await compose.executeComponentsGraph({
        command: ['print'],
        options: {},
        resolverProviders: {},
        params: {},
        runnerFunction: mockRunner,
        state,
      })

      expect(receivedParams['service-b'].apiUrl).toBe(
        'NOT_AVAILABLE_AT_PACKAGE_TIME',
      )
    })

    test('deploy command fails when cross-service param cannot be resolved', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      // service-a returns no outputs, so service-b cannot resolve its param
      const mockRunner = async ({ compose: composeCtx }) => ({
        state: {},
        serviceUniqueId: `stack-${composeCtx.serviceName}`,
        runnerType: 'traditional',
      })

      const state = createMockState()

      // With isMultipleComponents=true (default), errors are caught and
      // recorded in failedRuns rather than thrown
      await compose.executeComponentsGraph({
        command: ['deploy'],
        options: {},
        resolverProviders: {},
        params: {},
        runnerFunction: mockRunner,
        state,
      })

      expect(Object.keys(compose.failedRuns)).toContain('service-b')
      expect(compose.failedRuns['service-b'][0].message).toMatch(
        /Could not resolve the parameter 'apiUrl'/,
      )
    })

    test('deploy command resolves cross-service param from state', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const receivedParams = {}
      const mockRunner = async ({ compose: composeCtx }) => {
        receivedParams[composeCtx.serviceName] = { ...composeCtx.params }
        return {
          state: { outputs: { apiEndpoint: 'https://api.example.com' } },
          serviceUniqueId: `stack-${composeCtx.serviceName}`,
          runnerType: 'traditional',
        }
      }

      const state = createMockState()

      await compose.executeComponentsGraph({
        command: ['deploy'],
        options: {},
        resolverProviders: {},
        params: {},
        runnerFunction: mockRunner,
        state,
      })

      expect(receivedParams['service-b'].apiUrl).toBe('https://api.example.com')
    })

    test('remove command uses empty string for unresolved cross-service params', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const receivedParams = {}
      const mockRunner = async ({ compose: composeCtx }) => {
        receivedParams[composeCtx.serviceName] = { ...composeCtx.params }
        return {
          state: {},
          serviceUniqueId: `stack-${composeCtx.serviceName}`,
          runnerType: 'traditional',
        }
      }

      const state = createMockState()

      await compose.executeComponentsGraph({
        command: ['remove'],
        options: {},
        resolverProviders: {},
        params: {},
        runnerFunction: mockRunner,
        state,
      })

      expect(receivedParams['service-b'].apiUrl).toBe('')
    })
  })

  describe('updateLocalState', () => {
    test('does not persist empty state to remote store', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const state = createMockState()

      await compose.updateLocalState({
        alias: 'service-a',
        runnerOutput: {
          state: {},
          serviceUniqueId: 'stack-123',
          runnerType: 'traditional',
        },
        command: ['package'],
        state,
        graph: compose.graph,
      })

      expect(state.putServiceState).not.toHaveBeenCalled()
    })

    test('persists state with outputs to remote store', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const state = createMockState()
      const returnedState = {
        outputs: { apiEndpoint: 'https://api.example.com' },
      }

      await compose.updateLocalState({
        alias: 'service-a',
        runnerOutput: {
          state: returnedState,
          serviceUniqueId: 'stack-123',
          runnerType: 'traditional',
        },
        command: ['deploy'],
        state,
        graph: compose.graph,
      })

      expect(state.putServiceState).toHaveBeenCalledWith({
        serviceUniqueId: 'stack-123',
        runnerType: 'traditional',
        value: JSON.stringify(returnedState),
      })
      expect(state.localState['service-a']).toEqual(returnedState)
    })

    test('falls back to remote state when runner returns no outputs', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const remoteState = {
        outputs: { apiEndpoint: 'https://api.example.com' },
      }
      const state = createMockState()
      state.getServiceState.mockResolvedValue(remoteState)

      await compose.updateLocalState({
        alias: 'service-a',
        runnerOutput: {
          state: {},
          serviceUniqueId: 'stack-123',
          runnerType: 'traditional',
        },
        command: ['package'],
        state,
        graph: compose.graph,
      })

      // Should not overwrite remote state
      expect(state.putServiceState).not.toHaveBeenCalled()
      // Should fetch remote state as fallback (service-a has a predecessor: service-b depends on it)
      expect(state.getServiceState).toHaveBeenCalledWith({
        serviceUniqueId: 'stack-123',
        runnerType: 'traditional',
      })
      expect(state.localState['service-a']).toEqual(remoteState)
    })

    test('does not persist state for get-state command', async () => {
      const compose = await parseComposeGraph({
        servicePath: '/tmp/project',
        configuration: buildTwoServiceConfig(),
        versions: { serverless_framework: '4.0.0' },
      })

      const state = createMockState()

      await compose.updateLocalState({
        alias: 'service-a',
        runnerOutput: {
          state: { outputs: { apiEndpoint: 'https://api.example.com' } },
          serviceUniqueId: 'stack-123',
          runnerType: 'traditional',
        },
        command: ['get-state'],
        state,
        graph: compose.graph,
      })

      expect(state.putServiceState).not.toHaveBeenCalled()
    })
  })
})
