<!--
title: SQS Queue Events
description: 'Trigger a Lambda function from an Amazon SQS queue with the sqs event: batching, filter patterns, concurrency and partial batch failures.'
short_title: SQS
keywords:
  [
    'Serverless Framework',
    'AWS Lambda SQS trigger',
    'SQS event source mapping',
    'SQS batch size',
    'SQS filter patterns',
    'ReportBatchItemFailures',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/sqs)

<!-- DOCS-SITE-LINK:END -->

# SQS Queue Events

The `sqs` event triggers a Lambda function with messages from an Amazon SQS queue. The Framework creates the Lambda event source mapping: Lambda polls the queue, invokes the function with a batch of messages, and deletes the messages the function processed. The `sqs` event doesn't create the queue: reference an existing queue, or declare one in `resources` as in the following example.

This `serverless.yml` creates a queue and a `compute` function that receives its messages:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: !GetAtt MyQueue.Arn

resources:
  Resources:
    MyQueue:
      Type: AWS::SQS::Queue
      Properties:
        VisibilityTimeout: 36
```

The handler receives the messages in `event.Records`, each with its `body` as a string:

```javascript
// handler.mjs
export const compute = async (event) => {
  for (const record of event.Records) {
    console.log(record.messageId, record.body)
  }
}
```

The queue's visibility timeout must be at least the function's timeout, or Lambda rejects the event source mapping. AWS recommends six times the function timeout; the example uses 36 seconds for the default 6-second timeout. The queue and the function must be in the same AWS Region: deploy the service to the queue's Region (`provider.region` or `--region`).

## Queue ARN formats

The `sqs` event takes the queue ARN as a string, or as an object with an `arn` key. The `arn` key also accepts CloudFormation intrinsic functions:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      # A literal ARN
      - sqs: arn:aws:sqs:us-east-1:123456789012:MyFirstQueue
      # A queue declared in this service's resources
      - sqs:
          arn: !GetAtt MySecondQueue.Arn
      # An ARN exported by another CloudFormation stack
      - sqs:
          arn: !ImportValue MyExportedQueueArn
      # An ARN built from the stack's Region and account
      - sqs:
          arn: !Join
            - ':'
            - - arn:aws:sqs
              - !Ref AWS::Region
              - !Ref AWS::AccountId
              - MyOtherQueue
```

The Framework derives the event source mapping's logical ID from the queue name, so it reads the name from the ARN string or from the intrinsic function: the resource name in `Fn::GetAtt`, the export name in `Fn::ImportValue`, or the last element of `Fn::Join`. Use one of these four forms for `arn`. Use the object form for every other option on this page.

## Batch size and batching window

The `sqs` event's `batchSize` sets the largest number of messages in one invocation, and `maximumBatchingWindow` sets how many seconds Lambda gathers messages before it invokes the function:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          batchSize: 100
          maximumBatchingWindow: 5
```

- `batchSize`: integer, default `10`. A standard queue accepts `1` to `10000`. A FIFO queue accepts `1` to `10`, or `1` to `10000` in [provisioned mode](#provisioned-mode).
- `maximumBatchingWindow`: integer, `0` to `300` seconds. When it isn't set, AWS uses `0`. A FIFO queue accepts a batching window only in [provisioned mode](#provisioned-mode).
- A `batchSize` greater than `10` requires `maximumBatchingWindow` of at least `1`.

Lambda invokes the function when the batch is full, when the batching window ends, or when the batch reaches the 6 MB invocation payload limit, whichever comes first. With a batching window, add the window to the queue's visibility timeout as well: AWS recommends six times the function timeout plus `maximumBatchingWindow`. See [Configuring an Amazon SQS event source mapping](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html#events-sqs-eventsource).

## Partial batch failures

By default, when the function returns an error, every message in the batch returns to the queue and Lambda retries the whole batch after the visibility timeout. To return only the failed messages, set the `sqs` event's `functionResponseType` to `ReportBatchItemFailures`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          functionResponseType: ReportBatchItemFailures
```

The handler then returns the `messageId` of each failed message in `batchItemFailures`. Lambda deletes the other messages from the queue:

```javascript
// handler.mjs
export const compute = async (event) => {
  const batchItemFailures = []
  for (const record of event.Records) {
    try {
      await processMessage(JSON.parse(record.body))
    } catch (error) {
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }
  return { batchItemFailures }
}

const processMessage = async (message) => {
  console.log(message)
}
```

