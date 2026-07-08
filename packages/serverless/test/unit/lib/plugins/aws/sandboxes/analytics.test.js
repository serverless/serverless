import { buildSandboxesAnalytics } from '../../../../../../lib/plugins/aws/sandboxes/analytics.js'
import { resolveObservability } from '../../../../../../lib/plugins/aws/sandboxes/compilers/observability.js'

describe('buildSandboxesAnalytics — envelope', () => {
  test('returns undefined for absent/empty/malformed top-level config', () => {
    expect(buildSandboxesAnalytics(undefined)).toBeUndefined()
    expect(buildSandboxesAnalytics(null)).toBeUndefined()
    expect(buildSandboxesAnalytics({})).toBeUndefined()
    expect(buildSandboxesAnalytics('nope')).toBeUndefined()
    expect(buildSandboxesAnalytics(42)).toBeUndefined()
    expect(buildSandboxesAnalytics([{ artifact: './x' }])).toBeUndefined()
  })

  test('count reflects the number of defined sandboxes', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './app' },
      b: { artifact: 's3://bucket/key.zip' },
    })
    expect(out.count).toBe(2)
  })
})

describe('buildSandboxesAnalytics — artifactTypes', () => {
  test('classifies s3:// as s3 and everything else as source, sorted unique', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './app' },
      b: { artifact: 's3://bucket/key.zip' },
      c: { artifact: '/abs/dir' },
    })
    expect(out.artifactTypes).toEqual(['s3', 'source'])
  })

  test('omits artifactTypes when no sandbox has a string artifact (malformed)', () => {
    const out = buildSandboxesAnalytics({ a: { artifact: 42 } })
    expect(out.count).toBe(1)
    expect(out.artifactTypes).toBeUndefined()
  })
})

describe('buildSandboxesAnalytics — minimumMemory (explicit-only)', () => {
  test('reports only explicitly set values, sorted unique', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', minimumMemory: 8192 },
      b: { artifact: './b', minimumMemory: 2048 },
      c: { artifact: './c' }, // default by omission — contributes nothing
      d: { artifact: './d', minimumMemory: 2048 },
    })
    expect(out.minimumMemory).toEqual([2048, 8192])
  })

  test('explicitly setting the default value (2048) IS reported', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', minimumMemory: 2048 },
    })
    expect(out.minimumMemory).toEqual([2048])
  })

  test('omits minimumMemory entirely when nobody sets it (omit-empty)', () => {
    const out = buildSandboxesAnalytics({ a: { artifact: './a' } })
    expect(out.minimumMemory).toBeUndefined()
    expect('minimumMemory' in out).toBe(false)
  })
})

describe('buildSandboxesAnalytics — never throws', () => {
  test('null sandbox entries and wrong-typed knobs degrade, never throw', () => {
    const out = buildSandboxesAnalytics({
      a: null,
      b: 'string-sandbox',
      c: { artifact: './ok', minimumMemory: 'lots' },
    })
    expect(out.count).toBe(3) // keys counted even when entries are malformed
    expect(out.artifactTypes).toEqual(['source'])
    expect(out.minimumMemory).toBeUndefined()
  })
})

describe('buildSandboxesAnalytics — hooks', () => {
  test('reports adoption count, configured union, per-hook explicit timeouts', () => {
    const out = buildSandboxesAnalytics({
      a: {
        artifact: './a',
        hooks: { ready: { timeout: 120 }, run: true, port: 9100 },
      },
      b: { artifact: './b', hooks: { run: { timeout: 60 }, terminate: true } },
      c: { artifact: './c' }, // no hooks block
    })
    expect(out.hooks).toEqual({
      sandboxes: 2,
      configured: ['ready', 'run', 'terminate'],
      timeouts: { ready: [120], run: [60] },
      customPort: 1,
    })
  })

  test('true-form hooks appear in configured but never in timeouts', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', hooks: { ready: true } },
    })
    expect(out.hooks.configured).toEqual(['ready'])
    expect(out.hooks.timeouts).toBeUndefined()
  })

  test('clamps timeout values above 3600', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', hooks: { ready: { timeout: 99999 } } },
    })
    expect(out.hooks.timeouts).toEqual({ ready: [3600] })
  })

  test('hooks block omitted entirely when no sandbox declares hooks', () => {
    const out = buildSandboxesAnalytics({ a: { artifact: './a' } })
    expect(out.hooks).toBeUndefined()
  })

  test('unknown hook names and malformed hook values are ignored', () => {
    const out = buildSandboxesAnalytics({
      a: {
        artifact: './a',
        hooks: { evil: { timeout: 5 }, ready: 'yes', run: { timeout: 'soon' } },
      },
    })
    // hooks block exists (a declared a hooks object) but nothing valid inside
    expect(out.hooks).toEqual({ sandboxes: 1 })
  })

  test('empty-object hook form is configured but contributes no timeout', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', hooks: { ready: {} } },
    })
    expect(out.hooks.configured).toEqual(['ready'])
    expect(out.hooks.timeouts).toBeUndefined()
  })

  test('present-but-invalid timeouts are still rejected from configured', () => {
    const out = buildSandboxesAnalytics({
      a: {
        artifact: './a',
        hooks: {
          run: { timeout: 'soon' },
          suspend: { timeout: 0 },
          resume: 'yes',
        },
      },
    })
    expect(out.hooks).toEqual({ sandboxes: 1 })
  })
})

