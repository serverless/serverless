<!--
title: CloudWatch Alarms for Lambda Functions
description: Create CloudWatch alarms, SNS notifications and dashboards for your Lambda functions with the built-in custom.alerts settings.
short_title: Alerts
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'CloudWatch alarms',
    'CloudWatch alerts',
    'SNS notifications',
    'CloudWatch dashboard',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/alerts)

<!-- DOCS-SITE-LINK:END -->

# CloudWatch Alarms for Lambda Functions

The Serverless Framework's built-in alerts create Amazon CloudWatch alarms for every Lambda function in your service, SNS topics that notify you when an alarm fires, and optional CloudWatch dashboards. Configure them under `custom.alerts` in `serverless.yml`; no plugin is needed. For an alarm on something other than your functions' metrics or logs, add an `AWS::CloudWatch::Alarm` resource in [`resources`](./resources.md) instead.

To email yourself when any function in the `prod` stage reports an error or is throttled, add:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

custom:
  alerts:
    stages:
      - prod
    topics:
      alarm:
        topic: ${self:service}-${sls:stage}-alerts-alarm
        notifications:
          - protocol: email
            endpoint: ops@example.com
    alarms:
      - functionErrors
      - functionThrottles

functions:
  hello:
    handler: handler.hello
```

Deploying to `prod` creates two alarms per function and an SNS topic named `my-service-prod-alerts-alarm` with an email subscription; AWS sends a confirmation email to `ops@example.com` that must be accepted before notifications arrive. Replace the address with yours.

## Built-in alarm definitions

The Framework includes four alarm definitions for the standard Lambda metrics. List them by name under `custom.alerts.alarms`:

| Name                  | Metric (`AWS/Lambda`) | Statistic | Threshold | Fires when                                |
| --------------------- | --------------------- | --------- | --------- | ----------------------------------------- |
| `functionErrors`      | `Errors`              | `Sum`     | `1`       | At least 1 error in a 60-second period    |
| `functionThrottles`   | `Throttles`           | `Sum`     | `1`       | At least 1 throttle in a 60-second period |
| `functionInvocations` | `Invocations`         | `Sum`     | `100`     | 100 or more invocations in 60 seconds     |
| `functionDuration`    | `Duration`            | `Average` | `500`     | Average duration of 500 ms or more        |

Every built-in definition uses `period: 60`, `evaluationPeriods: 1`, `datapointsToAlarm: 1`, `comparisonOperator: GreaterThanOrEqualToThreshold` and `treatMissingData: missing`.

## Change a built-in alarm definition

To change one setting of a built-in alarm, set it under `custom.alerts.definitions` with the alarm's name. Your keys are merged over the built-in definition, so the rest stays as listed in [Built-in alarm definitions](#built-in-alarm-definitions):

```yaml
custom:
  alerts:
    definitions:
      functionErrors:
        period: 300
        treatMissingData: notBreaching
    alarms:
      - functionErrors
```

## Add a custom alarm definition

To alarm on another metric, define the alarm under `custom.alerts.definitions` and list its name under `alarms`. This example alarms when a function's 95th percentile duration reaches 3 seconds:

```yaml
custom:
  alerts:
    definitions:
      slowFunction:
        description: 'p95 duration of 3 seconds or more'
        namespace: 'AWS/Lambda'
        metric: Duration
        threshold: 3000
        statistic: p95
        period: 300
        evaluationPeriods: 1
        datapointsToAlarm: 1
        comparisonOperator: GreaterThanOrEqualToThreshold
    alarms:
      - slowFunction
```

Metric names are case-sensitive and must match CloudWatch's (`Duration`, not `duration`). The [alarm definition keys](#alarm-definition-keys) list every setting. Each alarm in `custom.alerts.alarms` is created once per function, with the function's name as the `FunctionName` dimension.

## Configure alarms for one function

To add alarms to one function, list them under the function's `alarms`. An entry is a definition name, or an object with `name` and any [alarm definition keys](#alarm-definition-keys); when the name matches a definition, the object's keys are merged over it:

```yaml
custom:
  alerts:
    alarms:
      - functionErrors
      - functionInvocations

