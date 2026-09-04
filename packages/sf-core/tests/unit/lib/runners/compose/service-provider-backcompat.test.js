import { jest } from '@jest/globals'

/**
 * Back-compat regression suite for the compose-only `service` resolver provider
 * rollout — the executable form of this feature's "no breaking
 * changes" guarantee.
 *
 * Every row here MUST pass unchanged against pre-feature behavior. A failure in
 * this file is a bug in the feature's production code, never a reason to loosen
 * the assertion. Each row of the spec's compatibility matrix is either pinned
 * by a dedicated test below or precisely cross-referenced to the
 * service-provider-gating.test.js / service-provider-deferral.test.js test
 * that already pins it (noted inline and in the report).
 *
 *   | # | Guarantee                                                          |
 *   |---|--------------------------------------------------------------------|
 *   | 1 | Dot form `${worker.QueueUrl}` resolves through the OLD compose loop |
 *   |   | to the same values (no service-provider fetch involved).           |
 *   | 2 | `${a.b.c}` (3-segment dot) stays a literal — inert, unclaimed.      |
 *   | 3 | `${service:x.Y}` in a CHILD service config (built from a compose    |
 *   |   | manager's inherited provider set) stays literal — children never   |
 *   |   | see the compose-only provider.                                     |
 *   | 4 | `${shared:...}` with NO declared instance stays literal in a        |
 *   |   | compose file — undeclared names pass through.                      |
 *   | 5 | `stages.default.resolvers.myaws {type: aws}` in a compose file      |
 *   |   | still validates, is not filtered, and is not deferred.             |
 *
 * Harness note: row 1 drives the real compose dispatch loop, which imports
 * compose/state.js; that module is mocked (unstable_mockModule) exactly as in
 * service-provider-resolution.test.js so the dot-form loop is exercised without
 * touching any real runner/AWS wiring. The mock is harmless to rows 2-5, which
 * only construct a real ResolverManager. Because of the mock, EVERY import that
 * could transitively pull in state.js is dynamic and comes AFTER the mock call.
 */
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
const { validateCustomResolverConfigs } =
  await import('../../../../../src/lib/resolvers/validation.js')
const { Service } =
  await import('../../../../../src/lib/resolvers/providers/service/service.js')
const { log } = await import('@serverless/util')
const graphlib = (await import('@dagrejs/graphlib')).default

const logger = log.get('test:service-provider-backcompat')

// -- Real ResolverManager helper (rows 2, 3, 4, 5) --------------------------
// Same construction the gating/deferral suites use, so behavior is verified
// against the real registry, manager, and validation (no manager mocking).
const buildManager = (
  serviceConfigFile,
  { isComposeConfigFile = false, composeResolverProviders = null } = {},
) =>
  new ResolverManager(
    logger,
    serviceConfigFile,
    '/path/to/config',
    { stage: 'dev' },
    composeResolverProviders,
    null,
    null,
    false,
    '4.0.0',
    { isComposeConfigFile },
  )

