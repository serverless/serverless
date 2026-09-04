// Importing router.js first resolves a pre-existing circular-import ordering
// issue (compose.js -> ./index.js -> router.js -> compose.js).
import '../../../../../src/lib/router.js'
import { parseComposeGraph } from '../../../../../src/lib/runners/compose/index.js'
import { ResolverManager } from '../../../../../src/lib/resolvers/manager.js'
import { log } from '@serverless/util'
import graphlib from '@dagrejs/graphlib'

/**
 * Every documented shape of a service reference × every command × state
 * present / absent, driven in PRODUCTION ORDER: the compose-file manager's
 * up-front pass, then the graph build (edges from the placeholder graph), then
 * dispatch with a stub runner. One table so a change to any layer — grammar,
 * deferral, edge scan, dispatch pass, fallback loop, short-circuits — shows up
 * as a cell, not as a scenario nobody thought to write.
 *
 * A quoted literal containing a comma (`'a, b'`) is not in the table: the
 * variables engine splits fallbacks on `,` before parsing the literal and
 * fails, for every provider — a pre-existing grammar limit, not a compose one.
 *
 * Expectations are the observed behavior on the reviewed head, each explained
 * where it is not obvious. `ERR_STATE` / `ERR_OUTPUT` are the two not-found
 * teaching errors; `SENT` is the print placeholder.
 */

const logger = log.get('test:service-reference-matrix')
const SENT = 'NOT_AVAILABLE_IN_PRINT_COMMAND'
const OUTPUTS = { Host: 'h', Port: 'p', Name: 'region' }
const OPTIONS = { stage: 'dev', region: 'r', db: 'orders-db' }
const ERR_STATE = /no deployed state found for service 'orders-db'/
const ERR_OUTPUT = /service 'orders-db' has no output/
// `print` with a reference nested INSIDE another variable and no state: the
// inner renders the placeholder and the enclosing `${opt:...}` then has no
// value (documented; the docs recommend a fallback on the enclosing variable).
const ERR_PRINT_NESTED =
  /Cannot resolve '\$\{opt:NOT_AVAILABLE_IN_PRINT_COMMAND\}'/

// [name, value, deploy·present, deploy·absent, print·absent, print·present]
// print·present defaults to deploy·present, except where an output is missing:
// the provider renders the placeholder for print before the fallback loop runs.
const shapes = [
  ['plain', '${service:orders-db.Host}', 'h', ERR_STATE, SENT],
  ['literal fallback', "${service:orders-db.Host, 'fb'}", 'h', 'fb', SENT],
  [
    'in fallback position, first missing',
    '${opt:missing, service:orders-db.Host}',
    'h',
    ERR_STATE,
    SENT,
  ],
  // The first fallback resolves; the reference is never consulted — but the
  // key is still deferred to dispatch and still orders the deploy.
  [
    'in fallback position, first present',
    '${opt:region, service:orders-db.Host}',
    'r',
    'r',
    'r',
  ],
  [
    'resolver fallback',
    '${service:orders-db.Host, opt:region}',
    'h',
    'r',
    SENT,
  ],
  ['nested inner', '${service:${opt:db}.Host}', 'h', ERR_STATE, SENT],
  [
    'nested outer',
    '${opt:${service:orders-db.Name}}',
    'r',
    ERR_STATE,
    ERR_PRINT_NESTED,
  ],
  [
    'interpolated',
    'pre-${service:orders-db.Host}-post',
    'pre-h-post',
    ERR_STATE,
    `pre-${SENT}-post`,
  ],
  [
    'two references',
    '${service:orders-db.Host}:${service:orders-db.Port}',
    'h:p',
    ERR_STATE,
    `${SENT}:${SENT}`,
  ],
  [
    'missing output, fallback',
    "${service:orders-db.Missing, 'fb'}",
    'fb',
    'fb',
    SENT,
    SENT,
  ],
  [
    'missing output, no fallback',
    '${service:orders-db.Missing}',
    ERR_OUTPUT,
    ERR_STATE,
    SENT,
    SENT,
  ],
  [
    'named same-stage instance',
    '${shared:orders-db.Host}',
    'h',
    ERR_STATE,
    SENT,
  ],
  [
    'chain resolver, resolver, literal',
    "${service:orders-db.Missing, opt:missing, 'last'}",
    'last',
    'last',
    SENT,
    SENT,
  ],
  [
    'nested inner, fallback',
    "${service:${opt:db}.Host, 'fb'}",
    'h',
    'fb',
    SENT,
  ],
  [
    'two references, second with fallback',
    "${service:orders-db.Host}:${service:orders-db.Missing, 'p2'}",
    'h:p2',
    ERR_STATE,
    `${SENT}:${SENT}`,
    `h:${SENT}`,
  ],
  // Unquoted literals parse to JS values; the dot-form loop must not choke on a
  // param our pass has already turned into a number or boolean.
  [
    'numeric fallback',
    '${service:orders-db.Missing, 5432}',
    5432,
    5432,
    SENT,
    SENT,
  ],
  [
    'boolean fallback',
    '${service:orders-db.Missing, false}',
    false,
    false,
    SENT,
    SENT,
  ],
  [
    'literal before the reference',
    "${opt:missing, 'lit', service:orders-db.Host}",
    'lit',
    'lit',
    'lit',
  ],
]

