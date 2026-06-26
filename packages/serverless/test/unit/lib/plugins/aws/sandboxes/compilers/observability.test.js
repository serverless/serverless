import {
  resolveObservability,
  compileLogGroup,
  DEFAULT_ERROR_FILTER,
} from '../../../../../../../lib/plugins/aws/sandboxes/compilers/observability.js'

test('absent ⇒ true: metrics + dashboard on, alarms off', () => {
  const r = resolveObservability(undefined)
  expect(r.metrics.enabled).toBe(true)
  expect(r.dashboard.enabled).toBe(true)
  expect(r.alarms).toBeNull()
  expect(r.logs.retentionDays).toBe(14)
  expect(r.metrics.filters).toEqual(DEFAULT_ERROR_FILTER)
})

test('true ⇒ same as absent', () => {
  expect(resolveObservability(true)).toEqual(resolveObservability(undefined))
})

test('false ⇒ metrics + dashboard off, alarms null (logging itself still on)', () => {
  const r = resolveObservability(false)
  expect(r.metrics.enabled).toBe(false)
  expect(r.dashboard.enabled).toBe(false)
  expect(r.alarms).toBeNull()
  expect(r.logs.retentionDays).toBe(14)
  // `observability: false` opts out of the monitoring layer only — logging stays on.
  expect(r.logs.enabled).toBe(true)
})

test('object: alarms enabled only with notify; custom retention respected', () => {
  const r = resolveObservability({
    logs: { retentionDays: 30 },
    alarms: { notify: 'arn:sns' },
  })
  expect(r.logs.retentionDays).toBe(30)
  expect(r.logs.enabled).toBe(true)
  expect(r.alarms.notify).toBe('arn:sns')
  expect(r.metrics.enabled).toBe(true) // present-object defaults on
  expect(r.dashboard.enabled).toBe(true)
})

test('logs.enabled:false ⇒ logging disabled; metrics/dashboard/alarms forced off', () => {
  const r = resolveObservability({
    logs: { enabled: false },
    metrics: { enabled: true },
    dashboard: { enabled: true },
    alarms: { notify: 'arn:sns' },
  })
  expect(r.logs.enabled).toBe(false)
  // Everything that reads from the log group is off when logging is disabled.
  expect(r.metrics.enabled).toBe(false)
  expect(r.dashboard.enabled).toBe(false)
  expect(r.alarms).toBeNull()
})

test('object: metrics.enabled:false turns metrics off', () => {
  expect(
    resolveObservability({ metrics: { enabled: false } }).metrics.enabled,
  ).toBe(false)
})

test('compileLogGroup: owns /aws/lambda-microvms/<Name> with retention', () => {
  const res = compileLogGroup('echo', resolveObservability(undefined), {
    serviceName: 'svc',
    stage: 'dev',
  })
  expect(res.Type).toBe('AWS::Logs::LogGroup')
  expect(res.Properties.LogGroupName).toBe('/aws/lambda-microvms/svc-echo-dev')
  expect(res.Properties.RetentionInDays).toBe(14)
})

test('compileLogGroup: uses the default name + custom retention', () => {
  const r = resolveObservability({ logs: { retentionDays: 7 } })
  const res = compileLogGroup('echo', r, { serviceName: 'svc', stage: 'dev' })
  expect(res.Properties.LogGroupName).toBe('/aws/lambda-microvms/svc-echo-dev')
  expect(res.Properties.RetentionInDays).toBe(7)
})

test('logGroup override is carried through and names the owned group', () => {
  const r = resolveObservability({
    logs: { logGroup: '/my-org/sbx/api', retentionDays: 7 },
  })
  expect(r.logs.logGroup).toBe('/my-org/sbx/api')
  const res = compileLogGroup('echo', r, { serviceName: 'svc', stage: 'dev' })
  expect(res.Properties.LogGroupName).toBe('/my-org/sbx/api')
})

import {
  compileMetricFilters,
  compileAlarms,
  METRIC_NAMESPACE,
} from '../../../../../../../lib/plugins/aws/sandboxes/compilers/observability.js'
import { getLogicalId } from '../../../../../../../lib/plugins/aws/sandboxes/utils/naming.js'

const ctx = { serviceName: 'svc', stage: 'dev' }