describe('buildSandboxesAnalytics — iam', () => {
  test('classifies ARN string and CFN intrinsic as existing, extension object as extended', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', iam: { executionRole: 'arn:aws:iam::123:role/x' } },
      b: {
        artifact: './b',
        iam: { executionRole: { 'Fn::GetAtt': ['Role', 'Arn'] } },
      },
      c: {
        artifact: './c',
        iam: { executionRole: { statements: [{ Effect: 'Allow' }] } },
      },
    })
    expect(out.iam).toEqual({ executionRole: ['existing', 'extended'] })
  })

  test('buildRole and executionRole are independent; defaults omit the key', () => {
    const out = buildSandboxesAnalytics({
      a: {
        artifact: './a',
        iam: { buildRole: { managedPolicies: ['arn:x'] } },
      },
      b: { artifact: './b' }, // generated roles everywhere
    })
    expect(out.iam).toEqual({ buildRole: ['extended'] })
  })

  test('iam omitted entirely when every sandbox uses generated roles', () => {
    expect(
      buildSandboxesAnalytics({ a: { artifact: './a' } }).iam,
    ).toBeUndefined()
  })
})

describe('buildSandboxesAnalytics — vpc / envVarCounts / osCapabilities / tags', () => {
  test('vpc counts sandboxes with a vpc object', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', vpc: { subnetIds: ['s-1'] } },
      b: { artifact: './b' },
    })
    expect(out.vpc).toBe(1)
  })

  test('envVarCounts: one ascending entry per sandbox that declares vars — never names', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', environment: { X: '1', Y: '2', Z: '3' } },
      b: { artifact: './b', environment: { ONLY: 'v' } },
      c: { artifact: './c' },
      d: { artifact: './d', environment: {} }, // empty map = declares nothing
    })
    expect(out.envVarCounts).toEqual([1, 3])
  })

  test('osCapabilities normalized to lowercase, sorted unique; tags counted', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', osCapabilities: ['ALL'], tags: { team: 'x' } },
      b: { artifact: './b', osCapabilities: ['all'] },
    })
    expect(out.osCapabilities).toEqual(['all'])
    expect(out.tags).toBe(1)
  })

  test('osCapabilities: out-of-enum values are dropped, not passed through', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', osCapabilities: ['all', 'ACME_INTERNAL_CAP'] },
    })
    expect(out.osCapabilities).toEqual(['all'])
  })

  test('osCapabilities: key omitted when only unknown values are present', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', osCapabilities: ['ACME_INTERNAL_CAP'] },
    })
    expect('osCapabilities' in out).toBe(false)
  })

  test('all five omitted on a bare sandbox (omit-empty)', () => {
    const out = buildSandboxesAnalytics({ a: { artifact: './a' } })
    for (const k of ['iam', 'vpc', 'envVarCounts', 'osCapabilities', 'tags']) {
      expect(k in out).toBe(false)
    }
  })
})