`ReportBatchItemFailures` is the only allowed value. When the handler throws, Lambda treats the whole batch as failed. With a FIFO queue, stop at the first failure and return that message and every unprocessed message, so the queue keeps their order. See [Handling errors for an SQS event source in Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html#services-sqs-batchfailurereporting).

## Filter patterns

The `sqs` event's `filterPatterns` lists event filter patterns. Lambda invokes the function only with messages that match at least one pattern, and deletes every other message from the queue without invoking the function. SQS event source mappings filter on the `body` key only, so each pattern starts with `body`:

```yaml
functions:
  orders:
    handler: handler.orders
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          filterPatterns:
            - body:
                RequestCode: [BBBB]
            - body:
                RecordNumber: [{ numeric: ['>', 9999] }]
```

This mapping invokes `orders` with messages whose JSON body has `RequestCode` equal to `BBBB` or `RecordNumber` greater than 9999.

- `filterPatterns`: a list of 1 to 10 pattern objects. AWS accepts 5 filters per event source mapping by default; the quota can be raised to 10.
- A pattern with fields under `body` matches only messages whose body is valid JSON. To match a plain-text body, filter on the string itself, for example `body: [{ prefix: 'ORDER' }]`.
- The Framework sets filter criteria only when `filterPatterns` is present.

For the pattern syntax, see [Using event filtering with an Amazon SQS event source](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs-filtering.html) and [Control which events Lambda sends to your function](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html).

## Maximum concurrency

The `sqs` event's `maximumConcurrency` limits how many concurrent invocations one queue's event source mapping can start, so one queue can't use all of the function's or the account's concurrency:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          maximumConcurrency: 250
```

- `maximumConcurrency`: integer, `2` to `1000`. When it isn't set, the mapping has no limit of its own.
- Each `sqs` event has its own limit. If the function also has reserved concurrency, keep the reserved concurrency at least as high as the sum of the `maximumConcurrency` values of its `sqs` events, or Lambda throttles messages.
- `maximumConcurrency` and `provisionedPollers` can't be set together; see [Provisioned mode](#provisioned-mode).

See [Configuring maximum concurrency for Amazon SQS event sources](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html#events-sqs-max-concurrency).

## Provisioned mode

[Provisioned mode](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html) gives the event source mapping a dedicated pool of event pollers with minimum and maximum bounds, for faster scaling and higher throughput than the default polling. Configure it with the `sqs` event's `provisionedPollers`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          provisionedPollers:
            min: 2
            max: 500
```

- `provisionedPollers.min`: integer, `2` to `200`. When it isn't set, AWS uses `2`.
- `provisionedPollers.max`: integer, `2` to `10000`. When it isn't set, AWS uses `200`.
- `provisionedPollers` needs at least one of `min` and `max`, and `min` can't be greater than `max`.
- Each event poller drives up to 10 concurrent invocations, so `max` controls concurrency in provisioned mode. `provisionedPollers` and `maximumConcurrency` can't be set together.

For a FIFO queue, provisioned mode also raises the largest `batchSize` from `10` to `10000` and allows a `maximumBatchingWindow`. A `batchSize` above `10` needs a `maximumBatchingWindow` of at least `1`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue.fifo
          batchSize: 1000
          maximumBatchingWindow: 10
          provisionedPollers:
            min: 2
```

Provisioned mode incurs AWS charges per event poller, and the `min` pollers are charged while they run, whether or not messages arrive. See [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/).

Setting both `provisionedPollers` and `maximumConcurrency`, or a `min` above `max`, stops packaging whatever `configValidationMode` is set to. A `min` or `max` outside the ranges is a schema violation, so it follows `configValidationMode`: under the default `warn` it is reported as a warning and deployed as written, for AWS to reject; `error` stops packaging; `off` deploys it without a message.

### Turn off provisioned mode

Removing `provisionedPollers` from `serverless.yml` leaves provisioned mode active on the deployed event source mapping, with its pollers and their cost. A `rollback` to an older deployment leaves it active too. To turn it off, deploy once with `provisionedPollers: false`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          provisionedPollers: false
```

`provisionedPollers: false` clears provisioned mode on an existing mapping. AWS rejects it on a mapping that is created in the same deploy, so for a new mapping leave the key out.

A FIFO queue accepts a `batchSize` above `10` and a batching window only in provisioned mode. On a FIFO queue, set `batchSize` to `10` or less and `maximumBatchingWindow` to `0` in the same deploy as `provisionedPollers: false`; otherwise AWS rejects the update with `Batching window for FIFO queues is only supported with Provisioned mode event source mappings` and the stack rolls back.

### Switch from provisioned mode to maximum concurrency

To move a mapping from provisioned mode to `maximumConcurrency`, deploy once with both `provisionedPollers: false` and the new `maximumConcurrency`. On a FIFO queue, reset `batchSize` and `maximumBatchingWindow` in the same deploy, as in [Turn off provisioned mode](#turn-off-provisioned-mode). After that deploy, the `provisionedPollers: false` line can be removed:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          maximumConcurrency: 250
          provisionedPollers: false
```

## Turn off an SQS trigger

To keep the event source mapping but stop Lambda from polling the queue, set the `sqs` event's `enabled` to `false`. Messages stay in the queue until the mapping is enabled again or they expire:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          enabled: false
```

## `sqs` event options

The object form of the `sqs` event accepts these keys, and any of them can be combined on one event (for example `filterPatterns` with `functionResponseType`):

| Key                     | Type                                    | Default                | Allowed values                                                                                      |
| ----------------------- | --------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `arn`                   | ARN string or intrinsic                 | Required               | The queue ARN, or `Fn::GetAtt`, `Fn::ImportValue` or `Fn::Join` that resolves to it                 |
| `batchSize`             | Integer                                 | `10`                   | `1` to `10000` for a standard queue, `1` to `10` for a FIFO queue                                   |
| `maximumBatchingWindow` | Integer (seconds)                       | Not set (AWS uses `0`) | `0` to `300`; at least `1` when `batchSize` is greater than `10`                                    |
| `functionResponseType`  | String                                  | Not set                | `ReportBatchItemFailures`                                                                           |
| `filterPatterns`        | List of objects                         | Not set                | 1 to 10 patterns, each starting with `body`                                                         |
| `maximumConcurrency`    | Integer                                 | Not set                | `2` to `1000`; not with `provisionedPollers`                                                        |
| `provisionedPollers`    | Object with `min` and `max`, or `false` | Not set                | `min` `2` to `200`, `max` `2` to `10000`; `false` turns off provisioned mode on an existing mapping |
| `enabled`               | Boolean                                 | `true`                 | `true`, `false`                                                                                     |

## IAM permissions for SQS events

The Framework adds `sqs:ReceiveMessage`, `sqs:DeleteMessage` and `sqs:GetQueueAttributes` on each queue's ARN to the execution role it generates (the service's shared role, or each function's role with `provider.iam.role.mode: perFunction`). When the function uses a role of your own, set in `provider.iam.role` as an ARN, in `provider.role` or in the function's `role`, add these actions to that role. For a queue encrypted with an AWS KMS key (SSE-KMS), add `kms:Decrypt` on that key:

```yaml
provider:
  iam:
    role:
      statements:
        - Effect: Allow
          Action: kms:Decrypt
          Resource: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
```

A queue in another AWS account also needs a queue policy that allows the function's execution role these actions. See [Setting up Lambda execution role permissions](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html#events-sqs-permissions) and [IAM permissions](../guide/iam.md).

## Create the queue in serverless.yml

To create the queue in the same service, declare an `AWS::SQS::Queue` in `resources` and reference it with `!GetAtt <LogicalId>.Arn`, as in the example at the top of the page. The queue's properties, such as a dead-letter queue (`RedrivePolicy`) or FIFO (`FifoQueue: true`), are set on the resource. See [AWS::SQS::Queue](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-sqs-queue.html).

The [Lift](https://github.com/getlift/lift) plugin's [`queue` construct](https://github.com/getlift/lift/blob/master/docs/queue.md) deploys a queue, a worker function and a dead-letter queue from a few lines of configuration. Install it with:

```bash
serverless plugin install -n serverless-lift
```

Then declare the construct:

```yaml
constructs:
  my-queue:
    type: queue
    worker:
      handler: handler.compute

plugins:
  - serverless-lift
```

The construct's batch size, retries and other options are described in the [`queue` construct documentation](https://github.com/getlift/lift/blob/master/docs/queue.md).

## Related

- [SNS events](./sns.md), to fan out messages to several queues or functions
- [`serverless.yml` reference: SQS](../guide/serverless.yml.md#sqs)
- [Using Lambda with Amazon SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)
