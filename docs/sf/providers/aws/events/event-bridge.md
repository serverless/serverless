<!--
title: EventBridge Events
short_title: EventBridge
description: 'Trigger a Lambda function from Amazon EventBridge with the eventBridge event: rules, schedules and Custom Event Bus subscribers.'
keywords: ['Serverless Framework', 'AWS Lambda EventBridge trigger', 'EventBridge Custom Event Bus']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/event-bridge)

<!-- DOCS-SITE-LINK:END -->

# EventBridge Events

The `eventBridge` event invokes a Lambda function for events on an [Amazon EventBridge](https://aws.amazon.com/eventbridge/) event bus. On the default bus or a Custom Event Bus - Classic, the Framework creates an EventBridge rule that matches events with a pattern or runs on a schedule. On a Custom Event Bus, it creates a subscriber; see [Custom Event Bus](#custom-event-bus).

This `serverless.yml` invokes `myFunction` when an EC2 instance enters the `pending` state:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  myFunction:
    handler: handler.main
    events:
      - eventBridge:
          pattern:
            source:
              - aws.ec2
            detail-type:
              - EC2 Instance State-change Notification
            detail:
              state:
                - pending
```

The handler receives one event per call:

```javascript
// handler.mjs
export const main = async (event) => {
  console.log(event.source, event['detail-type'], event.detail)
}
```

An `eventBridge` event on a Classic bus needs `pattern` or `schedule`.

## Event patterns

The `eventBridge` event's `pattern` is the rule's event pattern. Its top-level keys are the fields of the event envelope: `version`, `id`, `detail-type`, `source`, `account`, `time`, `region`, `resources`, `detail` and `$or`. This pattern uses [prefix matching](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns-content-based-filtering.html#eb-filtering-prefix-matching) to match S3 objects created under `uploads/` in the `photos` bucket, which needs [EventBridge notifications enabled](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-event-notifications-eventbridge.html):

```yaml
functions:
  myFunction:
    handler: handler.main
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

For the pattern syntax, see [Amazon EventBridge event patterns](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html).

## Scheduled rules

The `eventBridge` event's `schedule` takes a `rate(...)` or `cron(...)` expression and runs the function on that schedule:

```yaml
functions:
  myFunction:
    handler: handler.main
    events:
      - eventBridge:
          schedule: rate(10 minutes)
```

Scheduled rules run on the default event bus only, so don't combine `schedule` with `eventBus`. The [`schedule` event](./schedule.md) creates the same scheduled rules and can also use EventBridge Scheduler, with time zones and higher quotas.

## Using a different Event Bus

Without `eventBus`, or with `eventBus: default`, the rule is created on the default event bus, which receives AWS service events. The `eventBridge` event's `eventBus` selects another bus:

- A name, such as `custom-saas-events`: the Framework creates a Custom Event Bus - Classic (`AWS::Events::EventBus`) with that name and the rule on it.
- A literal ARN of an existing Classic or partner bus, such as `arn:aws:events:us-east-1:123456789012:event-bus/custom-private-events`: the Framework creates the rule on that bus.
- `Ref` to an `AWS::Events::EventBus` resource, `Fn::GetAtt` of its `Name`, or `Fn::ImportValue` of a bus name: the Framework creates the rule on that bus. Reference a Classic bus by name, because the Framework builds the ARN in the Lambda permission from the bus name.
- A Custom Event Bus ARN or reference: the Framework creates a subscriber; see [How the Framework recognizes a Custom Event Bus](#how-the-framework-recognizes-a-custom-event-bus).

This event creates a bus named `custom-saas-events` and a rule on it:

```yaml
functions:
  myFunction:
    handler: handler.main
    events:
      - eventBridge:
          eventBus: custom-saas-events
          pattern:
            source:
              - saas.external
```

To attach a rule to a Classic bus declared in the service's `resources`, set `eventBus: !GetAtt EventBusResource.Name`.

## Event input

By default, the function receives the matched event. The `eventBridge` event takes one of three keys to change it:

- `input`: an object, passed to the function as JSON instead of the event.
- `inputPath`: a JSONPath into the event, up to 256 characters; the function receives that part of it.
- `inputTransformer`: `inputPathsMap` maps names to JSONPaths in the event, and `inputTemplate` (required, up to 8,192 characters) builds the input from them.

Setting more than one stops packaging. With `inputPath: '$.detail'`, the function receives only the event's `detail`. These events use `input` and `inputTransformer`:

```yaml
functions:
  myFunction:
    handler: handler.main
    events:
      - eventBridge:
          pattern:
            source:
              - aws.ec2
          input:
            key1: value1
      - eventBridge:
          pattern:
            source:
              - aws.ec2
          inputTransformer:
            inputPathsMap:
              eventTime: '$.time'
            inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
```

See [Amazon EventBridge input transformation](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html).

## Rule name, description and state

The Framework names each rule `<deployed function name>-rule-<index>`, where the index is the event's position in the function's `events` list, counting from 1. A name longer than 64 characters is shortened and suffixed with a hash. The `eventBridge` event's `name` sets the rule name instead, `description` sets its description, and `enabled: false` creates the rule disabled:

```yaml
functions:
  myFunction:
    handler: handler.main
    events:
      - eventBridge:
          name: event-bridge-custom-name
          description: Runs the nightly report
          enabled: false
          schedule: rate(10 minutes)
```

- `name`: up to 64 letters, digits, `.`, `-` and `_`, unique per bus. Include the stage in a fixed name to deploy several stages to one Region.
- `description`: up to 512 characters.
- `enabled`: default `true`.

## Retry policy and dead-letter queue

The `eventBridge` event's `retryPolicy` limits how long and how often EventBridge retries a failed delivery to the function, and `deadLetterQueueArn` sets an SQS queue for the events it can't deliver:

- `retryPolicy.maximumEventAge`: integer, 60 to 86,400 seconds.
- `retryPolicy.maximumRetryAttempts`: integer, 0 to 185.
- Without `retryPolicy`, EventBridge retries a rule's failed delivery for up to 24 hours and up to 185 times. A Custom Event Bus subscriber has shorter defaults; see [Settings on a Custom Event Bus](#settings-on-a-custom-event-bus).

The Framework doesn't add a queue policy to the dead-letter queue. Add one that allows `events.amazonaws.com` to call `sqs:SendMessage`, limited to the rule's ARN:

```yaml
functions:
  myFunction:
    handler: handler.main
    events:
      - eventBridge:
          eventBus: custom-saas-events
          pattern:
            source:
              - saas.external
          retryPolicy:
            maximumEventAge: 3600
            maximumRetryAttempts: 3
          deadLetterQueueArn: !GetAtt RuleDlq.Arn

resources:
  Resources:
    RuleDlq:
      Type: AWS::SQS::Queue
    RuleDlqPolicy:
      Type: AWS::SQS::QueuePolicy
      Properties:
        Queues:
          - !Ref RuleDlq
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Principal:
                Service: events.amazonaws.com
              Action: sqs:SendMessage
              Resource: !GetAtt RuleDlq.Arn
              Condition:
                ArnLike:
                  aws:SourceArn: !Sub arn:${AWS::Partition}:events:${AWS::Region}:${AWS::AccountId}:rule/custom-saas-events/*
```

On the default bus, the rule ARN has no bus segment (`rule/<rule name>`). See [Retry policies](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html) and [Using dead-letter queues](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html).

## Permissions for EventBridge rules

For each rule, the Framework adds an `AWS::Lambda::Permission` that lets `events.amazonaws.com` invoke the function, limited to the rule's ARN. `provider.eventBridge.useCloudFormation` is deprecated with either value; remove it from `serverless.yml`.

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

AWS recommends the Custom Event Bus for new applications ([Amazon EventBridge event bus (default and Classic)](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html)). Custom Event Bus - Classic stays available, and both run side by side. Classic, or the default bus, still fits these cases:

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

| `eventBus` value                                                                    | Example                                                                                     | Creates    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| Literal ARN containing `:event-busv2/`                                              | `arn:aws:events:us-east-1:111122223333:event-busv2/orders/a1b2c3d4e5f6g7h8i9j0k1l2m`        | Subscriber |
| Framework variable that resolves to such an ARN                                     | `${param:ordersBusArn}`, `${ssm:/platform/orders-bus-arn}`, `${cf:events-dev.OrdersBusArn}` | Subscriber |
| Compose output passed as a parameter                                                | `${service:events.OrdersBusArn}` through `params`                                           | Subscriber |
| `Ref` to a resource of type `AWS::EventsV2::EventBus` in this service's `resources` | `!Ref OrdersBus`                                                                            | Subscriber |
| `Fn::GetAtt` of the `EventBusArn` attribute                                         | `!GetAtt OrdersBus.EventBusArn`                                                             | Subscriber |
| Bare name, `default`, or no `eventBus`                                              | `orders`                                                                                    | Rule       |
| `Fn::ImportValue`, `Ref` to anything else, or `Fn::GetAtt` of `Name`                | `!ImportValue orders-bus-arn`, `!Ref OrdersBusArnParameter`                                 | Rule       |

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
- EventBridge creates or deletes one subscriber at a time on a bus, across all accounts, so the subscriber create and delete rates apply per bus. See [Subscribing to events on a Custom Event Bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-subscribers.html).
- By default, a bus takes up to 10,000 subscribers, across every account it is shared with. The quota is adjustable; see [Custom Event Bus quotas](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html#eb-custom-bus-quotas).

### Referencing the bus through other intrinsic functions

The Framework recognizes a Custom Event Bus from a literal ARN, from `Ref` to an `AWS::EventsV2::EventBus` in the same service, and from `Fn::GetAtt` of `EventBusArn`. Other intrinsic functions, such as `!ImportValue` or `!Ref` to a template parameter, resolve only during the deploy, so the Framework creates a Classic rule for them. When one resolves to a Custom Event Bus ARN, CloudFormation reports that the event bus doesn't exist. Use a Framework variable, which resolves to the literal ARN before packaging:

- `${cf:<stack>.<output>}` for an output of another stack ([CloudFormation stack outputs](../../../guides/variables/aws/cf-stack.md)),
- `${param:<name>}` for a parameter, including a Compose output passed through `params` ([parameters](../../../guides/parameters.md)),
- `${ssm:<path>}` for an ARN kept in Parameter Store ([SSM Parameter Store](../../../guides/variables/aws/ssm.md)).

## Examples

- [compose-eventbridge-custom-bus](https://github.com/serverless/examples/tree/v4/compose-eventbridge-custom-bus): a Compose project with a Custom Event Bus, FIFO and batching consumers, and a producer.

## Related

- [Schedule events](./schedule.md), for rate and cron schedules with EventBridge Scheduler
- [`serverless.yml` reference: EventBridge](../guide/serverless.yml.md#eventbridge)
