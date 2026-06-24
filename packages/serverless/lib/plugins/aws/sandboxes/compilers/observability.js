import { getResourceName, getLogicalId } from '../utils/naming.js'

// Default error filter — case-insensitive match of error/exception/fail.
// CloudWatch Logs filter patterns do not support (?i) inline flags, so
// case-insensitivity is expressed via character classes instead.
export const DEFAULT_ERROR_FILTER = {
  errors:
    '%[Ee][Rr][Rr][Oo][Rr]|[Ee][Xx][Cc][Ee][Pp][Tt][Ii][Oo][Nn]|[Ff][Aa][Ii][Ll]%',
}

const DEFAULT_RETENTION_DAYS = 14

/**
 * Normalize cfg.observability (undefined|true|false|object) to a resolved shape.
 * @returns {{logs:{enabled:boolean,retentionDays:number,logGroup?:string},
 *            metrics:{enabled:boolean,filters:object},
 *            dashboard:{enabled:boolean},
 *            alarms:{notify:any,thresholds:object}|null}}
 */
export function resolveObservability(raw) {
  // Monitoring on by default. `false` opts out of the monitoring layer only.
  const monitoringOn = raw !== false
  const obj = raw && typeof raw === 'object' ? raw : {}

  const logsCfg = obj.logs || {}
  // `logs.enabled: false` turns MicroVM logging off entirely — the image emits
  // `Logging: { Disabled: true }` and the owned log group is not created.
  // Metrics/dashboard/alarms read from that log group, so they require logging.
  const logsEnabled = logsCfg.enabled !== false
  const logs = {
    enabled: logsEnabled,
    retentionDays: logsCfg.retentionDays ?? DEFAULT_RETENTION_DAYS,
    logGroup: logsCfg.logGroup, // undefined ⇒ default /aws/lambda-microvms/<Name>
  }

  const metricsCfg = obj.metrics || {}
  const metrics = {
    enabled: logsEnabled && monitoringOn && metricsCfg.enabled !== false,
    filters: metricsCfg.filters || DEFAULT_ERROR_FILTER,
  }

  const dashboardCfg = obj.dashboard || {}
  const dashboard = {
    enabled: logsEnabled && monitoringOn && dashboardCfg.enabled !== false,
  }

  // Alarms only when logging is on AND an alarms block with a notify target is present.
  let alarms = null
  if (logsEnabled && obj.alarms && obj.alarms.notify) {
    alarms = {
      notify: obj.alarms.notify,
      thresholds: obj.alarms.thresholds || {},
    }
  }

  return { logs, metrics, dashboard, alarms }
}

/**
 * Compile the always-owned AWS::Logs::LogGroup for a sandbox.
 * @param {string} name
 * @param {object} resolved - result of resolveObservability
 * @param {object} ctx - { serviceName, stage }
 */
export function compileLogGroup(name, resolved, ctx) {
  const Name = getResourceName(ctx.serviceName, name, ctx.stage)
  return {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: resolved.logs.logGroup || `/aws/lambda-microvms/${Name}`,
      RetentionInDays: resolved.logs.retentionDays,
    },
  }
}

export const METRIC_NAMESPACE = 'ServerlessFramework/Sandboxes'

export const DEFAULT_THRESHOLD = {
  threshold: 5,
  period: 300,
  evaluationPeriods: 1,
  datapointsToAlarm: 1,
  comparisonOperator: 'GreaterThanThreshold',
  treatMissingData: 'notBreaching',
}

export function metricName(name, ctx, filterKey) {
  return `${getResourceName(ctx.serviceName, name, ctx.stage)}-${filterKey}`
}

export function compileMetricFilters(name, resolved, ctx, logGroupLogicalId) {
  if (!resolved.metrics.enabled) return {}
  const out = {}
  for (const [filterKey, pattern] of Object.entries(resolved.metrics.filters)) {
    const logicalId = getLogicalId(name, `Image${cap(filterKey)}MetricFilter`)
    out[logicalId] = {
      Type: 'AWS::Logs::MetricFilter',
      Properties: {
        LogGroupName: { Ref: logGroupLogicalId },
        FilterPattern: pattern,
        MetricTransformations: [
          {
            MetricNamespace: METRIC_NAMESPACE,
            MetricName: metricName(name, ctx, filterKey),
            MetricValue: '1',
            DefaultValue: 0,
          },
        ],
      },
    }
  }
  return out
}

export function compileAlarms(name, resolved, ctx) {
  if (!resolved.alarms) return {}
  const out = {}
  for (const filterKey of Object.keys(resolved.metrics.filters)) {
    const t = {
      ...DEFAULT_THRESHOLD,
      ...(resolved.alarms.thresholds[filterKey] || {}),
    }
    const logicalId = getLogicalId(name, `Image${cap(filterKey)}Alarm`)
    out[logicalId] = {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmDescription: `Sandbox ${name} ${filterKey} alarm`,
        Namespace: METRIC_NAMESPACE,
        MetricName: metricName(name, ctx, filterKey),
        Statistic: 'Sum',
        Period: t.period,
        EvaluationPeriods: t.evaluationPeriods,
        DatapointsToAlarm: t.datapointsToAlarm,
        Threshold: t.threshold,
        ComparisonOperator: t.comparisonOperator,
        TreatMissingData: t.treatMissingData,
        AlarmActions: [resolved.alarms.notify],
      },
    }
  }
  return out
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function compileDashboard(name, resolved, ctx) {
  if (!resolved.dashboard.enabled) return {}
  const Name = getResourceName(ctx.serviceName, name, ctx.stage)
  const logGroupName = resolved.logs.logGroup || `/aws/lambda-microvms/${Name}`
  const region = ctx.region

  // Log-volume + recent-logs read straight from the owned log group, so they
  // are valid whenever the dashboard exists.
  const widgets = [
    {
      type: 'metric',
      width: 12,
      height: 6,
      properties: {
        title: 'Log volume & events',
        region,
        metrics: [
          ['AWS/Logs', 'IncomingBytes', 'LogGroupName', logGroupName],
          ['AWS/Logs', 'IncomingLogEvents', 'LogGroupName', logGroupName],
        ],
        stat: 'Sum',
        period: 300,
      },
    },
  ]

  // The filter metrics exist only when metrics are enabled, and their names come
  // from the configured filters — derive the widget from those keys rather than
  // hard-coding an `errors` metric that may not exist.
  if (resolved.metrics.enabled) {
    const filterKeys = Object.keys(resolved.metrics.filters)
    if (filterKeys.length) {
      widgets.push({
        type: 'metric',
        width: 12,
        height: 6,
        properties: {
          title: 'Filtered metrics',
          region,
          metrics: filterKeys.map((k) => [
            METRIC_NAMESPACE,
            metricName(name, ctx, k),
          ]),
          stat: 'Sum',
          period: 300,
        },
      })
    }
  }

  widgets.push({
    type: 'log',
    width: 24,
    height: 6,
    properties: {
      title: 'Recent logs',
      region,
      query: `SOURCE '${logGroupName}' | fields @timestamp, @message | sort @timestamp desc | limit 50`,
      view: 'table',
    },
  })

  const body = { widgets }

  const logicalId = getLogicalId(name, 'ImageDashboard')
  return {
    [logicalId]: {
      Type: 'AWS::CloudWatch::Dashboard',
      Properties: {
        DashboardName: `${Name}-sandbox`,
        DashboardBody: JSON.stringify(body),
      },
    },
  }
}
