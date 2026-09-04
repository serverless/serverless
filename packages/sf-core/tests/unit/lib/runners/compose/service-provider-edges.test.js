// Importing router.js first resolves a pre-existing circular-import ordering
// issue (compose.js -> ./index.js -> router.js -> compose.js). Harmless side
// effect import; mirrors teaching-errors.test.js.
import '../../../../../src/lib/router.js'
import { parseComposeGraph } from '../../../../../src/lib/runners/compose/index.js'
import { serviceReferencesByAlias } from '../../../../../src/lib/runners/compose/service-params.js'
import { ResolverManager } from '../../../../../src/lib/resolvers/manager.js'
import { log } from '@serverless/util'

const logger = log.get('test:service-provider-edges')

const servicePath = '/tmp/service-provider-edges'

/**
 * Build a Compose graph the way production does: a compose-file resolver
 * manager runs its up-front pass over the configuration first (service
 * references stay deferred, everything else resolves), then the graph is parsed
 * with that manager, so service edges come from its placeholder graph.
 */
const build = async ({
  services,
  resolvers,
  stages,
  stage = 'dev',
  options = {},
}) => {
  const configuration = JSON.parse(
    JSON.stringify({
      ...(stages
        ? { stages }
        : resolvers
          ? { stages: { default: { resolvers } } }
          : {}),
      services,
    }),
  )
  const manager = new ResolverManager(
    logger,
    configuration,
    servicePath,
    { stage, ...options },
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
    servicePath,
    configuration,
    versions: {},
    resolverManager: manager,
    runStage: manager.stage,
    instanceStages: manager.getServiceTypedInstanceStages(),
  })
}

/**
 * Build a graph with no resolver manager: only the text scan runs. Pins the
 * rules that belong to the scan itself (the dot form, and that colon tokens are
 * never graph references for it).
 */
const buildTextScanOnly = ({ services, runStage = 'dev' }) =>
  parseComposeGraph({
    servicePath,
    configuration: { services: JSON.parse(JSON.stringify(services)) },
    versions: {},
    runStage,
    instanceStages: {},
  })

const withEnv = async (vars, fn) => {
  Object.assign(process.env, vars)
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(vars)) delete process.env[key]
  }
}

describe('setDependencies — text scan (dot form)', () => {
  // Rule 1: dot form is unchanged — edge always, existing typo validation.
  test('dot form ${worker.Key} always creates an edge', async () => {
    const compose = await buildTextScanOnly({
      runStage: 'alice',
      services: {
        worker: { path: 'worker' },
        api: { path: 'api', params: { q: '${worker.QueueUrl}' } },
      },
    })
    expect(compose.graph.successors('api')).toContain('worker')
  })

  test('dot form to an unknown service still throws (byte-identical typo validation)', async () => {
    await expect(
      buildTextScanOnly({
        services: { api: { path: 'api', params: { q: '${nope.Key}' } } },
      }),
    ).rejects.toThrow(/The service "nope" does not exist/)
  })

  test('colon tokens are not graph references for the text scan (no throw, no edge)', async () => {
    // Service edges come from the resolver manager's placeholder graph; with no
    // manager there are none, and no colon token is ever mistaken for an alias.
    const compose = await buildTextScanOnly({
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: {
            a: '${param:someParam}',
            b: '${env:SOME_VAR}',
            c: '${myaws:ssm:/x}',
            d: '${sls:stage}',
            e: '${service:orders-db.Host}',
          },
        },
      },
    })
    expect(compose.graph.hasNode('api')).toBe(true)
    expect(compose.graph.successors('api') || []).toHaveLength(0)
  })
})