test('compileMetricFilters: one filter → MetricFilter on the group with namespaced metric', () => {
  const r = resolveObservability(undefined)
  const lg = getLogicalId('echo', 'ImageLogGroup')
  const out = compileMetricFilters('echo', r, ctx, lg)
  const key = Object.keys(out)[0]
  const mf = out[key]
  expect(mf.Type).toBe('AWS::Logs::MetricFilter')
  expect(mf.Properties.LogGroupName).toEqual({ Ref: lg })
  expect(mf.Properties.FilterPattern).toBe(
    '%[Ee][Rr][Rr][Oo][Rr]|[Ee][Xx][Cc][Ee][Pp][Tt][Ii][Oo][Nn]|[Ff][Aa][Ii][Ll]%',
  )
  const mt = mf.Properties.MetricTransformations[0]
  expect(mt.MetricNamespace).toBe(METRIC_NAMESPACE)
  expect(mt.MetricName).toBe('svc-echo-dev-errors')
  expect(mt.MetricValue).toBe('1')
  // Follow Lambda's Errors-metric behavior: sparse, no DefaultValue zero-fill.
  // Robust alarming comes from the alarm's TreatMissingData: notBreaching.
  expect(mt.DefaultValue).toBeUndefined()
})

test('compileMetricFilters: metrics disabled → no filters', () => {
  expect(
    compileMetricFilters('echo', resolveObservability(false), ctx, 'LG'),
  ).toEqual({})
})

test('compileAlarms: null alarms → none', () => {
  expect(compileAlarms('echo', resolveObservability(undefined), ctx)).toEqual(
    {},
  )
})

test('compileAlarms: notify → alarm with defaults + AlarmActions', () => {
  const r = resolveObservability({ alarms: { notify: 'arn:sns:topic' } })
  const out = compileAlarms('echo', r, ctx)
  const al = out[Object.keys(out)[0]]
  expect(al.Type).toBe('AWS::CloudWatch::Alarm')
  // Deterministic AlarmName so the dashboard alarm widget can build its ARN.
  expect(al.Properties.AlarmName).toBe('svc-echo-dev-errors')
  expect(al.Properties.Namespace).toBe(METRIC_NAMESPACE)
  expect(al.Properties.MetricName).toBe('svc-echo-dev-errors')
  expect(al.Properties.Threshold).toBe(5)
  expect(al.Properties.Period).toBe(300)
  expect(al.Properties.EvaluationPeriods).toBe(1)
  expect(al.Properties.ComparisonOperator).toBe('GreaterThanThreshold')
  expect(al.Properties.TreatMissingData).toBe('notBreaching')
  expect(al.Properties.AlarmActions).toEqual(['arn:sns:topic'])
})

test('compileAlarms: per-metric threshold override', () => {
  const r = resolveObservability({
    alarms: {
      notify: 'arn:sns',
      thresholds: { errors: { threshold: 10, period: 60 } },
    },
  })
  const al = compileAlarms('echo', r, ctx)
  const a = al[Object.keys(al)[0]]
  expect(a.Properties.Threshold).toBe(10)
  expect(a.Properties.Period).toBe(60)
  expect(a.Properties.EvaluationPeriods).toBe(1) // unspecified ⇒ default
})

import {
  buildDashboardWidgets,
  compileServiceDashboard,
} from '../../../../../../../lib/plugins/aws/sandboxes/compilers/observability.js'

const dctx = { serviceName: 'svc', stage: 'dev', region: 'us-east-1' }
const widgetsFor = (r, name = 'echo') => buildDashboardWidgets(name, r, dctx)
const titlesOf = (w) => w.map((x) => x.properties.title)

test('buildDashboardWidgets: disabled → []', () => {
  expect(widgetsFor(resolveObservability(false))).toEqual([])
})

test('buildDashboardWidgets: default → volume + errors metric + microvms + recent + errors-recent', () => {
  const w = widgetsFor(resolveObservability(undefined))
  expect(titlesOf(w)).toEqual(
    expect.arrayContaining([
      'Log volume & events',
      'Errors',
      'MicroVMs created',
      'Recent logs',
      'Errors (recent)',
    ]),
  )
  const blob = JSON.stringify(w)
  expect(blob).toContain('/aws/lambda-microvms/svc-echo-dev') // log group referenced
  expect(blob).toContain('ServerlessFramework/Sandboxes') // error metric namespace
  expect(blob).toContain('IncomingLogEvents') // AWS/Logs builtin
})

test('buildDashboardWidgets: IncomingLogEvents is plotted on the right Y-axis', () => {
  const vol = widgetsFor(resolveObservability(undefined)).find(
    (w) => w.properties.title === 'Log volume & events',
  )
  const events = vol.properties.metrics.find((m) =>
    m.includes('IncomingLogEvents'),
  )
  expect(events[events.length - 1]).toEqual({ yAxis: 'right' })
})

