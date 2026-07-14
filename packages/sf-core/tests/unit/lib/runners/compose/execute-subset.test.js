import { jest } from '@jest/globals'
import { parseComposeGraph } from '../../../../../src/lib/runners/compose/index.js'

// Chain: api -> worker -> db (via compose graph params); "standalone" has no edges
// (stands in for an always-on service reached via hoisted aws:cf — no graph dep).
const CONFIG = {
  services: {
    db: { path: 'db' },
    worker: { path: 'worker', params: { dbRef: '${db.DbOut}' } },
    api: { path: 'api', params: { queueUrl: '${worker.QueueOut}' } },
    standalone: { path: 'standalone' },
  },
}

const buildCompose = async () =>
  await parseComposeGraph({
    servicePath: '/tmp/compose-subset-test',
    configuration: JSON.parse(JSON.stringify(CONFIG)),
    versions: {},
  })

const baseArgs = (overrides = {}) => ({
  serviceNames: ['api', 'worker'],
  command: ['deploy'],
  reverse: false,
  composeOrgName: 'test-org',
  options: { service: 'api,worker' },
  resolverProviders: {},
  params: {},
  state: { localState: {} },
  ...overrides,
})

describe('Compose#executeSubsetComponents', () => {
  test('throws on unknown service, listing available services', async () => {
    const compose = await buildCompose()
    compose.executeComponentsGraph = jest.fn()
    // Available-services list follows graph insertion order (config key order)
    await expect(
      compose.executeSubsetComponents(
        baseArgs({ serviceNames: ['api', 'nope'] }),
      ),
    ).rejects.toThrow(/nope.*does not exist.*db.*worker.*api.*standalone/s)
    expect(compose.executeComponentsGraph).not.toHaveBeenCalled()
  })

  test('deploy: get-state over the FULL dependency closure, then runs exactly the named set with intra-set edges', async () => {
    const compose = await buildCompose()
    const calls = []
    compose.executeComponentsGraph = jest.fn(async (args) => {
      calls.push({ command: args.command, nodes: [...compose.graph.nodes()] })
    })

    await compose.executeSubsetComponents(baseArgs())

    // Call 1: get-state over the full closure of the named set (api deps: worker,
    // db; worker deps: db). Named services stay IN the read pass so an unnamed dep
    // referencing a named service can still resolve (C1). Reading a named service's
    // state is harmless — it is redeployed fresh in the real run.
    expect(calls[0].command).toEqual(['get-state'])
    expect(calls[0].nodes.sort()).toEqual(['db', 'worker'])
    // Call 2: the real command over exactly the named set
    expect(calls[1].command).toEqual(['deploy'])
    expect(calls[1].nodes.sort()).toEqual(['api', 'worker'])
    // Intra-set edge preserved (api -> worker) so ordering holds
    expect(compose.graph.edges()).toEqual([{ v: 'api', w: 'worker' }])
    // isMultipleComponents on the real run
    expect(
      compose.executeComponentsGraph.mock.calls[1][0].isMultipleComponents,
    ).toBe(true)
  })

  test('C1: get-state closure includes a NAMED service that an unnamed dep references', async () => {
    // Chain api -> middle -> worker; middle (unnamed) references worker (named).
    // The get-state pass must include worker so middle's `${worker.Out}` resolves;
    // excluding named services (the C1 bug) leaves worker out and the read fails.
    const c1Config = {
      services: {
        worker: { path: 'worker' },
        middle: { path: 'middle', params: { w: '${worker.Out}' } },
        api: { path: 'api', params: { m: '${middle.Out}' } },
      },
    }
    const compose = await parseComposeGraph({
      servicePath: '/tmp/compose-subset-test',
      configuration: JSON.parse(JSON.stringify(c1Config)),
      versions: {},
    })
    const calls = []
    compose.executeComponentsGraph = jest.fn(async (args) => {
      calls.push({ command: args.command, nodes: [...compose.graph.nodes()] })
    })

    await compose.executeSubsetComponents(
      baseArgs({
        serviceNames: ['api', 'worker'],
        options: { service: 'api,worker' },
      }),
    )

    // get-state pass runs over the full closure: the unnamed intermediate `middle`
    // AND the named `worker` it references (not just `middle`).
    expect(calls[0].command).toEqual(['get-state'])
    expect(calls[0].nodes.sort()).toEqual(['middle', 'worker'])
    // Real run is still exactly the named set.
    expect(calls[1].command).toEqual(['deploy'])
    expect(calls[1].nodes.sort()).toEqual(['api', 'worker'])
  })

  test('remove: no get-state pass, runs exactly the named set', async () => {
    const compose = await buildCompose()
    compose.executeComponentsGraph = jest.fn()
    await compose.executeSubsetComponents(
      baseArgs({ command: ['remove'], serviceNames: ['api', 'worker'] }),
    )
    expect(compose.executeComponentsGraph).toHaveBeenCalledTimes(1)
    expect(compose.executeComponentsGraph.mock.calls[0][0].command).toEqual([
      'remove',
    ])
    expect(compose.graph.nodes().sort()).toEqual(['api', 'worker'])
  })

  test('deletes options.service so framework schema validation passes downstream', async () => {
    const compose = await buildCompose()
    compose.executeComponentsGraph = jest.fn()
    const options = { service: 'api,worker', stage: 'alice' }
    await compose.executeSubsetComponents(baseArgs({ options }))
    expect(options.service).toBeUndefined()
  })

  test('named set that is its own closure: get-state pass reads the named deps, then runs them', async () => {
    const compose = await buildCompose()
    const calls = []
    compose.executeComponentsGraph = jest.fn(async (args) => {
      calls.push({ command: args.command, nodes: [...compose.graph.nodes()] })
    })
    await compose.executeSubsetComponents(
      baseArgs({
        serviceNames: ['worker', 'db'],
        options: { service: 'worker,db' },
      }),
    )
    // worker depends on db; both are named, so the closure is {db}. The read pass
    // no longer excludes named services (C1), so db is get-state'd harmlessly.
    expect(calls[0].command).toEqual(['get-state'])
    expect(calls[0].nodes.sort()).toEqual(['db'])
    expect(calls[1].nodes.sort()).toEqual(['db', 'worker'])
    expect(compose.graph.edges()).toEqual([{ v: 'worker', w: 'db' }])
  })
})