functions:
  checkout:
    handler: handler.checkout
    alarms:
      - functionThrottles
      - name: functionErrors
        threshold: 5
      - name: functionInvocations
        enabled: false
```

The `checkout` function gets a throttle alarm, an errors alarm with a threshold of 5 instead of the service-wide one, and no invocations alarm (`enabled: false`). A function-level alarm with the same name as a service-wide alarm replaces it for that function.

## Send alarm notifications to SNS topics

The topics under `custom.alerts.topics` receive the alarm's state changes:

- `alarm`: the alarm enters the `ALARM` state.
- `ok`: the alarm returns to `OK`.
- `insufficientData`: the alarm enters `INSUFFICIENT_DATA`.

A topic value is either a topic name or an existing topic. For a name, the Framework creates an SNS topic with that name in your stack (logical ID `AwsAlertsAlarm`, `AwsAlertsOk` or `AwsAlertsInsufficientData`). To subscribe endpoints to a topic the Framework creates, use the object form with `topic` and `notifications`:

```yaml
custom:
  alerts:
    topics:
      ok: ${self:service}-${sls:stage}-alerts-ok
      alarm:
        topic: ${self:service}-${sls:stage}-alerts-alarm
        notifications:
          - protocol: email
            endpoint: ops@example.com
          - protocol: https
            endpoint: https://hooks.example.com/alarms
```

Each notification is an SNS subscription with a `protocol` (`email`, `email-json`, `http`, `https`, `sms`, `sqs`, `lambda`, `application` or `firehose`) and an `endpoint`; see [Subscribe in the Amazon SNS API reference](https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html) for the endpoint format of each protocol.

## Use an existing SNS topic for alarms

To send alarms to a topic that already exists, give its ARN, or a CloudFormation intrinsic function that returns the ARN. The Framework then creates no topic, and `notifications` is not used:

```yaml
custom:
  alerts:
    topics:
      alarm:
        topic: arn:aws:sns:${aws:region}:${aws:accountId}:monitoring-${sls:stage}
      ok:
        topic:
          Fn::ImportValue: monitoring-ok-topic-arn
      insufficientData:
        topic:
          Ref: InsufficientDataTopic

resources:
  Resources:
    InsufficientDataTopic:
      Type: AWS::SNS::Topic
      Properties:
        DisplayName: insufficient-data
```

A string that starts with `arn:` is used as-is; any object (`Ref`, `Fn::ImportValue`, `Fn::Join`, `Fn::GetAtt`) is passed to CloudFormation unchanged.

## Route alarms to different topic groups

To send critical alarms to a paging service and other alarms to email, define named topic groups under `topics`, each with its own `ok`, `alarm` and `insufficientData` topics, and select groups per alarm with `okActions`, `alarmActions` and `insufficientDataActions`:

```yaml
custom:
  alerts:
    topics:
      critical:
        ok:
          topic: ${self:service}-${sls:stage}-critical-ok
          notifications:
            - protocol: https
              endpoint: https://events.example.com/integration/PAGING_KEY/enqueue
        alarm:
          topic: ${self:service}-${sls:stage}-critical-alarm
          notifications:
            - protocol: https
              endpoint: https://events.example.com/integration/PAGING_KEY/enqueue
      nonCritical:
        alarm:
          topic: ${self:service}-${sls:stage}-noncritical-alarm
          notifications:
            - protocol: email
              endpoint: ops@example.com
    definitions:
      criticalFunctionErrors:
        namespace: 'AWS/Lambda'
        metric: Errors
        threshold: 20
        statistic: Sum
        period: 60
        evaluationPeriods: 10
        comparisonOperator: GreaterThanOrEqualToThreshold
        okActions:
          - critical
        alarmActions:
          - critical
      nonCriticalFunctionErrors:
        namespace: 'AWS/Lambda'
        metric: Errors
        threshold: 1
        statistic: Sum
        period: 60
        evaluationPeriods: 10
        comparisonOperator: GreaterThanOrEqualToThreshold
        alarmActions:
          - nonCritical
    alarms:
      - criticalFunctionErrors
      - nonCriticalFunctionErrors
