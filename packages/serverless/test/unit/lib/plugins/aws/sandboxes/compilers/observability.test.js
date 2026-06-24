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
  expect(mt.DefaultValue).toBe(0)
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

import { compileDashboard } from '../../../../../../../lib/plugins/aws/sandboxes/compilers/observability.js'

test('compileDashboard: emits a Dashboard with a well-formed body referencing the group + metric', () => {
  const r = resolveObservability(undefined)
  const out = compileDashboard('echo', r, {
    serviceName: 'svc',
    stage: 'dev',
    region: 'us-east-1',
  })
  const dash = out[Object.keys(out)[0]]
  expect(dash.Type).toBe('AWS::CloudWatch::Dashboard')
  expect(typeof dash.Properties.DashboardBody).toBe('string')
  const body = JSON.parse(dash.Properties.DashboardBody)
  expect(Array.isArray(body.widgets)).toBe(true)
  expect(body.widgets.length).toBeGreaterThanOrEqual(3)
  const blob = JSON.stringify(body)
  expect(blob).toContain('/aws/lambda-microvms/svc-echo-dev') // log group referenced
  expect(blob).toContain('ServerlessFramework/Sandboxes') // error metric namespace
  expect(blob).toContain('IncomingLogEvents') // AWS/Logs builtin
})

test('compileDashboard: disabled → none', () => {
  expect(
    compileDashboard('echo', resolveObservability(false), {
      serviceName: 'svc',
      stage: 'dev',
      region: 'us-east-1',
    }),
  ).toEqual({})
})
