<!--
title: CloudWatch Logs Subscription Events
description: 'Process CloudWatch Logs log events in a Lambda function with the cloudwatchLog event: log group subscriptions, filter patterns and limits.'
short_title: CloudWatch Log
keywords:
  [
    'Serverless Framework',
    'CloudWatch Logs Lambda trigger',
    'log subscription filter',
    'filter pattern',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/cloudwatch-log)

<!-- DOCS-SITE-LINK:END -->

# CloudWatch Logs Subscription Events

The `cloudwatchLog` event sends the log events of an Amazon CloudWatch Logs log group to a Lambda function as they arrive, for example to forward logs or react to errors. The Framework creates a subscription filter on the log group and a permission for CloudWatch Logs to invoke the function. The `cloudwatchLog` event doesn't create the log group: it must exist and be in the same AWS account and Region as the service.

This `serverless.yml` sends every log event of the `/aws/lambda/orders` log group to the `processLogs` function:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  processLogs:
    handler: handler.processLogs
    events:
      - cloudwatchLog: /aws/lambda/orders
```

CloudWatch Logs delivers the log events base64-encoded and gzip-compressed in `event.awslogs.data`:

```javascript
// handler.mjs
import { gunzipSync } from 'node:zlib'

export const processLogs = async (event) => {
  const payload = JSON.parse(
    gunzipSync(Buffer.from(event.awslogs.data, 'base64')).toString('utf8'),
  )
  for (const logEvent of payload.logEvents) {
    console.log(payload.logGroup, logEvent.timestamp, logEvent.message)
  }
}
```

## cloudwatchLog event options

The `cloudwatchLog` event takes the log group name as a string, or an object with these keys:

| Key        | Type   | Default                | Description                                                         |
| ---------- | ------ | ---------------------- | ------------------------------------------------------------------- |
| `logGroup` | string | Required               | The log group name; letters, digits and `/ # - _ .`                 |
| `filter`   | string | Empty: every log event | The filter pattern that selects the log events sent to the function |

## Specifying a filter

The `cloudwatchLog` event's `filter` sends only the log events that match a CloudWatch Logs filter pattern. This example sends only JSON log events whose `level` field is `ERROR`:

```yaml
functions:
  processLogs:
    handler: handler.processLogs
    events:
      - cloudwatchLog:
          logGroup: /aws/lambda/orders
          filter: '{ $.level = "ERROR" }'
```

Quote the whole pattern in YAML, because patterns often contain `{`, `:` or `"`. A term pattern such as `'ERROR -ARGUMENTS'` matches log events that contain `ERROR` and not `ARGUMENTS`. For the pattern syntax, see [Filter pattern syntax for metric filters, subscription filters, filter log events, and Live Tail](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html).

## Subscription filter limits

A service can have at most two `cloudwatchLog` events for the same log group, across all its functions. A third stops packaging:

```text
Only 2 subscription filters can be configured per log group. You're attempting to configure more subscription filters than allowed for "/aws/lambda/orders".
```

Subscription filters that other tools or stacks create on the same log group also count toward the log group's AWS quota, and AWS rejects a subscription filter beyond it at deploy time. See [CloudWatch Logs quotas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html).

To subscribe one function to several log groups, add a `cloudwatchLog` event for each:

```yaml
functions:
  processLogs:
    handler: handler.processLogs
    events:
      - cloudwatchLog: /aws/lambda/orders
      - cloudwatchLog: /aws/lambda/payments
```

Don't subscribe a function to its own log group without a filter that excludes the function's own output: each invocation writes log events that would invoke the function again.

## Permissions for CloudWatch Logs subscriptions

For each function with `cloudwatchLog` events, the Framework adds one `lambda:InvokeFunction` permission for the `logs.<region>.amazonaws.com` principal. It's limited to the function's log group in the service's account and Region; for several log groups, to the log groups whose names start with the longest prefix their names share. The function's execution role needs no extra permissions to receive log events.

## Related

- [Subscription filters with AWS Lambda](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/SubscriptionFilters.html#LambdaFunctionExample)
- [CloudWatch settings in the serverless.yml reference](../guide/serverless.yml.md#cloudwatch)
- [Log group resources for functions](../guide/functions.md#log-group-resources)
