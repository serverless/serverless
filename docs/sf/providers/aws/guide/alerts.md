<!--
title: CloudWatch Alerts & Alarms
description: Easily configuration CloudWatch alerts & alarms with the Serverless Framework.
short_title: Build Config
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'CloudWatch',
    'CloudWatch Alerts',
    'Observability',
  ]
-->

# Configuring CloudWatch Alerts

Configuring CloudWatch alerts & alarms is now built into the Serverless Framework v4. Huge thanks to ACloudGuru for their [original CloudWatch Alerts plugin](https://github.com/ACloudGuru/serverless-plugin-aws-alerts/), which is now archived/deprecated.

## Usage

### Basic Usage

```yaml
# serverless.yml

custom:
  alerts:
    stages:
      - production
    topics:
      alarm:
        topic: ${self:service}-${opt:stage}-alerts-alarm
        notifications:
          - protocol: email
            endpoint: name@domain.com # Change this to your email address
    alarms:
      - functionErrors
      - functionThrottles
```

### Advanced Usage

```yaml
service: your-service
provider:
  name: aws
  runtime: nodejs12.x

plugins:
  - serverless-plugin-aws-alerts

custom:
  alerts:
    stages: # Optionally - select which stages to deploy alarms to
      - production
      - staging

    dashboards: true

    nameTemplate: $[functionName]-$[metricName]-Alarm # Optionally - naming template for alarms, can be overwritten in definitions
    prefixTemplate: $[stackName] # Optionally - override the alarm name prefix

    topics:
      ok: ${self:service}-${opt:stage}-alerts-ok
      alarm: ${self:service}-${opt:stage}-alerts-alarm
      insufficientData: ${self:service}-${opt:stage}-alerts-insufficientData
    definitions: # these defaults are merged with your definitions
      functionErrors:
        period: 300 # override period
      customAlarm:
        actionsEnabled: false # Indicates whether actions should be executed during any changes to the alarm state. The default is TRUE
        description: 'My custom alarm'
        namespace: 'AWS/Lambda'
        nameTemplate: $[functionName]-Duration-IMPORTANT-Alarm # Optionally - naming template for the alarms, overwrites globally defined one
        prefixTemplate: $[stackName] # Optionally - override the alarm name prefix, overwrites globally defined one
        metric: duration
        threshold: 200
        statistic: Average
        period: 300
        evaluationPeriods: 1
        datapointsToAlarm: 1
        comparisonOperator: GreaterThanOrEqualToThreshold
    alarms:
      - functionThrottles
      - functionErrors
      - functionInvocations
      - functionDuration

functions:
  foo:
    handler: foo.handler
    alarms: # merged with function alarms
      - customAlarm
      - name: fooAlarm # creates new alarm or overwrites some properties of the alarm (with the same name) from definitions
        namespace: 'AWS/Lambda'
        actionsEnabled: false
        metric: errors # define custom metrics here
        threshold: 1
        statistic: Minimum
        period: 60
        evaluationPeriods: 1
        datapointsToAlarm: 1
        comparisonOperator: GreaterThanOrEqualToThreshold
```

## Anomaly Detection Alarms

You can create alarms using [CloudWatch AnomalyDetection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html) to alarm when data is outside a number of standard deviations of normal, rather than at a static threshold.
When using anomaly detection alarms the threshold property specifies the "Anomaly Detection Threshold" seen in the AWS console.

Default alarms can also be updated to be anomaly detection alarms by adding the `type: anomalyDetection` property.

```yaml
functions:
  foo:
    handler: foo.handler
    alarms:
      - name: fooAlarm
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
    handler: bar.handler
    alarms:
      - name: functionErrors
        threshold: 2
        type: anomalyDetection
        comparisonOperator: LessThanLowerOrGreaterThanUpperThreshold
      - name: functionInvocations
        threshold: 2
        type: anomalyDetection
        comparisonOperator: LessThanLowerOrGreaterThanUpperThreshold
```

## Multiple topic definitions

You can define several topics for alarms. For example you want to have topics for critical alarms
reaching your pagerduty, and different topics for noncritical alarms, which just send you emails.

In each alarm definition you have to specify which topics you want to use. In following example
you get an email for each function error, pagerduty gets alarm only if there are more than 20
errors in 60s

```yaml
custom:
  alerts:
    topics:
      critical:
        ok:
          topic: ${self:service}-${opt:stage}-critical-alerts-ok
          notifications:
            - protocol: https
              endpoint: https://events.pagerduty.com/integration/.../enqueue
        alarm:
          topic: ${self:service}-${opt:stage}-critical-alerts-alarm
          notifications:
            - protocol: https
              endpoint: https://events.pagerduty.com/integration/.../enqueue

      nonCritical:
        alarm:
          topic: ${self:service}-${opt:stage}-nonCritical-alerts-alarm
          notifications:
            - protocol: email
              endpoint: alarms@email.com

    definitions: # these defaults are merged with your definitions
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

## SNS Topics

If topic name is specified, plugin assumes that topic does not exist and will create it. To use existing topics, specify ARNs or use CloudFormation (e.g. Fn::ImportValue, Fn::Join and Ref) to refer to existing topics.

#### ARN support

```yaml
custom:
  alerts:
    topics:
      alarm:
        topic: arn:aws:sns:${self:region}:${self::accountId}:monitoring-${opt:stage}
```

#### CloudFormation support

```yaml
custom:
  alerts:
    topics:
      alarm:
        topic:
          Fn::ImportValue: ServiceMonitoring:monitoring-${opt:stage, 'dev'}
      ok:
        topic:
          Fn::Join:
            - ':'
            - - arn:aws:sns
              - Ref: AWS::Region
              - Ref: AWS::AccountId
              - example-ok-topic
      insufficientData:
        topic:
          Ref: ExampleInsufficientdataTopic

resources:
  Resources:
    ExampleInsufficientdataTopic:
      Type: AWS::SNS::Topic
      Properties:
        DisplayName: example-insufficientdata-topic
        Subscription:
          - Endpoint: me@example.com
            Protocol: EMAIL
```

## SNS Notifications

You can configure subscriptions to your SNS topics within your `serverless.yml`. For each subscription, you'll need to specify a `protocol` and an `endpoint`.

The following example will send email notifications to `me@example.com` for all messages to the Alarm topic:

```yaml
custom:
  alerts:
    topics:
      alarm:
        topic: ${self:service}-${opt:stage}-alerts-alarm
        notifications:
          - protocol: email
            endpoint: me@example.com
```

You can configure notifications to send to webhook URLs, to SMS devices, to other Lambda functions, and more. Check out the AWS docs [here](http://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html) for configuration options.

## Metric Log Filters

You can monitor a log group for a function for a specific pattern. Do this by adding the pattern key.
You can learn about custom patterns at: http://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html

The following would create a custom metric log filter based alarm named `barExceptions`. Any function that included this alarm would have its logs scanned for the pattern `exception Bar` and if found would trigger an alarm.

```yaml
custom:
  alerts:
    definitions:
      barExceptions:
        metric: barExceptions
        threshold: 0
        statistic: Minimum
        period: 60
        evaluationPeriods: 1
        comparisonOperator: GreaterThanThreshold
        pattern: 'exception Bar'
      bunyanErrors:
        metric: bunyanErrors
        threshold: 0
        statistic: Sum
        period: 60
        evaluationPeriods: 1
        datapointsToAlarm: 1
        comparisonOperator: GreaterThanThreshold
        pattern: '{$.level > 40}'
```

> Note: For custom log metrics, namespace property will automatically be set to stack name (e.g. `fooservice-dev`).

## Custom Naming

You can define custom naming template for the alarms. `nameTemplate` property under `alerts` configures naming template for all the alarms, while placing `nameTemplate` under alarm definition configures (overwrites) it for that specific alarm only. Naming template provides interpolation capabilities, where supported placeholders are:

- `$[functionName]` - function name (e.g. `helloWorld`)
- `$[functionId]` - function logical id (e.g. `HelloWorldLambdaFunction`)
- `$[metricName]` - metric name (e.g. `Duration`)
- `$[metricId]` - metric id (e.g. `BunyanErrorsHelloWorldLambdaFunction` for the log based alarms, `$[metricName]` otherwise)

> Note: All the alarm names are prefixed with stack name (e.g. `fooservice-dev`).

## Default Definitions

The plugin provides some default definitions that you can simply drop into your application. For example:

```yaml
alerts:
  alarms:
    - functionErrors
    - functionThrottles
    - functionInvocations
    - functionDuration
```

If these definitions do not quite suit i.e. the threshold is too high, you can override a setting without
creating a completely new definition.

```yaml
alerts:
  definitions: # these defaults are merged with your definitions
    functionErrors:
      period: 300 # override period
      treatMissingData: notBreaching # override treatMissingData
```

The default definitions are below.

```yaml
definitions:
  functionInvocations:
    namespace: 'AWS/Lambda'
    metric: Invocations
    threshold: 100
    statistic: Sum
    period: 60
    evaluationPeriods: 1
    datapointsToAlarm: 1
    comparisonOperator: GreaterThanOrEqualToThreshold
    treatMissingData: missing
  functionErrors:
    namespace: 'AWS/Lambda'
    metric: Errors
    threshold: 1
    statistic: Sum
    period: 60
    evaluationPeriods: 1
    datapointsToAlarm: 1
    comparisonOperator: GreaterThanOrEqualToThreshold
    treatMissingData: missing
  functionDuration:
    namespace: 'AWS/Lambda'
    metric: Duration
    threshold: 500
    statistic: Average
    period: 60
    evaluationPeriods: 1
    comparisonOperator: GreaterThanOrEqualToThreshold
    treatMissingData: missing
  functionThrottles:
    namespace: 'AWS/Lambda'
    metric: Throttles
    threshold: 1
    statistic: Sum
    period: 60
    evaluationPeriods: 1
    datapointsToAlarm: 1
    comparisonOperator: GreaterThanOrEqualToThreshold
    treatMissingData: missing
```

## Disabling default alarms for specific functions

Default alarms can be disabled on a per-function basis:

```yaml
custom:
  alerts:
    alarms:
      - functionThrottles
      - functionErrors
      - functionInvocations
      - functionDuration

functions:
  bar:
    handler: bar.handler
    alarms:
      - name: functionInvocations
        enabled: false
```

## Additional dimensions

The plugin allows users to provide custom dimensions for the alarm. Dimensions are provided in a list of key/value pairs {Name: foo, Value:bar}
The plugin will always apply dimension of {Name: FunctionName, Value: ((FunctionName))}, except if the parameter `omitDefaultDimension: true` is passed. For example:

```yaml
alarms: # merged with function alarms
  - name: fooAlarm
    namespace: 'AWS/Lambda'
    metric: errors # define custom metrics here
    threshold: 1
    statistic: Minimum
    period: 60
    evaluationPeriods: 1
    comparisonOperator: GreaterThanThreshold
    omitDefaultDimension: true
    dimensions:
      - Name: foo
        Value: bar
```

```json
'Dimensions': [
                {
                    'Name': 'foo',
                    'Value': 'bar'
                },
            ]
```

## Using Percentile Statistic for a Metric

Statistic not only supports SampleCount, Average, Sum, Minimum or Maximum as defined in CloudFormation [here](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cw-alarm.html#cfn-cloudwatch-alarms-statistic), but also percentiles. This is possible by leveraging [ExtendedStatistic](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cw-alarm.html#cfn-cloudwatch-alarms-extendedstatistic) under the hood. This plugin will automatically choose the correct key for you. See an example below:

```yaml
definitions:
  functionDuration:
    namespace: 'AWS/Lambda'
    metric: Duration
    threshold: 100
    statistic: 'p95'
    period: 60
    evaluationPeriods: 1
    datapointsToAlarm: 1
    comparisonOperator: GreaterThanThreshold
    treatMissingData: missing
    evaluateLowSampleCountPercentile: ignore
```

## Using a Separate CloudFormation Stack

If your Serverless CloudFormation stack is growing too large and you're running out of resources,
you can configure the plugin to deploy a separate stack for the CloudWatch resources. The default
behaviour is to create a stack with a "-alerts" suffix in the stack name.

    custom:
      alerts:
        externalStack: true

You can customize the name suffix:

    custom:
      alerts:
        externalStack:
          nameSuffix: Alerts

The separate stack will be automatically deployed after you've deployed your main Serverless
stack. It will also be automatically removed if you remove your main stack.

You can also enable the external stack on the command line with `sls deploy --alerts-external-stack`
which is equivalent to adding `externalStack: true` to the configuration.

## Dashboards

The plugin can create dashboards automatically for basic metrics.

Default setup for a single dashboard:

```yaml
dashboards: true
```

Create a vertical dashboard:

```yaml
dashboards: vertical
```

Create dashboards only in specified stages:

```yaml
dashboards:
  stages:
    - production
    - staging
  templates:
    - default
```