// -- Compose dispatch harness (row 1) ---------------------------------------
// Copied from service-provider-resolution.test.js so the dot-form loop runs
// exactly as production wires it: one shared config object, params injected
// post-parse, a real ResolverManager attached, the run graph narrowed to the
// consumer, and a stub runner capturing the params each service receives.
const composeParamRegex = /(?<=\$\{)[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+(?=\})/
const buildParsedParams = (params) => {
  const parsed = {}
  for (const [key, value] of Object.entries(params)) {
    const matches = value.match(composeParamRegex)
    parsed[key] = Array.isArray(matches) ? matches[0] : value
  }
  return parsed
}

const buildScenario = async ({ services, resolvers, runStage, keepNodes }) => {
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
    servicePath: '/tmp/service-provider-backcompat',
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
    '/tmp/service-provider-backcompat',
    { stage: runStage },
    null,
    null,
    null,
    false,
    '4.0.0',
    { isComposeConfigFile: true },
  )
  await manager.loadPlaceholders()
  await manager.resolveConfigFile({ printResolvedVariables: false })
  compose.resolverManager = manager

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

describe('service-provider back-compat guarantees', () => {
  beforeEach(() => resolveConfigAndGetState.mockReset())

  // -- Row 1 ----------------------------------------------------------------
  // A pure dot-form fixture resolves through the untouched compose loop to the
  // deployed output value, with the new service-provider fetch path never
  // reached — proving the legacy path is independent and unchanged.
  //
  // Additional coverage: service-provider-resolution.test.js →
  //   "dot-form and service params coexist: each resolves via its own path"
  // pins the same dot-form value alongside a service token and a literal.
  describe('row 1: dot form resolves identically through the old loop', () => {
    test('${worker.QueueUrl} resolves from localState with no service fetch', async () => {
      const compose = await buildScenario({
        runStage: 'alice',
        services: {
          worker: {},
          api: {
            dependsOn: ['worker'],
            params: { q: '${worker.QueueUrl}' },
          },
        },
        keepNodes: ['api'],
      })

      const seen = await run(compose, {
        command: ['deploy'],
        runStage: 'alice',
        state: freshState({
          worker: { outputs: { QueueUrl: 'https://sqs/alice/q' } },
        }),
      })

      // Byte-identical dot-form loop produced the deployed value...
      expect(seen.api.q).toBe('https://sqs/alice/q')
      // ...and the service-provider dispatch path was never involved.
      expect(resolveConfigAndGetState).not.toHaveBeenCalled()
    })
  })

  // -- Row 2 ----------------------------------------------------------------
  // The 3-segment dot shape is exactly what a hypothetical stage-qualified
  // dot grammar would have claimed. This feature must NOT introduce that grammar:
  // the resolver leaves `${a.b.c}` untouched (no provider owns a colon-less
  // token). Pinned at the resolver level — the layer where such a grammar would
  // have lived — mirroring the gating/deferral suites.
  describe('row 2: ${a.b.c} (3-segment dot) stays a literal', () => {
    it('passes through unresolved in a compose-file manager', async () => {
      const config = {
        service: 'svc',
        provider: { name: 'aws' },
        custom: { ref: '${a.b.c}' },
      }
      const manager = buildManager(config, { isComposeConfigFile: true })

      await manager.loadPlaceholders()
      await manager.resolveConfigFile({ printResolvedVariables: false })

      expect(config.custom.ref).toBe('${a.b.c}')
    })
  })

  // -- Row 3 ----------------------------------------------------------------
  // A child service manager built from a compose manager's INHERITED provider
  // set (getResolverProviders()) must never see the compose-only provider:
  // both the built-in `${service:...}` token and an inherited-name
  // `${shared:...}` token survive as literals in the child config.
  //
  // Extends the gating filter test ("excludes compose-only providers
  // from the inherited set", service-provider-gating.test.js) end to end: that
  // test asserts the FILTER output shape; this one drives the filtered set
  // through a real child manager and asserts literal SURVIVAL of the tokens.
  describe('row 3: ${service:x.Y} in a child config (inherited set) stays literal', () => {
    it('leaves service-provider tokens literal in a child built from the inherited set', async () => {
      // A realistic compose (parent) manager that has both a compose-only
      // `service`-typed instance and an ordinary provider loaded.
      const parent = buildManager(
        { service: 'svc' },
        { isComposeConfigFile: true },
      )
      parent.addResolverProvider('shared', {
        instance: { constructor: Service },
        resolvers: {},
      })
      parent.addResolverProvider('myaws', {
        instance: { constructor: { composeOnly: false, type: 'aws' } },
        resolvers: {},
      })

      const inherited = parent.getResolverProviders()
      // Precondition: the compose-only provider is stripped from what a child
      // would inherit; the ordinary one is retained.
      expect(inherited).toHaveProperty('myaws')
      expect(inherited).not.toHaveProperty('shared')

      // A child SERVICE manager (not a compose file) built from that inherited
      // set — exactly how compose dispatches a child.
      const childConfig = {
        service: 'child',
        provider: { name: 'aws' },
        custom: {
          builtin: '${service:orders-db.QueueUrl}',
          named: '${shared:orders-db.QueueUrl}',
        },
      }
      const child = buildManager(childConfig, {
        isComposeConfigFile: false,
        composeResolverProviders: inherited,
      })

      await child.loadPlaceholders()
      await child.resolveConfigFile({ printResolvedVariables: false })

      // Neither the built-in compose-only type nor the (filtered-out) inherited
      // name is available to the child, so both tokens stay literal.
      expect(childConfig.custom.builtin).toBe('${service:orders-db.QueueUrl}')
      expect(childConfig.custom.named).toBe('${shared:orders-db.QueueUrl}')
    })
  })

  // -- Row 6 ----------------------------------------------------------------
  // A compose file may declare a resolver instance literally named `service`
  // of some other type. Children inherit that instance and resolve
  // `${service:...}` through it — exactly as before the compose-only built-in
  // of the same name existed. The built-in must never displace an inherited
  // instance in a child manager, where it is not available at all.
  describe('row 6: an inherited resolver instance named `service` keeps working in a child', () => {
    it('resolves ${service:KEY} in the child through the inherited env instance', async () => {
      process.env.COMPAT_ROW6_X = 'from-env'
      try {
        const parent = buildManager(
          {
            stages: { default: { resolvers: { service: { type: 'env' } } } },
            services: { child: { path: 'child' } },
          },
          { isComposeConfigFile: true },
        )
        await parent.loadPlaceholders()
        await parent.loadAllResolvers()
        await parent.resolveConfigFile({ printResolvedVariables: false })
        const inherited = parent.getResolverProviders()
        expect(inherited.service?.instance?.constructor?.type).toBe('env')

        const childConfig = {
          service: 'child',
          provider: { name: 'aws' },
          custom: { x: '${service:COMPAT_ROW6_X}' },
        }
        const child = buildManager(childConfig, {
          isComposeConfigFile: false,
          composeResolverProviders: inherited,
        })
        await child.loadPlaceholders()
        await child.resolveConfigFile({ printResolvedVariables: false })

        expect(childConfig.custom.x).toBe('from-env')
      } finally {
        delete process.env.COMPAT_ROW6_X
      }
    })
  })

  // -- Row 4 ----------------------------------------------------------------
  // An undeclared instance name is unknown to the resolver system, so its
  // colon token passes through untouched — even inside a compose file, where
  // declared service-typed instances WOULD be deferred. Consistency with the
  // system's general unknown-name behavior.
  describe('row 4: ${shared:...} with no declared instance stays literal in a compose file', () => {
    it('passes an undeclared-name token through as a literal', async () => {
      const config = {
        // No stages.*.resolvers.shared anywhere — `shared` is undeclared.
        params: { default: { ref: '${shared:orders-db.QueueUrl}' } },
        services: { api: { path: 'api' } },
      }
      const manager = buildManager(config, { isComposeConfigFile: true })

      await manager.loadPlaceholders()
      await manager.resolveConfigFile({ printResolvedVariables: false })

      expect(config.params.default.ref).toBe('${shared:orders-db.QueueUrl}')
    })
  })

  // -- Row 5 ----------------------------------------------------------------
  // A non-service resolver instance declared in a compose file behaves exactly
  // as pre-feature: the permissive resolvers block still accepts it, it is not
  // swept into the new service-provider deferral, it is not filtered from
  // inheritance, and the up-front pass still resolves ordinary tokens normally.
  describe('row 5: stages.default.resolvers.myaws {type: aws} still works as before', () => {
    it('validates in a compose file (permissive block unchanged)', () => {
      const config = {
        stages: { default: { resolvers: { myaws: { type: 'aws' } } } },
      }
      expect(() =>
        validateCustomResolverConfigs(config, { isComposeConfigFile: true }),
      ).not.toThrow()
    })

    it('is not deferred, not filtered, and the up-front pass still resolves', async () => {
      process.env.BC_ROW5_VAR = 'from-env'
      const config = {
        stages: {
          default: {
            resolvers: {
              // A compose-only sibling is collected for deferral...
              shared: { type: 'service' },
              // ...but the ordinary aws instance is NOT.
              myaws: { type: 'aws' },
            },
          },
        },
        params: { default: { ref: '${env:BC_ROW5_VAR}' } },
        services: { api: { path: 'api' } },
      }
      const manager = buildManager(config, { isComposeConfigFile: true })

      try {
        // Not deferred: the aws instance is absent from the service-typed
        // (deferred) set, while the compose-only sibling is present.
        const deferred = manager.getServiceTypedInstanceNames()
        expect(deferred).toContain('shared')
        expect(deferred).not.toContain('myaws')

        // Not filtered: an ordinary (non-compose-only) aws instance stays in
        // the set a child would inherit. (The general filter is pinned by the
        // gating suite's "excludes compose-only providers from the inherited
        // set"; this asserts the aws instance specifically is retained.)
        manager.addResolverProvider('myaws', {
          instance: { constructor: { composeOnly: false, type: 'aws' } },
          resolvers: {},
        })
        expect(manager.getResolverProviders()).toHaveProperty('myaws')

        // The up-front pass still runs and resolves ordinary tokens with the
        // aws instance declared alongside — no throw, no deferral of `${env}`.
        await manager.loadPlaceholders()
        await manager.resolveConfigFile({ printResolvedVariables: false })
        expect(config.params.default.ref).toBe('from-env')
      } finally {
        delete process.env.BC_ROW5_VAR
      }
    })
  })
})
