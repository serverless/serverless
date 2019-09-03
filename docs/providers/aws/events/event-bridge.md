<!--
title: Serverless Framework - AWS Lambda Events - Event Bridge
menuText: EventBridge Event
menuOrder: 14
description:  Setting up AWS EventBridge Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/event-bridge)

<!-- DOCS-SITE-LINK:END -->

# EventBridge Event

The [EventBridge](https://aws.amazon.com/eventbridge/) makes it possible to connect applications using data from external sources (e.g. own applications, SaaS) or AWS services. The `eventBridge` event types helps setting up AWS Lambda functions to react to events coming in via the EventBridge.

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

The Serverless Framework will create the `eventBus` for you if you just provide a name for it. It will re-use an existing event bus if you provide an event bus `arn`.

**NOTE:** The Serverless Framework won't manage (e.g. create or remove) the event bus if it's provided via an `arn`.

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