describe('setDependencies — service-provider edge rules', () => {
  // Rule 2: built-in `${service:alias.Key}` — edge always (effective stage ==
  // run stage by definition, so the run stage value is irrelevant).
  test('${service:alias.Key} always creates an edge', async () => {
    const compose = await build({
      stage: 'alice',
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${service:orders-db.DbEndpoint}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('${service:...} token embedded in surrounding literal still creates the edge', async () => {
    const compose = await build({
      stage: 'alice',
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { url: 'https://${service:orders-db.Host}/path' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('two references in one value create both edges', async () => {
    const compose = await build({
      services: {
        'orders-db': { path: 'orders-db' },
        cache: { path: 'cache' },
        api: {
          path: 'api',
          params: { dsn: '${service:orders-db.Host}:${service:cache.Port}' },
        },
      },
    })
    expect([...compose.graph.successors('api')].sort()).toEqual([
      'cache',
      'orders-db',
    ])
  })

  // Rule 3: named service-typed instance — edge iff effectiveStage === runStage.
  test('${shared:alias.Key} creates an edge when the instance effective stage == run stage', async () => {
    const compose = await build({
      stage: 'prod',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${shared:orders-db.DbEndpoint}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('${shared:alias.Key} creates NO edge when the instance is pinned to a different stage (read-only ref)', async () => {
    const compose = await build({
      stage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${shared:orders-db.DbEndpoint}' },
        },
      },
    })
    expect(compose.graph.successors('api') || []).not.toContain('orders-db')
    // The referenced service is still a node in the graph — it is just not a
    // deploy-order dependency of the consumer.
    expect(compose.graph.hasNode('orders-db')).toBe(true)
  })

  test('a service-typed instance with no pinned stage falls back to the run stage (edge)', async () => {
    const compose = await build({
      stage: 'alice',
      resolvers: { shared: { type: 'service' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${shared:orders-db.DbEndpoint}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('a hyphenated service-typed instance name creates an edge when same-stage', async () => {
    const compose = await build({
      stage: 'prod',
      resolvers: { 'my-shared': { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${my-shared:orders-db.DbEndpoint}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('a hyphenated service-typed instance pinned to a different stage creates no edge', async () => {
    const compose = await build({
      stage: 'alice',
      resolvers: { 'my-shared': { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${my-shared:orders-db.DbEndpoint}' },
        },
      },
    })
    expect(compose.graph.successors('api') || []).not.toContain('orders-db')
    expect(compose.graph.hasNode('orders-db')).toBe(true)
  })

  // Rule 4: unknown alias inside a service-typed token → teaching error that
  // lists the valid aliases, at graph-build time — before any service runs.
  test('unknown alias in a ${service:...} token throws a teaching error listing valid aliases', async () => {
    await expect(
      build({
        services: {
          'orders-db': { path: 'orders-db' },
          api: { path: 'api', params: { x: '${service:nope.Out}' } },
        },
      }),
    ).rejects.toThrow(/"nope" does not exist[\s\S]*orders-db/)
  })

  test('unknown alias in a named service-typed token also throws listing valid aliases', async () => {
    await expect(
      build({
        stage: 'alice',
        resolvers: { shared: { type: 'service', stage: 'prod' } },
        services: {
          'orders-db': { path: 'orders-db' },
          api: { path: 'api', params: { x: '${shared:nope.Out}' } },
        },
      }),
    ).rejects.toThrow(/"nope" does not exist[\s\S]*orders-db/)
  })

  // Rule 5: other colon tokens resolve in the up-front pass and are gone before
  // the graph is built — no edge, no unknown-service throw.
  test('non-service colon tokens create no edge', async () => {
    const compose = await withEnv({ EDGE_SCAN_TEST_VAR: 'v' }, () =>
      build({
        options: { region: 'r' },
        services: {
          'orders-db': { path: 'orders-db' },
          api: {
            path: 'api',
            params: {
              a: '${env:EDGE_SCAN_TEST_VAR}',
              b: '${opt:region}',
              c: '${sls:stage}',
            },
          },
        },
      }),
    )
    expect(compose.graph.hasNode('api')).toBe(true)
    expect(compose.graph.successors('api') || []).toHaveLength(0)
  })

  // Rule 6: a reference is a graph reference wherever the variable grammar puts
  // it — the text scan could not see one that carries a fallback or sits in
  // fallback position, so a declared fallback used to silently drop the edge.
  test('a reference carrying a fallback still creates the edge', async () => {
    const compose = await build({
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: "${service:orders-db.Host, 'fallback'}" },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('a reference in fallback position creates the edge', async () => {
    const compose = await build({
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${opt:missing, service:orders-db.Host}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('an unknown alias with a fallback still fails at graph build, quoting the whole expression', async () => {
    await expect(
      build({
        services: {
          'orders-db': { path: 'orders-db' },
          api: {
            path: 'api',
            params: { x: "${service:nope.Out, 'fallback'}" },
          },
        },
      }),
    ).rejects.toThrow(
      `The service "nope" does not exist. It is referenced by "api" in expression "\${service:nope.Out, 'fallback'}". Available services: orders-db, api.`,
    )
  })

  test('a pinned cross-stage reference with a fallback stays read-only (no edge)', async () => {
    const compose = await build({
      stage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: "${shared:orders-db.Host, 'fallback'}" },
        },
      },
    })
    expect(compose.graph.successors('api') || []).not.toContain('orders-db')
  })

  // Rule 7: an alias produced by another variable. The up-front pass has
  // already substituted a non-deferred inner variable by graph-build time; a
  // deferred inner reference is itself the edge (the outer alias is unknowable).
  test('an alias from an inner variable that resolved up front creates the edge', async () => {
    const compose = await build({
      options: { db: 'orders-db' },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${service:${opt:db}.Host}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('a named instance with an alias from an inner variable creates the edge too', async () => {
    // The graph rewrites a resolved inner variable into the reference key for
    // named-instance nodes exactly as for the built-in name.
    const compose = await build({
      options: { db: 'orders-db' },
      resolvers: { shared: { type: 'service' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${shared:${opt:db}.Host}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('a reference outside params but inside the service block still creates the edge', async () => {
    // Parity with the text scan, which walked every field of the service. The
    // dispatch pass never resolves such a token (it is reported as unreachable);
    // ordering is still honored.
    const compose = await build({
      services: {
        'orders-db': { path: 'orders-db' },
        api: { path: 'api', custom: '${service:orders-db.Host}' },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('a service name that comes from another service reference is rejected at graph build', async () => {
    // The outer alias is unknowable when the deploy order is decided, so it
    // could never be ordered; rather than silently skipping the edge, the
    // shape is refused with the fix spelled out.
    await expect(
      build({
        services: {
          registry: { path: 'registry' },
          'orders-db': { path: 'orders-db' },
          api: {
            path: 'api',
            params: { dbHost: '${service:${service:registry.Alias}.Host}' },
          },
        },
      }),
    ).rejects.toThrow(
      /service name in '\$\{service:\$\{service:registry\.Alias\}\.Host\}'[\s\S]*could not be resolved before the services were ordered/,
    )
  })

  // --service subset interplay: the subset runner derives intra-set ordering
  // from graph edges, so a pinned cross-stage ref (no edge) must not order the
  // two named services, while a same-stage ref must.
  test('--service subset: a pinned cross-stage ref adds no intra-set deploy edge', async () => {
    const compose = await build({
      stage: 'alice',
      resolvers: { shared: { type: 'service', stage: 'prod' } },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${shared:orders-db.DbEndpoint}' },
        },
      },
    })
    const named = new Set(['api', 'orders-db'])
    const intraSetEdges = compose.graph
      .edges()
      .filter((edge) => named.has(edge.v) && named.has(edge.w))
    expect(intraSetEdges).toHaveLength(0)
  })

  test('--service subset: a same-stage ref keeps the intra-set deploy edge', async () => {
    const compose = await build({
      stage: 'alice',
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${service:orders-db.DbEndpoint}' },
        },
      },
    })
    const named = new Set(['api', 'orders-db'])
    const intraSetEdges = compose.graph
      .edges()
      .filter((edge) => named.has(edge.v) && named.has(edge.w))
    expect(intraSetEdges).toEqual([{ v: 'api', w: 'orders-db' }])
  })
})

describe('setDependencies — configuration errors caught at graph build', () => {
  test('a service alias with an underscore is accepted and ordered', async () => {
    const compose = await build({
      services: {
        orders_db: { path: 'orders_db' },
        api: { path: 'api', params: { h: '${service:orders_db.Host}' } },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders_db')
  })

  test('mixing the dot form and a service reference in one value fails before any service runs', async () => {
    // The dot form replaces the whole value; a service reference resolves in
    // place. Combined they would ship a half-resolved literal, so the mix is
    // rejected up front with the fix spelled out.
    await expect(
      build({
        services: {
          worker: { path: 'worker' },
          'orders-db': { path: 'orders-db' },
          api: {
            path: 'api',
            params: { url: 'https://${worker.Host}/${service:orders-db.Path}' },
          },
        },
      }),
    ).rejects.toThrow(
      /'url' of service "api" mixes the '\$\{worker\.Host\}' form with a service reference[\s\S]*\$\{service:worker\.Host\}/,
    )
  })

  test('a named instance whose stage is still a service reference at graph build fails with a teaching error', async () => {
    await expect(
      build({
        resolvers: {
          shared: { type: 'service', stage: '${service:cfg.Stage}' },
        },
        services: {
          cfg: { path: 'cfg' },
          'orders-db': { path: 'orders-db' },
          api: { path: 'api', params: { h: '${shared:orders-db.Host}' } },
        },
      }),
    ).rejects.toThrow(
      /'stage' of resolver 'shared'[\s\S]*could not be resolved before the services were ordered[\s\S]*not a service reference/,
    )
  })
})

describe('setDependencies — reference grammar at graph build', () => {
  test('a reference without an output key is rejected before any service runs', async () => {
    await expect(
      build({
        services: {
          'orders-db': { path: 'orders-db' },
          api: { path: 'api', params: { h: '${service:orders-db}' } },
        },
      }),
    ).rejects.toThrow(
      /'\$\{service:orders-db\}' in service "api" is not a service reference of the shape '<service>\.<Output>'/,
    )
  })

  test('a service name containing a colon cannot be referenced: refused with the reserved characters named', async () => {
    // The variable grammar splits on the first colon before any provider sees
    // the token, so `${service:orders:v2.Host}` arrives as resolver `orders`,
    // key `v2.Host`. A service reference has no resolver segment; refuse it
    // and say why, instead of reporting an unknown service `v2`.
    await expect(
      build({
        services: {
          'orders:v2': { path: 'orders-db' },
          api: { path: 'api', params: { h: '${service:orders:v2.Host}' } },
        },
      }),
    ).rejects.toThrow(
      /'\$\{service:orders:v2\.Host\}' in service "api" has a resolver segment 'orders'[\s\S]*cannot contain ':', ',', '}' or quotes/,
    )
  })

  test('a service alias containing a dot is referenced as written (the output key follows the last dot)', async () => {
    const compose = await build({
      services: {
        'orders.db': { path: 'orders-db' },
        api: { path: 'api', params: { h: '${service:orders.db.Host}' } },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders.db')
  })

  test('a named instance whose stage is a variable resolved up front is pinned by that value', async () => {
    // The documented example: `stage: ${param:dataStage}`. Same stage as the
    // run → edge; a different stage → read-only, no edge.
    const services = {
      'orders-db': { path: 'orders-db' },
      api: { path: 'api', params: { h: '${shared:orders-db.Host}' } },
    }
    const stages = {
      default: {
        params: { dataStage: 'prod' },
        resolvers: { shared: { type: 'service', stage: '${param:dataStage}' } },
      },
    }
    const pinnedElsewhere = await build({ stage: 'alice', stages, services })
    expect(pinnedElsewhere.graph.successors('api') || []).not.toContain(
      'orders-db',
    )
    const sameStage = await build({ stage: 'prod', stages, services })
    expect(sameStage.graph.successors('api')).toContain('orders-db')
  })
})

describe('serviceReferencesByAlias', () => {
  test('groups references by the consuming service, naming the referenced alias', async () => {
    const configuration = {
      stages: { default: { resolvers: { shared: { type: 'service' } } } },
      services: {
        registry: { path: 'registry' },
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: {
            a: "${service:orders-db.Host, 'fb'}",
            b: '${shared:registry.Url}',
            c: '${service:${service:registry.Alias}.Host}',
          },
        },
        worker: { path: 'worker', params: { d: '${service:orders-db.Queue}' } },
      },
    }
    const manager = new ResolverManager(
      logger,
      configuration,
      servicePath,
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

    const byAlias = serviceReferencesByAlias({ manager })

    expect([...byAlias.keys()].sort()).toEqual(['api', 'worker'])
    expect(byAlias.get('worker')).toEqual([
      {
        original: '${service:orders-db.Queue}',
        providerName: 'service',
        referencedAlias: 'orders-db',
        deferred: false,
        paramKey: 'd',
      },
    ])
    const api = byAlias.get('api')
    expect(api).toContainEqual({
      original: "${service:orders-db.Host, 'fb'}",
      providerName: 'service',
      referencedAlias: 'orders-db',
      deferred: false,
      paramKey: 'a',
    })
    expect(api).toContainEqual({
      original: '${shared:registry.Url}',
      providerName: 'shared',
      referencedAlias: 'registry',
      deferred: false,
      paramKey: 'b',
    })
    // The deferred inner reference is its own entry; the enclosing reference
    // cannot name its alias yet and is flagged as deferred.
    expect(api).toContainEqual(
      expect.objectContaining({
        referencedAlias: 'registry',
        providerName: 'service',
        deferred: false,
      }),
    )
    expect(api).toContainEqual(
      expect.objectContaining({ referencedAlias: null, deferred: true }),
    )
    expect(api).toHaveLength(4)
  })
})

describe('ResolverManager#getServiceTypedInstanceStages', () => {
  const buildManager = (configuration, stage) =>
    new ResolverManager(
      logger,
      configuration,
      '/tmp/service-provider-edges',
      { stage },
      null,
      null,
      null,
      false,
      '4.0.0',
      { isComposeConfigFile: true },
    )

  test('reads the pinned stage of a service-typed instance from the default block', () => {
    const manager = buildManager(
      {
        stages: {
          default: {
            resolvers: { shared: { type: 'service', stage: 'prod' } },
          },
        },
        services: { api: { path: 'api' } },
      },
      'alice',
    )
    expect(manager.getServiceTypedInstanceStages()).toEqual({ shared: 'prod' })
  })

  test('a stage-block resolver overrides the default block (stage-over-default precedence)', () => {
    const manager = buildManager(
      {
        stages: {
          default: {
            resolvers: { shared: { type: 'service', stage: 'prod' } },
          },
          alice: {
            resolvers: { shared: { type: 'service', stage: 'staging' } },
          },
        },
        services: { api: { path: 'api' } },
      },
      'alice',
    )
    expect(manager.getServiceTypedInstanceStages()).toEqual({
      shared: 'staging',
    })
  })

  test('a service-typed instance without a stage yields an undefined-valued key', () => {
    const manager = buildManager(
      {
        stages: { default: { resolvers: { shared: { type: 'service' } } } },
        services: { api: { path: 'api' } },
      },
      'alice',
    )
    const map = manager.getServiceTypedInstanceStages()
    expect(Object.keys(map)).toEqual(['shared'])
    expect(map.shared).toBeUndefined()
  })

  test('whole-block selection: a current-stage redeclaration without a stage does NOT inherit the default block pin', () => {
    // loadProvider selects the ENTIRE resolver block from the first stage in
    // [stage, 'default'] that declares the name — no per-field merge. Here the
    // current-stage block redeclares `shared` WITHOUT a stage, so the instance
    // is unpinned (same-stage), NOT `prod` from the default block. A per-field
    // fallback would wrongly return `prod` and drop the deploy edge.
    const manager = buildManager(
      {
        stages: {
          default: {
            resolvers: { shared: { type: 'service', stage: 'prod' } },
          },
          alice: {
            resolvers: { shared: { type: 'service' } },
          },
        },
        services: { api: { path: 'api' } },
      },
      'alice',
    )
    const map = manager.getServiceTypedInstanceStages()
    expect(Object.keys(map)).toEqual(['shared'])
    expect(map.shared).toBeUndefined()
  })

  test('whole-block selection: the resulting map yields a same-stage edge for the redeclared-unpinned instance', async () => {
    // End-to-end: the map from the config above must produce an edge at the run
    // stage (unpinned = same-stage), proving the fix reaches the graph.
    const compose = await build({
      stage: 'alice',
      stages: {
        default: {
          resolvers: { shared: { type: 'service', stage: 'prod' } },
        },
        alice: {
          resolvers: { shared: { type: 'service' } },
        },
      },
      services: {
        'orders-db': { path: 'orders-db' },
        api: {
          path: 'api',
          params: { dbHost: '${shared:orders-db.DbEndpoint}' },
        },
      },
    })
    expect(compose.graph.successors('api')).toContain('orders-db')
  })

  test('a config with no service-typed instances yields an empty map', () => {
    const manager = buildManager(
      { services: { api: { path: 'api' } } },
      'alice',
    )
    expect(manager.getServiceTypedInstanceStages()).toEqual({})
  })
})