test('buildDashboardWidgets: default error filter ⇒ "Errors"; custom ⇒ "Log-based metrics"', () => {
  expect(
    widgetsFor(resolveObservability(undefined)).some(
      (w) => w.properties.title === 'Errors',
    ),
  ).toBe(true)
  const custom = widgetsFor(
    resolveObservability({ metrics: { filters: { fail: '%FAIL%' } } }),
  )
  expect(custom.some((w) => w.properties.title === 'Log-based metrics')).toBe(
    true,
  )
  const blob = JSON.stringify(custom)
  expect(blob).toContain('svc-echo-dev-fail')
  expect(blob).not.toContain('svc-echo-dev-errors')
})

test('buildDashboardWidgets: metrics disabled → volume + microvms + recent only', () => {
  const w = widgetsFor(resolveObservability({ metrics: { enabled: false } }))
  expect(w).toHaveLength(3)
  expect(JSON.stringify(w)).not.toContain('ServerlessFramework/Sandboxes')
  expect(w.some((x) => x.properties.title === 'Errors (recent)')).toBe(false)
})

test('buildDashboardWidgets: MicroVMs widget graphs distinct streams as bars, no legend', () => {
  const w = widgetsFor(resolveObservability(undefined)).find(
    (x) => x.properties.title === 'MicroVMs created',
  )
  expect(w.type).toBe('log')
  expect(w.properties.view).toBe('bar')
  expect(w.properties.query).toContain('count_distinct(@logStream)')
  // No `legend` property — it's unsupported on log widgets, so we don't emit it.
  expect(w.properties.legend).toBeUndefined()
})

test('buildDashboardWidgets: "Errors (recent)" filters error terms; absent w/o errors filter', () => {
  const w = widgetsFor(resolveObservability(undefined)).find(
    (x) => x.properties.title === 'Errors (recent)',
  )
  expect(w.type).toBe('log')
  expect(w.properties.query).toContain('(?i)(error|exception|fail)')
  const custom = widgetsFor(
    resolveObservability({ metrics: { filters: { fail: '%FAIL%' } } }),
  )
  expect(custom.some((x) => x.properties.title === 'Errors (recent)')).toBe(
    false,
  )
})

test('buildDashboardWidgets: alarms ⇒ alarm widget + threshold band on the metric widget', () => {
  const w = widgetsFor(resolveObservability({ alarms: { notify: 'arn:sns' } }))
  const alarm = w.find((x) => x.type === 'alarm')
  expect(alarm.properties.alarms).toEqual([
    'arn:${AWS::Partition}:cloudwatch:us-east-1:${AWS::AccountId}:alarm:svc-echo-dev-errors',
  ])
  const metric = w.find((x) => x.properties.title === 'Errors')
  expect(metric.properties.annotations.horizontal[0].value).toBe(5) // default threshold
})

test('buildDashboardWidgets: threshold band honors per-filter override', () => {
  const w = widgetsFor(
    resolveObservability({
      alarms: { notify: 'arn:sns', thresholds: { errors: { threshold: 12 } } },
    }),
  )
  const metric = w.find((x) => x.properties.title === 'Errors')
  expect(metric.properties.annotations.horizontal[0].value).toBe(12)
})

test('compileServiceDashboard: no widgets → {}', () => {
  expect(compileServiceDashboard([{ name: 'a', widgets: [] }], dctx)).toEqual(
    {},
  )
  expect(compileServiceDashboard([], dctx)).toEqual({})
})

test('compileServiceDashboard: ONE dashboard per service with a text header per sandbox', () => {
  const sections = [
    {
      name: 'web',
      widgets: widgetsFor(resolveObservability(undefined), 'web'),
    },
    {
      name: 'worker',
      widgets: widgetsFor(resolveObservability(undefined), 'worker'),
    },
  ]
  const out = compileServiceDashboard(sections, dctx)
  expect(Object.keys(out)).toEqual(['SandboxesDashboard'])
  const dash = out.SandboxesDashboard
  expect(dash.Type).toBe('AWS::CloudWatch::Dashboard')
  expect(dash.Properties.DashboardName).toBe('svc-dev-sandboxes')
  expect(typeof dash.Properties.DashboardBody).toBe('string') // no alarms → plain
  const body = JSON.parse(dash.Properties.DashboardBody)
  const headers = body.widgets
    .filter((x) => x.type === 'text')
    .map((x) => x.properties.markdown)
  expect(headers).toEqual(['## web', '## worker'])
})

test('compileServiceDashboard: Fn::Sub body when a section has alarms', () => {
  const out = compileServiceDashboard(
    [
      {
        name: 'web',
        widgets: widgetsFor(
          resolveObservability({ alarms: { notify: 'arn:sns' } }),
          'web',
        ),
      },
    ],
    dctx,
  )
  expect(
    typeof out.SandboxesDashboard.Properties.DashboardBody['Fn::Sub'],
  ).toBe('string')
})
