<!--
title: serverless metrics
description: Print invocations, throttles, errors and average duration of a service's Lambda functions from CloudWatch with serverless metrics.
short_title: metrics
keywords:
  [
    'serverless metrics',
    'Serverless Framework CLI',
    'Lambda CloudWatch metrics',
    'Lambda invocations and errors',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/metrics)

<!-- DOCS-SITE-LINK:END -->

# serverless metrics

`serverless metrics` prints four Amazon CloudWatch metrics of a deployed service's Lambda functions over a time range, the last 24 hours by default: invocations, throttles, errors and average duration. It only reads metrics. Without `--function` it adds up all functions in the service; with `--function` it reports one. For the log lines behind the numbers, use [`serverless logs`](./logs.md).

```bash
serverless metrics
```

The command prints the scope, the time range in your local time, and the totals:

```text
Service Metrics
October 30, 2026 2:00 PM - October 31, 2026 2:00 PM

Invocations: 1042
Throttles: 0
Errors: 3
Average Duration: 118.42ms
```

## Options

`serverless metrics` accepts these options:

| Option          | Alias | Value                                 | Default                             | Required | Description                                                         |
| --------------- | ----- | ------------------------------------- | ----------------------------------- | -------- | ------------------------------------------------------------------- |
| `--function`    | `-f`  | string                                | All functions                       | No       | Function to report, as named under `functions` in `serverless.yml`. |
| `--startTime`   |       | `30m`, `2h`, `3d` or an ISO 8601 date | 24 hours ago                        | No       | Start of the time range.                                            |
| `--endTime`     |       | ISO 8601 date                         | Now                                 | No       | End of the time range. Relative times are not accepted.             |
| `--stage`       | `-s`  | string                                | `provider.stage`, else `dev`        | No       | Stage of the deployed service.                                      |
| `--region`      | `-r`  | string                                | `provider.region`, else `us-east-1` | No       | AWS Region of the deployed service.                                 |
| `--aws-profile` |       | string                                | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                     |
| `--config`      | `-c`  | file path                             | `serverless.yml`                    | No       | Service configuration file to use.                                  |

The command also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## Metrics that serverless metrics reports

`serverless metrics` reads these [Lambda metrics](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html) from the `AWS/Lambda` namespace, per function, and combines them:

| Line               | Metric        | How it is combined                            |
| ------------------ | ------------- | --------------------------------------------- |
| `Invocations`      | `Invocations` | Sum over the range and the functions.         |
| `Throttles`        | `Throttles`   | Sum over the range and the functions.         |
| `Errors`           | `Errors`      | Sum over the range and the functions.         |
| `Average Duration` | `Duration`    | Mean of the period averages, in milliseconds. |

The metrics are fetched in one-hour periods for a range of up to 24 hours, and in one-day periods for a longer range. When CloudWatch returns no data, the command prints zeros (`Invocations: 0`, `Average Duration: 0ms`); `No metrics found` appears only for a service without functions. Metrics reach CloudWatch with a short delay, so the latest invocations can be missing from the totals.

## Time range formats

The `serverless metrics` `--startTime` option takes a relative time (`30m`, `2h`, `3d`) or an ISO 8601 date; `--endTime` takes only a date. A date alone, such as `2026-10-01`, is read as midnight UTC; a date and time without a time zone, such as `2026-10-01T09:00`, as your local time; add `Z` or an offset to set the zone.

## Side effects and CI use

- `serverless metrics` only reads metrics, with `cloudwatch:GetMetricStatistics`, and is safe to re-run.
- The command does not prompt and returns after one read, so it can run in scripts and CI.

## Provided lifecycle events

- `metrics:metrics`

## Examples

### Print service-wide metrics for a date range

```bash
serverless metrics --startTime 2026-10-01 --endTime 2026-10-02
```

### Print one function's metrics for the last 24 hours

```bash
serverless metrics --function hello
```

### Print one function's metrics for the last 3 hours

```bash
serverless metrics --function hello --startTime 3h
```

## Related commands

- [`serverless logs`](./logs.md) prints a function's log events.
- [`serverless info`](./info.md) prints the deployed service's functions and endpoints.