```

Replace `PAGING_KEY` with the integration key of your paging service. Every alarm also notifies the topics set directly under `topics` (`ok`, `alarm`, `insufficientData`), in addition to the groups it lists. Group topics accept the same forms as the top-level ones: a name, an ARN or an intrinsic function.

## Alarm on a log pattern

To alarm when a function logs a matching line, add `pattern` to an alarm definition. The value uses the [CloudWatch Logs filter pattern syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html):

```yaml
custom:
  alerts:
    definitions:
      barExceptions:
        metric: barExceptions
        threshold: 0
        statistic: Sum
        period: 60
        evaluationPeriods: 1
        comparisonOperator: GreaterThanThreshold
        pattern: 'exception Bar'
      jsonErrors:
        metric: jsonErrors
        threshold: 0
        statistic: Sum
        period: 60
        evaluationPeriods: 1
        datapointsToAlarm: 1
        comparisonOperator: GreaterThanThreshold
        pattern: '{$.level > 40}'
    alarms:
      - barExceptions
      - jsonErrors
```

For each function with a pattern alarm, the Framework adds two metric filters to the function's log group: one records `1` for each log event that matches the pattern, the other records `0` for every log event. The metric's namespace is the stack name (for example `my-service-prod`), its name is the `metric` value followed by the function's logical ID (`BarExceptionsHelloLambdaFunction`), and the alarm has no dimensions, so `namespace`, `dimensions` and `omitDefaultDimension` don't apply. Use `statistic: Sum` for a pattern alarm: because the second filter records `0` for every log event, `Minimum` is `0` in any period with log lines.

## Anomaly detection alarms

To alarm when a metric leaves its expected band instead of crossing a fixed value, set `type: anomalyDetection`. The alarm uses [CloudWatch anomaly detection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html); `threshold` sets the band width in standard deviations, and `comparisonOperator` must be `LessThanLowerOrGreaterThanUpperThreshold`, `LessThanLowerThreshold` or `GreaterThanUpperThreshold`:

```yaml
functions:
  foo:
    handler: handler.foo
    alarms:
      - name: fooInvocationsAnomaly
        type: anomalyDetection
        namespace: 'AWS/Lambda'
        metric: Invocations
        threshold: 2
        statistic: Sum
        period: 60
        evaluationPeriods: 1
        datapointsToAlarm: 1
        comparisonOperator: LessThanLowerOrGreaterThanUpperThreshold
  bar:
    handler: handler.bar
    alarms:
      - name: functionErrors
        type: anomalyDetection
        threshold: 2
        comparisonOperator: LessThanLowerOrGreaterThanUpperThreshold
```

The `bar` function turns the built-in `functionErrors` alarm into an anomaly detection alarm by overriding three keys.

## Percentile statistics

`statistic` accepts `SampleCount`, `Average`, `Sum`, `Minimum`, `Maximum` and percentiles such as `p95` or `p99.9`. For a percentile, the Framework sets the alarm's extended statistic and passes `evaluateLowSampleCountPercentile` (`evaluate` or `ignore`), which controls how the alarm treats periods with too few data points:

```yaml
custom:
  alerts:
    definitions:
      functionDuration:
        statistic: p95
        threshold: 100
        evaluateLowSampleCountPercentile: ignore
```

See [CloudWatch statistics definitions](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Statistics-definitions.html) for the percentile syntax.

## Alarm dimensions

Every metric alarm gets the dimension `FunctionName` set to the function's name. To alarm on a metric with other dimensions, add `dimensions` as a list of `Name` and `Value` pairs; to drop the `FunctionName` dimension, set `omitDefaultDimension: true`:

```yaml
custom:
  alerts:
    definitions:
      queueBacklog:
        namespace: 'AWS/SQS'
        metric: ApproximateNumberOfMessagesVisible
        threshold: 1000
        statistic: Maximum
        period: 60
        evaluationPeriods: 5
        comparisonOperator: GreaterThanThreshold
        omitDefaultDimension: true
        dimensions:
          - Name: QueueName
            Value: my-queue
