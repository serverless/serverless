<!--
title: Serverless Framework - AWS Lambda Events - Event Bridge
menuText: EventBridge Event
menuOrder: 15
description:  Setting up AWS EventBridge Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/event-bridge)

<!-- DOCS-SITE-LINK:END -->

# EventBridge Event

The [EventBridge](https://aws.amazon.com/eventbridge/) makes it possible to connect applications using data from external sources (e.g. own applications, SaaS) or AWS services. The `eventBridge` event types helps setting up AWS Lambda functions to react to events coming in via the EventBridge.

_Note_: Prior to `2.27.0` version of the Framework, `eventBridge` resources were provisioned with Custom Resources. With `2.27.0` an optional support for native CloudFormation was introduced and can be turned on by setting `provider.eventBridge.useCloudFormation: true`. It is recommended to migrate to native CloudFormation as it will become a default with v3. It also adds the ability to define `eventBus` with CF intrinsic functions as values.

## Setting up a scheduled event

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          schedule: rate(10 minutes)
          input:
            key1: value1
```

## Enabling / Disabling

**Note:** `eventBridge` events are enabled by default. Use `enabled: false` to disable the rule.

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          enabled: false
          schedule: rate(10 minutes)
          input:
            key1: value1
```

## Setting up event pattern matching

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          pattern:
            source:
              - aws.cloudformation
            detail-type:
              - AWS API Call via CloudTrail
            detail:
              eventSource:
                - cloudformation.amazonaws.com
```

## Using a different Event Bus

The `eventBridge` event source will use the `default` event bus (the one AWS uses internally) when none is explicitly specified.

The Serverless Framework will create the `eventBus` for your if you provide a name for it. Otherwise, if literal `arn` or reference to an existing event bus name via CF intrinsic function is provided, Framework will attach to it.

### Creating an event bus

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          eventBus: custom-saas-events
          pattern:
            source:
              - saas.external
```

### Re-using an existing event bus

If you want to reuse an existing event bus, you can define it with literal `arn` or with a reference to an existing event bus name via CF intrinsic functions. Referencing via intrinsic functions is available only if you use native CloudFormation support with `provider.eventBridge.useCloudFormation: true` setting:

```yml
provider:
  eventBridge:
    useCloudFormation: true
```

Using literal `arn`:

```yml
- eventBridge:
    eventBus: arn:aws:events:us-east-1:12345:event-bus/custom-private-events
    pattern:
      source:
        - custom.private
    inputTransformer:
      inputPathsMap:
        eventTime: '$.time'
      inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
```

Using reference to event bus' name via `GetAtt` CF intrinsic function:

```yml
- eventBridge:
    eventBus: !GetAtt EventBusResource.Name
    pattern:
      source:
        - custom.private
    inputTransformer:
      inputPathsMap:
        eventTime: '$.time'
      inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
```

_Note_: It is not possible to reference event bus ARN with CF intrinsic function as it makes it impossible for Serverless Framework to construct valid `SourceArn` for `AWS::Lambda::Permission` resource.

Using reference to event bus' name via `Ref` CF intrinsic functions:

```yml
- eventBridge:
    eventBus: !Ref EventBusResource
    pattern:
      source:
        - custom.private
    inputTransformer:
      inputPathsMap:
        eventTime: '$.time'
      inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
```

## Using different input types

You can specify different input types which will produce different input values ​​for the Lambda function.

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          pattern:
            source:
              - 'aws.ec2'
            detail-type:
              - 'EC2 Instance State-change Notification'
            detail:
              state:
                - pending
          input:
            key1: value1
            key2: value2
            stageParams:
              stage: dev
      - eventBridge:
          pattern:
            source:
              - 'aws.ec2'
            detail-type:
              - 'EC2 Instance State-change Notification'
            detail:
              state:
                - pending
          inputPath: '$.stageVariables'
      - eventBridge:
          pattern:
            source:
              - 'aws.ec2'
            detail-type:
              - 'EC2 Instance State-change Notification'
            detail:
              state:
                - pending
          inputTransformer:
            inputPathsMap:
              eventTime: '$.time'
            inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
```

## Adding a DLQ to an event rule

DeadLetterQueueArn is not available for custom resources, only for native CloudFormation.

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          eventBus: custom-saas-events
          pattern:
            source:
              - saas.external
          deadLetterQueueArn:
            Fn::GetAtt:
              - QueueName
              - Arn
```

## Adding a retry policy to an event rule

RetryPolicy is not available for custom resources, only for native CloudFormation.

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          eventBus: custom-saas-events
          pattern:
            source:
              - saas.external
          deadLetterQueueArn:
            Fn::GetAtt:
              - QueueName
              - Arn
          retryPolicy:
            maximumEventAge: 3600
            maximumRetryAttempts: 3
```
