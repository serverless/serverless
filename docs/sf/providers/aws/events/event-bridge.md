<!--
title: Serverless Framework - AWS Lambda Events - Event Bridge
short_title: AWS Lambda Events - EventBridge
description: Setting up AWS EventBridge Events with AWS Lambda via the Serverless Framework
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'EventBridge',
    'event-driven architecture',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/event-bridge)

<!-- DOCS-SITE-LINK:END -->

# EventBridge Event

The [EventBridge](https://aws.amazon.com/eventbridge/) makes it possible to connect applications using data from external sources (e.g. own applications, SaaS) or AWS services. The `eventBridge` event types helps setting up AWS Lambda functions to react to events coming in via the EventBridge.

EventBridge offers two kinds of custom event bus: the Custom Event Bus - Classic, which routes events with rules, and the Custom Event Bus, which routes events to subscribers. The sections up to [Custom Event Bus](#custom-event-bus) describe rules on the default bus and on Custom Event Bus - Classic buses. When `eventBus` is a Custom Event Bus, the same `eventBridge` event creates a subscriber instead; see [Custom Event Bus](#custom-event-bus).

_Note_: Prior to `2.27.0` version of the Framework, `eventBridge` resources were provisioned with Custom Resources. With `2.27.0` an optional support for native CloudFormation was introduced and can be turned on by setting `provider.eventBridge.useCloudFormation: true`. It is recommended to migrate to native CloudFormation as it's by default with v3. It also adds the ability to define `eventBus` with CF intrinsic functions as values.

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

## Setting a custom name and description

**Note:** `eventBridge` events by default are named with the lambda function's name with a suffix for the rule position. Set the `name` property within `eventBridge` to change this functionality.

A description can also be specified. These are not required properties.

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          name: event-bridge-custom-name
          description: a description of my eventBridge event's purpose
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

Here is an example that uses "[prefix matching](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns-content-based-filtering.html#eb-filtering-prefix-matching)" to filter EventBridge events produced by S3 (the bucket must have the [EventBridge notification enabled](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-event-notifications-eventbridge.html)):

```yml
functions:
  myFunction:
    handler: index.handler
    events:
      - eventBridge:
          pattern:
            source:
              - aws.s3
            detail-type:
              - Object Created
            detail:
              bucket:
                name:
                  - photos
              object:
                key:
                  - prefix: 'uploads/'
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

_Note_: A Custom Event Bus - Classic is referenced by name with CF intrinsic functions, because the Framework builds the `SourceArn` of the `AWS::Lambda::Permission` resource from the bus name. `!GetAtt <resource>.EventBusArn` references a Custom Event Bus; see [Custom Event Bus](#custom-event-bus).

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

## Custom Event Bus

The [Custom Event Bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html) routes events to subscribers and keeps every event for a retention period of 1 to 365 days. Consumers attach their own subscribers to a bus that another stack, or another account, owns. Each subscriber filters the events and delivers the matching ones to one target.

When the `eventBus` of an `eventBridge` event is a Custom Event Bus, the Framework creates an `AWS::EventsV2::Subscriber` that delivers to the function, instead of an `AWS::Events::Rule`. The subscriber uses the Custom Event Bus defaults, and each default can be switched back to Classic behaviour per event.

```yml
functions:
  fulfil:
    handler: handler.fulfil
    events:
      - eventBridge:
          eventBus: arn:aws:events:us-east-1:111122223333:event-busv2/orders/a1b2c3d4e5f6g7h8i9j0k1l2m
          pattern:
            detail-type:
              - OrderPlaced
```

### Choosing a bus

AWS recommends the Custom Event Bus for new applications: "For new applications, start with the Custom Event Bus" ([Amazon EventBridge event bus (default and Classic)](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html)). Custom Event Bus - Classic stays available, and both run side by side. Classic, or the default bus, still fits these cases:

| Case                                    | Why Classic or the default bus fits                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS service events (S3, EC2 and others) | They arrive on the default bus, which is Classic. A Custom Event Bus receives them only through an event source.                                                                                                                                                                                                                      |
| SaaS partner events                     | They arrive on a partner event bus, and a Custom Event Bus receives them only through an event source.                                                                                                                                                                                                                                |
| Larger events                           | Classic bills per event, in 64 KB chunks. The Custom Event Bus bills per GB of ingress and of egress to each subscriber, so the cost grows with event size and subscriber count. See [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/).                                                                              |
| Regions                                 | The Custom Event Bus launched in a subset of Regions ([launch announcement](https://aws.amazon.com/about-aws/whats-new/2026/09/eventbridge-relaunches-custom-event-buses/)); [AWS Capabilities by Region](https://builder.aws.com/build/capabilities) lists where it is available now. A subscriber is in the same Region as its bus. |
| Many buses in one account and Region    | The default quota is 5 Custom Event Buses per account and Region, against 100 Classic buses. See [Custom Event Bus quotas](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html).                                                                                                                                   |

Schedules are rules on the default bus, or EventBridge Scheduler schedules, whichever bus the application uses.

### Placing the bus in a stateful service

A Custom Event Bus is a shared, long-lived resource: it holds retained events, and every consumer's subscriber is attached to it. The bus quota also points to one bus per environment, such as `dev` and `prod`, rather than one for every personal or preview stage. Declare the bus in a stateful service that rarely changes and that you deploy once per environment, output its ARN, and pass the ARN to the consuming services with [Serverless Compose](../../../guides/compose.md). The bus name below includes the stage, so each environment gets its own bus:

```yml
# events/serverless.yml
service: events

provider:
  name: aws

resources:
  Resources:
    OrdersBus:
      Type: AWS::EventsV2::EventBus
      Properties:
        Name: orders-${sls:stage}
        StorageConfiguration:
          RetentionPeriodInDays: 7
  Outputs:
    OrdersBusArn:
      Value: !GetAtt OrdersBus.EventBusArn
```

```yml
# serverless-compose.yml
services:
  events:
    path: events
  orders:
    path: orders
    params:
      ordersBusArn: ${service:events.OrdersBusArn}
```

```yml
# orders/serverless.yml
service: orders

provider:
  name: aws

functions:
  fulfil:
    handler: handler.fulfil
    timeout: 30
    events:
      - eventBridge:
          eventBus: ${param:ordersBusArn}
          pattern:
            detail-type:
              - OrderPlaced
```

Deploying the `events` service to every personal or preview stage would create a bus for each of them. To have those stages subscribe to an environment's bus instead, deploy only the consuming services there and read the bus ARN through a pinned resolver; see [Referencing a service deployed to a different stage](../../../guides/compose.md#referencing-a-service-deployed-to-a-different-stage). The Framework does not create or delete a Custom Event Bus for an `eventBridge` event. If the consuming service declares the bus in its `resources`, `serverless remove` deletes the bus with the stack, including its retained events. When a separate service owns the bus, `serverless remove` deletes the consuming service's subscribers and delivery role and leaves the bus in place. CloudFormation deletes a bus only after all of its subscribers and event sources, including those from other stacks or accounts, are deleted or revoked.

The [compose-eventbridge-custom-bus](https://github.com/serverless/examples/tree/v4/compose-eventbridge-custom-bus) example is a complete Compose project with this layout: a bus service, a FIFO consumer and a batching consumer, and a producer that publishes to the bus.

### How the Framework recognizes a Custom Event Bus

A Custom Event Bus is referenced by its ARN, which contains `:event-busv2/` and ends in a generated ID. The Framework decides from the `eventBus` value at packaging time:

| `eventBus` value                                                                    | Example                                                                                     | Creates                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| Literal ARN containing `:event-busv2/`                                              | `arn:aws:events:us-east-1:111122223333:event-busv2/orders/a1b2c3d4e5f6g7h8i9j0k1l2m`        | Subscriber               |
| Framework variable that resolves to such an ARN                                     | `${param:ordersBusArn}`, `${ssm:/platform/orders-bus-arn}`, `${cf:events-dev.OrdersBusArn}` | Subscriber               |
| Compose output passed as a parameter                                                | `${service:events.OrdersBusArn}` through `params`                                           | Subscriber               |
| `Ref` to a resource of type `AWS::EventsV2::EventBus` in this service's `resources` | `!Ref OrdersBus`                                                                            | Subscriber               |
| `Fn::GetAtt` of the `EventBusArn` attribute                                         | `!GetAtt OrdersBus.EventBusArn`                                                             | Subscriber               |
| Bare name, `default`, or no `eventBus`                                              | `orders`                                                                                    | Rule, as described above |
| `Fn::ImportValue`, `Ref` to anything else, or `Fn::GetAtt` of `Name`                | `!ImportValue orders-bus-arn`, `!Ref OrdersBusArnParameter`                                 | Rule, as described above |

Framework variables resolve before packaging, so the Framework sees the literal ARN. CloudFormation intrinsic functions resolve during the deploy, so the Framework recognizes only the two forms in the table; see [Referencing the bus through other intrinsic functions](#referencing-the-bus-through-other-intrinsic-functions).

When `eventBus` is a literal ARN, its Region must match the service's Region. A subscriber is created in its bus's Region, and the Framework reports a different Region as a packaging error.

### Settings on a Custom Event Bus

These keys work as on a Classic bus:

- `pattern` becomes the subscriber's `DATA` filter, in the same pattern syntax except the `wildcard` operator, which subscriber filters don't accept ([Filtering events for a subscriber](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-filtering.html)). Events published with `PutEvents` keep the Classic envelope, so a Classic pattern without `wildcard` works unchanged. On a Custom Event Bus, `pattern` may match any top-level key of the payload, and it may contain CloudFormation intrinsic functions that resolve to strings. The resolved string is placed in the filter as it is, so it can't contain a double quote (`"`) or a backslash; the Framework escapes only the literal text of a `Fn::Sub` template that is itself a pattern value. Without `pattern`, the subscriber receives every event on the bus.
- `retryPolicy` and `deadLetterQueueArn` set the subscriber's retry policy and dead-letter queue, with the same keys and ranges as on a Classic target. Without `retryPolicy`, EventBridge retries a failed delivery for up to 300 seconds and 5 attempts ([Retry policies and dead-letter queues](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-retry.html)).
- `description` sets the subscriber description.
- `enabled: false` stops the subscriber. Events keep accumulating on the bus while it is stopped, and `resumePosition` decides what it delivers when `enabled` is set back to `true`.
- `name` sets the subscriber name: up to 256 characters (a Classic rule name takes up to 64) of letters, digits, `.`, `-` and `_`, starting with a letter or digit. The logical ID derived from it adds `EventBridgeSubscriber`, and CloudFormation caps logical IDs at 255 characters, so a name with more than 234 letters and digits is a packaging error. See [Subscriber names and replacement](#subscriber-names-and-replacement).

`schedule`, `input`, `inputPath` and `inputTransformer` are configured on Classic rules only, and the Framework reports them as a packaging error on a Custom Event Bus. Reshape the event in the handler instead, and use a [`schedule` event](./schedule.md) for a scheduled invocation. A Custom Event Bus subscriber is deployed with native CloudFormation, so `provider.eventBridge.useCloudFormation: false` is a packaging error for a service with a Custom Event Bus event.

These keys are configured on a Custom Event Bus only, and the Framework reports them as a packaging error on a Classic bus:

| Key                     | Values                     | Default                               | What it sets                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batchSize`             | 1 to 100                   | Not set: 10 for a function target     | The largest number of events in one invocation. The function receives an array of events, even for one event; with `batchSize: 1` it receives one event object.                                                                                    |
| `maximumBatchingWindow` | 0 to 300 (seconds)         | Not set: 0 seconds                    | How long EventBridge waits to fill a batch before it invokes the function.                                                                                                                                                                         |
| `async`                 | `true`, `false`            | `false`                               | `false` invokes the function synchronously and treats a function error as a failed delivery. `true` invokes it asynchronously, as a Classic rule does.                                                                                             |
| `ordering`              | `unordered`, `fifo`        | `unordered`                           | `fifo` delivers events in publish order within each event group, which the producer sets as `SystemMetadata.EventGroupId` when it publishes. See [Ordering](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-ordering.html). |
| `resumePosition`        | `last_processed`, `latest` | Not set: `last_processed`             | What the subscriber delivers when `enabled` changes from `false` back to `true`: `last_processed` delivers the backlog the bus still retains, oldest first; `latest` skips it.                                                                     |
| `role`                  | IAM role ARN or intrinsic  | The service's generated delivery role | The role EventBridge assumes to invoke the function; see [The delivery role](#the-delivery-role).                                                                                                                                                  |

Enum values are case-insensitive. A synchronous subscriber waits at most 30 seconds for the function, so:

- the Framework sets the subscriber's invocation timeout to the function's timeout, up to 30 seconds;
- `ordering: fifo` with `async: true` is a packaging error, because a FIFO subscriber keeps order only while it waits for the function;
- `ordering: fifo` with a function timeout above 30 seconds is a packaging error;
- an unordered synchronous subscriber whose function timeout is above 30 seconds gets a packaging warning, because EventBridge retries after 30 seconds while the first invocation can still be running. Set the function timeout to 30 seconds or less, or set `async: true`.

```yml
functions:
  fulfil:
    handler: handler.fulfil
    timeout: 30
    events:
      - eventBridge:
          eventBus: ${param:ordersBusArn}
          ordering: fifo
          batchSize: 10
          maximumBatchingWindow: 5
          retryPolicy:
            maximumEventAge: 3600
            maximumRetryAttempts: 20
          deadLetterQueueArn: !GetAtt FulfilDlq.Arn
          pattern:
            detail-type:
              - OrderPlaced
```

With `ordering: fifo`, use an SQS FIFO queue as the dead-letter queue ([Retry policies and dead-letter queues](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-retry.html)).

With the default batching, the handler receives an array:

```js
export const fulfil = async (events) => {
  for (const event of events) {
    console.log(event['detail-type'], event.detail)
  }
}
```

### Restoring Classic behaviour

Each default can be switched back per event, so a consumer can move from a Classic bus by changing `eventBus` and adding the settings its handler relies on:

| Behaviour                             | Custom Event Bus default                                                                                                                                | Classic behaviour                                                                                                                     | Setting                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| What the handler receives             | An array of events, even for one event                                                                                                                  | One event object                                                                                                                      | `batchSize: 1`                                                              |
| How the function is invoked           | Synchronously, with a 30-second ceiling; the subscriber retries function errors, then sends the event to the dead-letter queue, or drops it without one | Asynchronously; function errors go to Lambda's [asynchronous retries and destinations](../guide/functions.md#asynchronous-invocation) | `async: true`                                                               |
| How long a failed delivery is retried | 300 seconds, 5 attempts                                                                                                                                 | 24 hours, 185 attempts                                                                                                                | `retryPolicy` with `maximumEventAge: 86400` and `maximumRetryAttempts: 185` |
| What re-enabling delivers             | The backlog of events published while the subscriber was stopped                                                                                        | Only events published after the rule is enabled again                                                                                 | `resumePosition: latest`                                                    |
| Ordering                              | Unordered                                                                                                                                               | Unordered                                                                                                                             | None: `unordered` is the default, and `fifo` is Custom Event Bus only       |

With `maximumEventAge: 86400` and `maximumRetryAttempts: 185`, a subscriber retries a failed delivery for up to 24 hours, as a Classic target does, and the interval between attempts grows. This holds for function errors and for a delivery role that can't invoke the function. See [Migrating from Custom Event Bus - Classic](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-migrate.html).

```yml
functions:
  fulfil:
    handler: handler.fulfil
    events:
      - eventBridge:
          eventBus: ${param:ordersBusArn}
          batchSize: 1
          async: true
          resumePosition: latest
          retryPolicy:
            maximumEventAge: 86400
            maximumRetryAttempts: 185
          pattern:
            detail-type:
              - OrderPlaced
```

### Subscriber names and replacement

By default the Framework names a subscriber `<function name>-<index>-<hash>`, for example `orders-dev-fulfil-1-3f9a1c0e`, where the function name is the deployed one (`<service>-<stage>-<function>` unless set) and the hash covers the settings a subscriber can't change in place: the bus as written in `eventBus`, the target function or alias, and `ordering`. A change to any of them creates a subscriber under a new name and logical ID, and CloudFormation creates the new subscriber before it deletes the old one. Writing the same bus differently, for example `!GetAtt OrdersBus.EventBusArn` instead of `!Ref OrdersBus`, also creates a new subscriber. Events published during the swap can reach the function twice, so write handlers that tolerate a repeated event.

The index is the event's position in the function's `events` list, counting from 1 and including events of other types. Moving an `eventBridge` event to another position, or inserting or removing an event before it, changes the index, so the next deploy creates the subscriber under a new name and deletes the old one, as for any other name change. Set `name` to keep a subscriber's name independent of its position.

A `name` you set is used exactly, and the subscriber's logical ID is derived from it. Changing the bus, the target or `ordering` while keeping the name replaces the subscriber in place: CloudFormation deletes the old subscriber before it creates the new one, and events published in between don't reach the function. Change the `name` to one that maps to a different logical ID (not only in punctuation or the case of its first letter) in the same deploy to have the new subscriber created first. Two subscriber names in one service that differ only in punctuation, or in the case of their first letter, map to the same logical ID, and the Framework reports them as a packaging error (`EVENTBRIDGE_SUBSCRIBER_DUPLICATE_LOGICAL_ID`).

### The delivery role

A subscriber invokes the function through an IAM role, not through a Lambda permission. The Framework creates one delivery role per service, `IamRoleEventBridgeDelivery`, named `<service>-<stage>-<region>-eventBridge`, for every subscriber that sets no `role`. It is separate from the functions' execution roles and is created in every IAM mode, including per-function roles and a custom `provider.iam.role` ARN. When every Custom Event Bus event sets `role`, the Framework creates no delivery role. IAM caps role names at 64 characters. When the generated name is longer, the Framework reports a packaging error (`EVENTBRIDGE_DELIVERY_ROLE_NAME_TOO_LONG`); set `role` on each Custom Event Bus event, or shorten the service or stage name.

The role trusts `events.amazonaws.com` for the subscribers of the deploying account and Region:

```json
{
  "Effect": "Allow",
  "Principal": { "Service": ["events.amazonaws.com"] },
  "Action": ["sts:AssumeRole"],
  "Condition": {
    "StringEquals": { "aws:SourceAccount": "111122223333" },
    "ArnLike": {
      "aws:SourceArn": "arn:aws:events:us-east-1:111122223333:subscriber/*"
    }
  }
}
```

Its policy grants `lambda:InvokeFunction` on each subscribed function's exact ARN and on its versions and aliases (`<function ARN>:*`), and `sqs:SendMessage` on each configured dead-letter queue. The role uses `provider.iam.role.path` and the permissions boundary from `provider.iam.role.permissionsBoundary` or `provider.rolePermissionsBoundary`. `provider.iam.role.tags` applies to the execution role and is not applied to the delivery role.

The trust policy admits any subscriber in the account, because a subscriber's ARN doesn't name its bus. What limits which subscribers can use the role is who may pass it: grant `iam:PassRole` on the delivery role only to the identity that deploys the service, and only for EventBridge, with the [`iam:PassedToService`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html#ck_PassedToService) condition (with `provider.iam.role.path` set, the role ARN includes the path):

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::111122223333:role/orders-dev-us-east-1-eventBridge",
  "Condition": {
    "StringEquals": { "iam:PassedToService": "events.amazonaws.com" }
  }
}
```

EventBridge checks a delivery role's permissions when it delivers, not when CloudFormation creates the subscriber ([Subscribing to events on a Custom Event Bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-subscribers.html)). When you set `role`, or a permissions boundary that applies to the generated role, publish a test event after the first deploy and confirm that the function received it: a role without `lambda:InvokeFunction` on the function deploys, and its deliveries are retried and then dead-lettered, or dropped without a dead-letter queue.

IAM limits a role's inline policies to [10,240 characters](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html) in total. The generated policy lists each subscribed function and dead-letter queue by exact ARN, so a service with many subscribed functions can exceed the limit, and CloudFormation then reports the error from IAM. Set `role` to a role you manage on some or all Custom Event Bus events to keep the generated policy under the limit.

The generated delivery role needs the IAM actions that CloudFormation uses to manage a role, among them `iam:CreateRole`, `iam:GetRole`, `iam:PutRolePolicy`, `iam:DeleteRolePolicy` and `iam:DeleteRole`, for the identity CloudFormation deploys with. This matters most for services that create no other IAM role, for example ones that set `provider.iam.role` to an existing role ARN. Without `iam:CreateRole`, the deploy rolls back with a message that leads with tagging permissions. Its first sentence reads:

```text
Resource handler returned message: "Encountered a permissions error performing a tagging operation, please add required tag permissions.
```

The message goes on to name `iam:CreateRole` as the action the identity isn't authorized to perform, and includes `HandlerErrorCode: UnauthorizedTaggingOperation`.

Grant `iam:CreateRole` to that identity, or set `role` on every Custom Event Bus event to a delivery role created outside the service:

```yml
functions:
  fulfil:
    handler: handler.fulfil
    events:
      - eventBridge:
          eventBus: ${param:ordersBusArn}
          role: arn:aws:iam::111122223333:role/orders-delivery
          pattern:
            detail-type:
              - OrderPlaced
```

A role set in `role` belongs to the deploying account, trusts `events.amazonaws.com`, and grants `lambda:InvokeFunction` on the function (including its alias or version) and `sqs:SendMessage` on the dead-letter queue.

### Deploy permissions

The identity CloudFormation deploys with holds `events:CreateSubscriber`, `events:UpdateSubscriber`, `events:DeleteSubscriber`, `events:DescribeSubscriber`, `events:ListSubscribers`, `events:ListTagsForResource`, `events:TagResource` and `events:UntagResource`, and `iam:PassRole` on the delivery role, whether the bus is in the same account or another one. With the generated delivery role, it also holds the IAM actions listed in [The delivery role](#the-delivery-role).

### Subscribing to a bus in another account

A subscriber can be attached to a bus that another account owns. The subscriber and the delivery role live in the consuming service's stack, and the configuration is the same as for a bus in the same account. Before the first deploy:

- The bus owner shares the bus with the consuming account through AWS RAM, with the `AWSRAMEventBridgeEventBusV2SubscribeOnly` or `AWSRAMEventBridgeEventBusV2FullAccess` managed permission. An account outside the owner's organization, or any account when the owner hasn't enabled sharing with AWS Organizations in AWS RAM, accepts the resource share invitation first. See [Sharing a Custom Event Bus with other accounts](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-sharing.html).
- The consuming service deploys to the bus's Region.
- The identity that deploys the consuming service holds the actions in [Deploy permissions](#deploy-permissions), as for a bus in the same account. Both the share and the identity policy must allow an action.

Without the share, CloudFormation reports the subscriber's creation as a bare `Access denied.` with no further detail. Check the share and the invitation first. When the owner withdraws a share, subscribers created while it was active keep delivering, creating or updating a subscriber is answered with `Access denied.`, and `serverless remove` still deletes the consuming stack. The owner can also revoke a subscriber, which stops it permanently; the consumer can then only delete it.

### Limits

- A subscriber's filter can change 24 times in any rolling 24 hours, and the limit can't be raised. Each deploy that changes a `pattern` counts once; a deploy that keeps the same `pattern` doesn't. A team that iterates on filters can work in a personal stage, or publish the varying value in the event and filter on it once. See [Updating, pausing, and resuming a subscriber](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-update.html).
- A synchronous subscriber waits at most 30 seconds for the function, as described in [Settings on a Custom Event Bus](#settings-on-a-custom-event-bus).
- EventBridge creates or deletes one subscriber at a time on a bus, across all accounts, so the subscriber create and delete rates apply per bus. See [Subscribing to events on a Custom Event Bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-subscribers.html).
- By default, a bus takes up to 10,000 subscribers, across every account it is shared with. The quota is adjustable; see [Custom Event Bus quotas](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html#eb-custom-bus-quotas).

### Referencing the bus through other intrinsic functions

The Framework recognizes a Custom Event Bus from a literal ARN, from `Ref` to an `AWS::EventsV2::EventBus` in the same service, and from `Fn::GetAtt` of `EventBusArn`. Other intrinsic functions, such as `!ImportValue` or `!Ref` to a template parameter, resolve only during the deploy, so the Framework creates a Classic rule for them. When one resolves to a Custom Event Bus ARN, CloudFormation reports that the event bus doesn't exist. Use a Framework variable, which resolves to the literal ARN before packaging:

- `${cf:<stack>.<output>}` for an output of another stack ([CloudFormation stack outputs](../../../guides/variables/aws/cf-stack.md)),
- `${param:<name>}` for a parameter, including a Compose output passed through `params` ([parameters](../../../guides/parameters.md)),
- `${ssm:<path>}` for an ARN kept in Parameter Store ([SSM Parameter Store](../../../guides/variables/aws/ssm.md)).

## Examples

- [compose-eventbridge-custom-bus](https://github.com/serverless/examples/tree/v4/compose-eventbridge-custom-bus): a Compose project with a Custom Event Bus in a stateful service, a FIFO consumer, a batching consumer with a dead-letter queue, and a producer.