```

The alarm is still created once per function that lists it, so with `omitDefaultDimension: true` list it on one function rather than under `custom.alerts.alarms`.

## Alarm names

Without `nameTemplate` or `prefixTemplate`, the Framework leaves the alarm name to CloudFormation, which generates one from the stack name and logical ID. To set names, add `nameTemplate` under `custom.alerts` for all alarms, or in an alarm definition for that alarm only:

```yaml
custom:
  alerts:
    nameTemplate: $[functionName]-$[metricName]-Alarm
    prefixTemplate: $[stackName]
```

`nameTemplate` supports these placeholders:

- `$[functionName]`: the function's name in `serverless.yml`, for example `helloWorld`.
- `$[functionId]`: the function's logical ID, for example `HelloWorldLambdaFunction`.
- `$[metricName]`: the alarm's `metric`, for example `Duration`.
- `$[metricId]`: for a log pattern alarm, the metric name plus the function's logical ID (`BunyanErrorsHelloWorldLambdaFunction`); otherwise the same as `$[metricName]`.

The name is the prefix, a hyphen and the template. `prefixTemplate` defaults to `$[stackName]` (for example `my-service-prod`), which is its only placeholder; `prefixTemplate: ''` removes the prefix. With only `prefixTemplate` set, the template is `$[functionName]-$[metricName]`, where the metric name is the alarm's name.

## Deploy alerts only on some stages

`custom.alerts.stages` lists the stages that get alerts. On any other stage, the Framework adds no alarms, topics or dashboards and logs:

```text
Warning: Not deploying alerts on stage dev
```

Without `stages`, alerts deploy on every stage.

## Create CloudWatch dashboards

To create a CloudWatch dashboard with your functions' invocations, errors, throttles and duration, and API Gateway requests and latency, set `dashboards`:

```yaml
custom:
  alerts:
    dashboards: true
```

`dashboards` accepts these values:

- `true`: one dashboard from the `default` template.
- A template name, `default` or `vertical` (the `vertical` template adds iterator age): one dashboard from that template.
- A list of template names, for example `[default, vertical]`: one dashboard per template.
- An object with `stages` (required) and `templates` (default `default`): dashboards only on the listed stages.

```yaml
custom:
  alerts:
    dashboards:
      stages:
        - prod
      templates:
        - default
        - vertical
```

The `default` dashboard is named `<service>-<stage>-<region>`; other templates append `-<template>`.

## Deploy alarms in a separate stack

To keep the alarms, topics and dashboards out of your service's stack, for example when that stack nears the CloudFormation resource quota, set `externalStack: true`:

```yaml
custom:
  alerts:
    externalStack: true
```

After `serverless deploy` updates the service's stack, the Framework deploys a second stack named after the service's stack with `-alerts` appended (for example `my-service-prod-alerts`). `serverless remove` deletes it before the service's stack, and a deploy with no alarms or dashboards left deletes it. The stack is tagged with `STAGE` and the service's `provider.stackTags`.

To change the suffix or add to the external stack, use the object form:

```yaml
custom:
  alerts:
    externalStack:
      nameSuffix: -monitoring
      deployParameters:
        - ParameterKey: Environment
          ParameterValue: ${sls:stage}
      resources:
        Parameters:
          Environment:
            Type: String