describe('buildSandboxesAnalytics — observability', () => {
  test('absent and `true` count as defaults; false counts as disabled', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a' },
      b: { artifact: './b', observability: true },
      c: { artifact: './c', observability: false },
    })
    expect(out.observability).toEqual({ defaults: 2, disabled: 1 })
  })

  test('component opt-outs and alarms adoption are counted per sandbox', () => {
    const out = buildSandboxesAnalytics({
      a: {
        artifact: './a',
        observability: {
          logs: { enabled: false },
          metrics: { enabled: false },
          dashboard: { enabled: false },
        },
      },
      b: {
        artifact: './b',
        observability: { alarms: { notify: 'arn:aws:sns:us-east-1:1:t' } },
      },
    })
    expect(out.observability).toEqual({
      logsDisabled: 1,
      metricsDisabled: 1,
      dashboardDisabled: 1,
      alarms: 1,
    })
  })

  test('alarms without notify is NOT counted (mirrors the compiler)', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', observability: { alarms: { thresholds: {} } } },
    })
    // Nothing else in this raw config is reportable (thresholds is empty),
    // so per the omit-empty invariant `out.observability` itself is omitted —
    // hence the optional chaining (the brief's literal `.observability.alarms`
    // would throw on undefined here).
    expect(out.observability?.alarms).toBeUndefined()
  })

  test('customized: explicit retention values, logGroup/filters/thresholds presence counts', () => {
    const out = buildSandboxesAnalytics({
      a: {
        artifact: './a',
        observability: {
          logs: { retentionDays: 30, logGroup: '/custom/name' },
          metrics: { filters: { fatal: '%FATAL%' } },
          alarms: {
            notify: 'arn:aws:sns:us-east-1:1:t',
            thresholds: { fatal: { threshold: 1 } },
          },
        },
      },
      b: { artifact: './b', observability: { logs: { retentionDays: 30 } } },
    })
    expect(out.observability.customized).toEqual({
      retentionDays: [30],
      logGroup: 1,
      metricFilters: 1,
      alarmThresholds: 1,
    })
  })

  test('explicitly setting retention to the default 14 IS reported (explicit-only)', () => {
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', observability: { logs: { retentionDays: 14 } } },
    })
    expect(out.observability.customized.retentionDays).toEqual([14])
  })
})

describe('anti-drift: analytics interpretation agrees with resolveObservability', () => {
  const grid = [
    undefined,
    true,
    false,
    {},
    { logs: { enabled: false } },
    {
      logs: { enabled: false },
      alarms: { notify: 'arn:aws:sns:us-east-1:1:t' },
    },
  ]
  test.each(grid.map((raw, i) => [i, raw]))('config #%s', (_, raw) => {
    const resolved = resolveObservability(raw)
    const out = buildSandboxesAnalytics({
      a: { artifact: './a', observability: raw },
    })
    const o = out.observability ?? {}
    // "defaults or true" ⇔ monitoring fully on with defaults
    if (raw === undefined || raw === true) {
      expect(o.defaults).toBe(1)
      expect(resolved.metrics.enabled).toBe(true)
    }
    // disabled ⇔ compiler turns the monitoring layer off
    if (raw === false) {
      expect(o.disabled).toBe(1)
      expect(resolved.metrics.enabled).toBe(false)
    }
    // logsDisabled ⇔ compiler disables logs
    expect((o.logsDisabled ?? 0) > 0).toBe(resolved.logs.enabled === false)
    // alarms counted ⇔ compiler builds alarms
    expect((o.alarms ?? 0) > 0).toBe(resolved.alarms !== null)
  })
})

describe('privacy guard — no user-authored strings ever leak', () => {
  test('marker strings from every free-form knob are absent from the output', () => {
    const M = 'MARKER_SECRET'
    const out = buildSandboxesAnalytics({
      [`sandbox-${M}`]: {
        artifact: `./path-${M}`,
        description: `desc ${M}`,
        environment: { [`ENV_${M}`]: `val-${M}` },
        tags: { [`tag-${M}`]: `tv-${M}` },
        iam: { executionRole: `arn:aws:iam::123:role/${M}` },
        vpc: { subnetIds: [`subnet-${M}`], securityGroupIds: [`sg-${M}`] },
        osCapabilities: [`CAP_${M}`.replace('${M}', M)],
        observability: {
          logs: { logGroup: `/lg/${M}`, retentionDays: 30 },
          metrics: { filters: { [`f${M}`]: `%${M}%` } },
          alarms: {
            notify: `arn:aws:sns:us-east-1:1:${M}`,
            thresholds: { [`f${M}`]: { threshold: 9 } },
          },
        },
      },
    })
    expect(JSON.stringify(out)).not.toContain(M)
  })
})
