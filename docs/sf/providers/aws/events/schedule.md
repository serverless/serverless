<!--
title: Schedule Events
description: Run a Lambda function on a rate or cron schedule with the schedule event, through EventBridge rules or EventBridge Scheduler with time zones.
short_title: Schedule
keywords:
  [
    'Serverless Framework',
    'AWS Lambda cron',
    'AWS Lambda scheduled function',
    'EventBridge Scheduler',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/schedule)

<!-- DOCS-SITE-LINK:END -->

# Schedule Events

The `schedule` event runs a Lambda function on a schedule, written as a `rate(...)` or `cron(...)` expression. By default, the Framework creates an Amazon EventBridge scheduled rule on the default event bus; with `method: scheduler`, it creates an EventBridge Scheduler schedule instead, which adds time zones and a higher quota.

This `serverless.yml` runs `crawl` every 2 hours, and also every day at 12:00 UTC:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  crawl:
    handler: handler.crawl
    events:
      - schedule: rate(2 hours)
      - schedule: cron(0 12 * * ? *)
```

On a scheduled rule, the handler receives an EventBridge `Scheduled Event`:

```javascript
// handler.mjs
export const crawl = async (event) => {
  console.log(event['detail-type'], event.time)
}
```

A function can have several `schedule` events, and each one creates its own rule or schedule.

## Rate and cron expressions

The `schedule` event takes a rate or a cron expression:

- `rate(value unit)`: `value` is a positive integer and `unit` is `minute`, `hour` or `day` for a value of 1, and `minutes`, `hours` or `days` for larger values: `rate(1 hour)`, `rate(5 minutes)`.
- `cron(minutes hours day-of-month month day-of-week year)`: six fields, and one of day-of-month and day-of-week is `?`: `cron(0 12 * * ? *)`, `cron(0 0/4 ? * MON-FRI *)`.

Scheduled rules evaluate cron expressions in UTC. To run on a local time, use EventBridge Scheduler with a `timezone`; see [Use EventBridge Scheduler](#use-eventbridge-scheduler). For the full syntax, see [Schedule expressions for rules](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-scheduled-rule-pattern.html).

To set other options, use the object form, with the expression in `rate`. `rate` also takes a list of expressions, which creates one rule or schedule per expression with the same settings. This function runs at different times on weekdays and on weekends, with the same input:

```yaml
functions:
  report:
    handler: handler.report
    events:
      - schedule:
          rate:
            - cron(0 0/4 ? * MON-FRI *)
            - cron(0 2 ? * SAT-SUN *)
          input:
            key1: value1
            key2: value2
```

## Pass input to the function

By default, the function receives the scheduled event. The `schedule` event takes one of three keys to change it:

- `input`: an object, or a JSON string of up to 8,192 characters, passed to the function instead of the event. When the object has a `body` key whose value is a JSON string, the Framework parses that string, so the function receives `body` as an object.
- `inputPath`: a JSONPath into the scheduled event, up to 256 characters; the function receives that part of it.
- `inputTransformer`: `inputPathsMap` maps names to JSONPaths in the event, and `inputTemplate` (required, up to 8,192 characters) builds the input from them.

EventBridge accepts one of them per target, so set only one per `schedule` event. Each event in this example uses one of them:

```yaml
functions:
  aggregate:
    handler: handler.aggregate
    events:
      - schedule:
          rate: rate(10 minutes)
          input:
            key1: value1
            stageParams:
              stage: dev
      - schedule:
          rate: cron(0 12 * * ? *)
          inputPath: '$.detail'
      - schedule:
          rate: rate(2 hours)
          inputTransformer:
            inputPathsMap:
              eventTime: '$.time'
            inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
```

With `method: scheduler`, only `input` is available; `inputPath` and `inputTransformer` stop packaging.

## Name, description and state

The `schedule` event's `name` and `description` set the rule's or schedule's name and description, and `enabled: false` creates it disabled:

```yaml
functions:
  aggregate:
    handler: handler.aggregate
    events:
      - schedule:
          name: my-service-${sls:stage}-aggregate
          description: Aggregates statistics every 2 hours
          rate: rate(2 hours)
          enabled: false
