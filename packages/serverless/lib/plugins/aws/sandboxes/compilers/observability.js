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
            // No DefaultValue: mirror Lambda's Errors metric, which is sparse
            // (a data point only when there's a match) rather than zero-filled.
            // Alarms stay correct via TreatMissingData: notBreaching. Leaving
            // DefaultValue off also keeps the door open for metric-filter
            // dimensions later (the two are mutually exclusive).
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
        // Deterministic name so the dashboard alarm widget can reference its ARN.
        AlarmName: metricName(name, ctx, filterKey),
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

  // 1. Log volume & events. IncomingBytes (large) and IncomingLogEvents (small
  //    counts) share a widget but sit on separate Y-axes, so the event-count
  //    line isn't crushed flat against the byte scale.
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
          [
            'AWS/Logs',
            'IncomingLogEvents',
            'LogGroupName',
            logGroupName,
            { yAxis: 'right' },
          ],
        ],
        stat: 'Sum',
        period: 300,
        yAxis: { left: { label: 'Bytes' }, right: { label: 'Events' } },
      },
    },
  ]

  // 2. Filter-derived metrics. Names come from the configured filters (not a
  //    hard-coded `errors`); the title reflects the content — "Errors" for the
  //    default single error filter, "Log-based metrics" for custom filters.
  if (resolved.metrics.enabled) {
    const filterKeys = Object.keys(resolved.metrics.filters)
    if (filterKeys.length) {
      const isDefaultErrors =
        filterKeys.length === 1 && filterKeys[0] === 'errors'
      widgets.push({
        type: 'metric',
        width: 12,
        height: 6,
        properties: {
          title: isDefaultErrors ? 'Errors' : 'Log-based metrics',
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

  // 3. MicroVMs created. Each log stream is exactly one MicroVM instance (the
  //    stream name embeds the microvmId), so a distinct-stream count over time
  //    tracks instance creation / churn — a MicroVM-specific signal with no
  //    equivalent CloudWatch metric.
  widgets.push({
    type: 'log',
    width: 12,
    height: 6,
    properties: {
      title: 'MicroVMs created',
      region,
      query: `SOURCE '${logGroupName}' | stats count_distinct(@logStream) as microvms by bin(5m)`,
      view: 'bar',
      // NOTE: log (Logs Insights) widgets don't support a `legend` property — it
      // only works on metric widgets — so the single "microvms" series label is
      // shown by CloudWatch regardless. No JSON knob hides it here.
    },
  })

  // 4. Recent logs.
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

  // 5. Recent error logs — the lines behind the errors metric. Logs Insights
  //    can't use the metric filter's char-class pattern, so match the same
  //    error/exception/fail terms with a case-insensitive regex. Gated on the
  //    error filter (and metrics) so it tracks the errors metric widget.
  if (resolved.metrics.enabled && resolved.metrics.filters.errors) {
    widgets.push({
      type: 'log',
      width: 24,
      height: 6,
      properties: {
        title: 'Errors (recent)',
        region,
        query: `SOURCE '${logGroupName}' | fields @timestamp, @message | filter @message like /(?i)(error|exception|fail)/ | sort @timestamp desc | limit 50`,
        view: 'table',
      },
    })
  }

  // 6. Alarm status — only when alarms are configured. Pinned to the top so
  //    state is the first thing you see. Referenced by ARN built from the
  //    AlarmName set in compileAlarms; account/partition resolve at deploy via
  //    Fn::Sub, keeping compile offline.
  let useSub = false
  if (resolved.alarms) {
    const alarmArns = Object.keys(resolved.metrics.filters).map(
      (k) =>
        `arn:\${AWS::Partition}:cloudwatch:${region}:\${AWS::AccountId}:alarm:${metricName(
          name,
          ctx,
          k,
        )}`,
    )
    widgets.unshift({
      type: 'alarm',
      width: 24,
      height: 2,
      properties: {
        title: 'Alarms',
        alarms: alarmArns,
        sortBy: 'stateUpdatedTimestamp',
      },
    })
    useSub = true
  }

  const body = { widgets }
  const dashboardBody = useSub
    ? { 'Fn::Sub': JSON.stringify(body) }
    : JSON.stringify(body)

  const logicalId = getLogicalId(name, 'ImageDashboard')
  return {
    [logicalId]: {
      Type: 'AWS::CloudWatch::Dashboard',
      Properties: {
        DashboardName: `${Name}-sandbox`,
        DashboardBody: dashboardBody,
      },
    },
  }
}