const build = async (value) => {
  const configuration = {
    stages: { default: { resolvers: { shared: { type: 'service' } } } },
    services: {
      'orders-db': { path: 'orders-db' },
      api: { path: 'api', params: { p: value } },
    },
  }
  const manager = new ResolverManager(
    logger,
    configuration,
    '/tmp/service-reference-matrix',
    { ...OPTIONS },
    null,
    null,
    null,
    false,
    '4.0.0',
    { isComposeConfigFile: true },
  )
  await manager.loadPlaceholders()
  await manager.resolveConfigFile({ printResolvedVariables: false })
  return parseComposeGraph({
    servicePath: '/tmp/service-reference-matrix',
    configuration,
    versions: {},
    resolverManager: manager,
    runStage: manager.stage,
    instanceStages: manager.getServiceTypedInstanceStages(),
  })
}

// Runs the graph with a stub runner. `full: false` keeps only the consumer so
// the state is exactly what the test says; `full: true` runs the producer too
// (its stub returns the outputs on deploy, which is what feeds localState).
const run = async (compose, { command, localState = {}, full = false }) => {
  if (!full) {
    const data = compose.graph.node('api')
    compose.graph = new graphlib.Graph()
    compose.graph.setNode('api', data)
  }
  const seen = {}
  const order = []
  const state = {
    localState: { ...localState },
    getServiceState: async () => null,
    putServiceState: async () => {},
  }
  const runnerFunction = async (args) => {
    const alias = args.compose.serviceName
    order.push(alias)
    seen[alias] = args.compose.params
    if (alias === 'orders-db' && command[0] === 'deploy') {
      return { state: { outputs: OUTPUTS } }
    }
    return {}
  }
  const error = await compose
    .executeComponentsGraph({
      command,
      reverse: false,
      composeOrgName: 'org',
      options: { stage: 'dev' },
      resolverProviders: {},
      params: {},
      runnerFunction,
      state,
      isMultipleComponents: false,
    })
    .then(
      () => null,
      (e) => e,
    )
  return { value: seen.api?.p, order, error }
}

const expectCell = (expected, { value, error }) => {
  if (expected instanceof RegExp) {
    expect(error?.message).toMatch(expected)
  } else {
    expect(error).toBeNull()
    expect(value).toBe(expected)
  }
}

describe.each(shapes)(
  '%s — %s',
  (name, value, present, absent, printAbsent, printPresent = present) => {
    test('the reference orders the deploy (edge api → orders-db)', async () => {
      const compose = await build(value)
      expect(compose.graph.successors('api')).toContain('orders-db')
    })

    test('deploy, state present', async () => {
      expectCell(
        present,
        await run(await build(value), {
          command: ['deploy'],
          localState: { 'orders-db': { outputs: OUTPUTS } },
        }),
      )
    })

    test('deploy, state absent', async () => {
      expectCell(absent, await run(await build(value), { command: ['deploy'] }))
    })

    test('deploy, full graph: the producer runs first and its outputs are used', async () => {
      const result = await run(await build(value), {
        command: ['deploy'],
        full: true,
      })
      expect(result.order[0]).toBe('orders-db')
      expectCell(present, result)
      if (!(present instanceof RegExp))
        expect(result.order).toEqual(['orders-db', 'api'])
    })

    test('print, state absent', async () => {
      expectCell(
        printAbsent,
        await run(await build(value), { command: ['print'] }),
      )
    })

    test('print, state present', async () => {
      expectCell(
        printPresent instanceof RegExp ? SENT : printPresent,
        await run(await build(value), {
          command: ['print'],
          localState: { 'orders-db': { outputs: OUTPUTS } },
        }),
      )
    })

    test.each(['remove', 'get-state'])(
      '%s short-circuits the whole value',
      async (command) => {
        expectCell('', await run(await build(value), { command: [command] }))
      },
    )
  },
)
