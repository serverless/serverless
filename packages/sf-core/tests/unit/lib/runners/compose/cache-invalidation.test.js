import { jest } from '@jest/globals'
// Importing router.js first resolves a pre-existing circular-import ordering
// issue (compose/index.js -> ../../router.js -> compose/index.js).
import '../../../../../src/lib/router.js'
import { parseComposeGraph } from '../../../../../src/lib/runners/compose/index.js'
import { variables } from '../../../../../src/lib/resolvers/index.js'

/**
 * A finished service run that changed stacks must not leave a later service
 * reading a cached pre-run value: after each `deploy`/`remove` node the runner
 * tells the resolver providers to forget what they cached. Commands that
 * change nothing (`print`, and `info`, which writes state but mutates no
 * stack) must not pay for a re-fetch.
 *
 * `consumer` depends on `producer`, so the graph has two waves and the tests
 * can pin *when* the invalidation happens — between the two runs — rather than
 * only how many times it happened. Counting alone passes even if the clear
 * moves before the mutation, which is the way a refactor would break this.
 */

const CONFIG = {
  services: {
    producer: { path: './producer' },
    consumer: { path: './consumer', dependsOn: 'producer' },
  },
}

/**
 * Run the real graph with a stubbed runner and return one ordered event log:
 * `run:<alias>` from the runner, `invalidate` from the provider-cache hook.
 */
const runGraph = async (command, { events, failOn } = {}) => {
  const compose = await parseComposeGraph({
    servicePath: '/tmp/compose-cache-invalidation-test',
    configuration: JSON.parse(JSON.stringify(CONFIG)),
    versions: {},
    runStage: 'dev',
  })
  await compose.executeComponentsGraph({
    command,
    reverse: false,
    composeOrgName: 'test-org',
    options: { stage: 'dev' },
    resolverProviders: {},
    params: {},
    runnerFunction: async (args) => {
      const alias = args.compose.serviceName
      events.push(`run:${alias}`)
      if (alias === failOn) {
        throw new Error(`${alias} failed`)
      }
      return { state: { outputs: {} } }
    },
    state: {
      localState: {},
      getServiceState: async () => null,
      putServiceState: async () => {},
    },
    isMultipleComponents: true,
  })
  return events
}

describe('Compose resolver-cache invalidation', () => {
  let events
  let invalidate

  beforeEach(() => {
    events = []
    invalidate = jest
      .spyOn(variables, 'invalidateProviderCaches')
      .mockImplementation(() => {
        events.push('invalidate')
      })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // `remove` walks the graph the other way round — dependents first — so the
  // expected wave order is per command.
  test.each([
    ['deploy', ['producer', 'consumer']],
    ['remove', ['consumer', 'producer']],
  ])(
    '%s invalidates the provider caches after each finished node, before the next wave resolves',
    async (command, [first, second]) => {
      expect(await runGraph([command], { events })).toEqual([
        `run:${first}`,
        'invalidate',
        `run:${second}`,
        'invalidate',
      ])
    },
  )

  test('a failed deploy invalidates too, because a rollback changes outputs', async () => {
    // The graph aborts after the failed wave, so `consumer` never runs — but
    // `producer`'s stack may have rolled back to different outputs.
    expect(await runGraph(['deploy'], { events, failOn: 'producer' })).toEqual([
      'run:producer',
      'invalidate',
    ])
  })

  test.each([['print'], ['info'], ['package']])(
    '%s changes no stack, so the caches are left alone',
    async (command) => {
      const log = await runGraph([command], { events })
      expect(log).toEqual(['run:producer', 'run:consumer'])
      expect(invalidate).not.toHaveBeenCalled()
    },
  )
})