```

- `nameSuffix`: appended to the service's stack name. Default `-alerts`.
- `resources`: template sections merged into the external stack: `Description`, `Metadata`, `Parameters`, `Mappings`, `Conditions`, `Transform`, `Resources` and `Outputs`.
- `deployParameters`: a list of `ParameterKey` and `ParameterValue` pairs passed when the stack is created or updated.

The external stack refers to your functions by name through stack parameters that the Framework adds.

## Configuration reference for custom.alerts

| Key              | Type                           | Default        | Description                                                                                                     |
| ---------------- | ------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `stages`         | list of strings                | every stage    | Stages that get alerts; see [Deploy alerts only on some stages](#deploy-alerts-only-on-some-stages).            |
| `topics`         | object                         | none           | SNS topics for alarm state changes and named topic groups.                                                      |
| `definitions`    | object                         | built-in four  | Alarm definitions by name, merged over the built-in ones.                                                       |
| `alarms`         | list of names or alarm objects | none           | Alarms created for every function.                                                                              |
| `nameTemplate`   | string                         | none           | Alarm name template for all alarms; see [Alarm names](#alarm-names).                                            |
| `prefixTemplate` | string                         | `$[stackName]` | Alarm name prefix for all alarms.                                                                               |
| `dashboards`     | boolean, string, list, object  | none           | CloudWatch dashboards; see [Create CloudWatch dashboards](#create-cloudwatch-dashboards).                       |
| `externalStack`  | boolean or object              | `false`        | Deploy alerts in a separate stack; see [Deploy alarms in a separate stack](#deploy-alarms-in-a-separate-stack). |

Functions accept `alarms` (a list of definition names or alarm objects) at `functions.<name>.alarms`.

## Alarm definition keys

An alarm definition, in `custom.alerts.definitions`, `custom.alerts.alarms` or a function's `alarms`, accepts these keys. The CloudWatch keys map to the [`AWS::CloudWatch::Alarm` resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cloudwatch-alarm.html), which lists the allowed values.

| Key                                                    | Default                    | Description                                                                          |
| ------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------ |
| `name`                                                 | none                       | Required in an alarm object; selects the definition to merge with.                   |
| `type`                                                 | `static`                   | `static` or `anomalyDetection`.                                                      |
| `enabled`                                              | `true`                     | `false` removes the alarm, for example for one function.                             |
| `namespace`                                            | none                       | Metric namespace, for example `AWS/Lambda`. Ignored with `pattern`.                  |
| `metric`                                               | none                       | Metric name, case-sensitive.                                                         |
| `threshold`                                            | none                       | Threshold, or the band width in standard deviations for `anomalyDetection`.          |
| `statistic`                                            | none                       | `SampleCount`, `Average`, `Sum`, `Minimum`, `Maximum` or a percentile such as `p95`. |
| `period`                                               | none                       | Period in seconds.                                                                   |
| `evaluationPeriods`                                    | none                       | Number of periods to evaluate.                                                       |
| `datapointsToAlarm`                                    | none                       | Number of breaching data points that trigger the alarm.                              |
| `comparisonOperator`                                   | none                       | For example `GreaterThanOrEqualToThreshold`.                                         |
| `treatMissingData`                                     | `missing`                  | `breaching`, `notBreaching`, `ignore` or `missing`.                                  |
| `evaluateLowSampleCountPercentile`                     | none                       | `evaluate` or `ignore`; percentile statistics only.                                  |
| `actionsEnabled`                                       | `true`                     | `false` keeps the alarm but sends no notifications.                                  |
| `description`                                          | none                       | Alarm description.                                                                   |
| `pattern`                                              | none                       | CloudWatch Logs filter pattern; makes it a log pattern alarm.                        |
| `dimensions`                                           | none                       | List of `Name` and `Value` pairs.                                                    |
| `omitDefaultDimension`                                 | `false`                    | `true` drops the `FunctionName` dimension.                                           |
| `okActions`, `alarmActions`, `insufficientDataActions` | none                       | Names of topic groups to notify.                                                     |
| `nameTemplate`, `prefixTemplate`                       | the `custom.alerts` values | Alarm name for this alarm.                                                           |

## Related

- [Using Amazon CloudWatch alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html) in the CloudWatch user guide
- [AWS infrastructure resources](./resources.md) for alarms on resources other than functions
- [Functions](./functions.md) for function configuration

The built-in alerts are derived from the [serverless-plugin-aws-alerts](https://github.com/ACloudGuru/serverless-plugin-aws-alerts/) plugin by A Cloud Guru.