```

- `name`: up to 64 letters, digits, `.`, `-` and `_`. Without it, CloudFormation generates a name. `name` can't be set when `rate` lists more than one expression. Names are unique per account and Region, so include the stage to deploy several stages to one Region.
- `description`: up to 512 characters.
- `enabled`: default `true`.

## Use EventBridge Scheduler

Set the `schedule` event's `method` to `scheduler` to create an `AWS::Scheduler::Schedule` instead of an `AWS::Events::Rule`. EventBridge Scheduler evaluates cron expressions in the time zone set in `timezone`:

```yaml
functions:
  report:
    handler: handler.report
    events:
      - schedule:
          method: scheduler
          rate: cron(0 9 ? * MON-FRI *)
          timezone: America/New_York
          input:
            key1: value1
```

- `method`: `eventBus` (the default) or `scheduler`. Changing it replaces the rule with a schedule, or the reverse, on the next deploy.
- `timezone`: an IANA time zone name, such as `America/New_York`. It is accepted only with `method: scheduler`; without it, Scheduler uses UTC.
- With `scheduler`, the `schedule` event takes `input`, `name`, `description` and `enabled`, but not `inputPath` or `inputTransformer`. The schedule goes in the account's default schedule group, with no flexible time window.

Scheduled rules count against EventBridge's default quota of 300 rules per event bus in each account and Region (100 in some Regions), and they always go on the default bus. EventBridge Scheduler has a default quota of 10,000,000 schedules per Region. See [EventBridge quotas](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html) and [EventBridge Scheduler quotas](https://docs.aws.amazon.com/scheduler/latest/UserGuide/scheduler-quotas.html).

## Permissions for schedule events

With `method: eventBus`, the Framework adds an `AWS::Lambda::Permission` that lets `events.amazonaws.com` invoke the function, limited to the rule's ARN.

With `method: scheduler`, EventBridge Scheduler invokes the function with the function's execution role. The Framework adds `scheduler.amazonaws.com` to the role's trust policy and `lambda:InvokeFunction` on the function, its versions and aliases to the role's policy. When the function uses a role of your own, set in `provider.iam.role` as an ARN or in the function's `role`, add both to that role. See [Set up the execution role](https://docs.aws.amazon.com/scheduler/latest/UserGuide/setting-up.html#setting-up-execution-role).

## `schedule` event options

The `schedule` event takes an expression string, or an object with these keys:

| Key                | Type                      | Default                       | Allowed values                                                      |
| ------------------ | ------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `rate`             | String or list of strings | Required                      | `rate(...)` or `cron(...)` expressions                              |
| `method`           | String                    | `eventBus`                    | `eventBus`, `scheduler`                                             |
| `enabled`          | Boolean                   | `true`                        | `true`, `false`                                                     |
| `name`             | String                    | Generated by CloudFormation   | Up to 64 letters, digits, `.`, `-`, `_`; one `rate` expression only |
| `description`      | String                    | Not set                       | Up to 512 characters                                                |
| `input`            | Object or JSON string     | Not set (the scheduled event) | A string of up to 8,192 characters                                  |
| `inputPath`        | String                    | Not set                       | A JSONPath of up to 256 characters; `eventBus` only                 |
| `inputTransformer` | Object                    | Not set                       | `inputTemplate` (required) and `inputPathsMap`; `eventBus` only     |
| `timezone`         | String                    | Not set (UTC)                 | An IANA time zone name; `scheduler` only                            |

## Related

- [EventBridge events](./event-bridge.md#scheduled-rules), for schedules defined with the `eventBridge` event
- [`serverless.yml` reference: Schedule](../guide/serverless.yml.md#schedule)
- [EventBridge Scheduler schedule types](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html)
