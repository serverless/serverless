<!--
title: DynamoDB and Kinesis Stream Events
description: 'Trigger a Lambda function from DynamoDB Streams or Kinesis Data Streams with the stream event: batching, retries, filters and enhanced fan-out.'
short_title: DynamoDB and Kinesis Streams
keywords:
  [
    'Serverless Framework',
    'AWS Lambda DynamoDB Streams trigger',
    'AWS Lambda Kinesis trigger',
    'stream event source mapping',
    'Kinesis enhanced fan-out',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/streams)

<!-- DOCS-SITE-LINK:END -->

# DynamoDB and Kinesis Stream Events

The `stream` event triggers a Lambda function with records from an Amazon DynamoDB stream or an Amazon Kinesis data stream. The Framework creates the Lambda event source mapping: Lambda reads each shard in order and invokes the function with batches of records. The `stream` event doesn't create the stream: reference an existing one, or declare it in `resources` as in the following example.

This `serverless.yml` creates a DynamoDB table with a stream, and a `compute` function that receives every change to the table:

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
      - stream:
          type: dynamodb
          arn: !GetAtt MyTable.StreamArn

resources:
  Resources:
    MyTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        StreamSpecification:
          StreamViewType: NEW_AND_OLD_IMAGES
```

The handler receives the changes in `event.Records`:

```javascript
// handler.mjs
export const compute = async (event) => {
  for (const record of event.Records) {
    console.log(
      record.eventName,
      record.dynamodb.Keys,
      record.dynamodb.NewImage,
    )
  }
}
```

A DynamoDB table needs `StreamSpecification` to have a stream. The stream and the function must be in the same AWS Region.

## Stream ARN formats

The `stream` event takes the stream ARN as a string, or as an object with an `arn` key. With a literal ARN, the Framework reads the stream type, `dynamodb` or `kinesis`, from the ARN. With a CloudFormation intrinsic function, set `type` too:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      # Literal ARNs
      - stream: arn:aws:dynamodb:us-east-1:123456789012:table/foo/stream/1970-01-01T00:00:00.000
      - stream: arn:aws:kinesis:us-east-1:123456789012:stream/foo
      # A table or stream declared in this service's resources
      - stream:
          type: dynamodb
          arn: !GetAtt MyDynamoDbTable.StreamArn
      - stream:
          type: kinesis
          arn: !GetAtt MyKinesisStream.Arn
      # An ARN exported by another CloudFormation stack
      - stream:
          type: kinesis
          arn: !ImportValue MyExportedKinesisStreamArn
      # A template parameter that holds the ARN
      - stream:
          type: dynamodb
          arn: !Ref MyDynamoDbTableStreamArn
      # An ARN built from the stack's Region and account
      - stream:
          type: kinesis
          arn: !Join
            - ':'
            - - arn:aws:kinesis
              - !Ref AWS::Region
              - !Ref AWS::AccountId
              - stream/MyOtherKinesisStream
```

The Framework derives the event source mapping's logical ID from the stream name, which it reads from the ARN string or from the intrinsic function: the resource name in `Fn::GetAtt`, the export name in `Fn::ImportValue`, the parameter in `Ref`, or the last element of `Fn::Join`. Use one of these forms for `arn`.

## Batch size, batching window and starting position

The `stream` event's `batchSize` sets the largest number of records in one invocation, `batchWindow` sets how many seconds Lambda gathers records before it invokes the function, and `startingPosition` sets where Lambda starts reading a new event source mapping:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          batchSize: 100
          batchWindow: 10
          startingPosition: LATEST
```

- `batchSize`: integer, `1` to `10000`. The Framework sets `10` when it is omitted; AWS's own default is `100`.
- `batchWindow`: integer, `0` to `300` seconds. When it isn't set, AWS uses `0`.
- `startingPosition`: `TRIM_HORIZON` (the default, the oldest available record), `LATEST` (only new records) or `AT_TIMESTAMP` (Kinesis only; see [Kinesis enhanced fan-out consumers](#kinesis-enhanced-fan-out-consumers)). DynamoDB streams accept `TRIM_HORIZON` and `LATEST`.

Lambda invokes the function when the batch is full, when the batching window ends, or when the batch reaches the 6 MB invocation payload limit, whichever comes first.

## Retries and failed records

By default, when the function returns an error, Lambda retries the whole batch until it succeeds or the records expire from the stream, and the shard waits meanwhile. These keys of the `stream` event limit the retries and keep the failed records:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          maximumRetryAttempts: 10
          maximumRecordAgeInSeconds: 3600
          bisectBatchOnFunctionError: true
          destinations:
            onFailure: arn:aws:sqs:us-east-1:123456789012:failed-records
```

- `maximumRetryAttempts`: integer, `-1` to `10000`. When it isn't set, AWS uses `-1`, which retries until the record expires.
- `maximumRecordAgeInSeconds`: `-1`, or an integer from `60` to `604800`. When it isn't set, AWS uses `-1`, which doesn't discard records by age.
- `bisectBatchOnFunctionError`: boolean. `true` splits a failing batch in two and retries each half, to isolate the failing record.
- `destinations.onFailure`: an SQS queue or SNS topic that receives a record describing each batch Lambda discards. The Framework doesn't create the queue or topic.

The Framework sets each of these keys only when it is present. `destinations.onFailure` takes an ARN string, or an object with `arn` and `type` (`sqs` or `sns`). With a CloudFormation intrinsic function as `arn`, `type` is required:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          maximumRetryAttempts: 10
          destinations:
            onFailure:
              arn: !GetAtt FailedRecordsQueue.Arn
              type: sqs
```

See [Retaining discarded batches for a Kinesis event source](https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html) and [Error handling for DynamoDB event sources](https://docs.aws.amazon.com/lambda/latest/dg/services-dynamodb-errors.html).

## Partial batch failures

To retry only from the first failed record instead of the whole batch, set the `stream` event's `functionResponseType` to `ReportBatchItemFailures`:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:dynamodb:us-east-1:123456789012:table/foo/stream/1970-01-01T00:00:00.000
          functionResponseType: ReportBatchItemFailures
```

The handler returns the sequence number of the first record it couldn't process in `batchItemFailures`. Lambda checkpoints the records before it and retries from that record:

```javascript
// handler.mjs
export const preprocess = async (event) => {
  for (const record of event.Records) {
    try {
      await processRecord(record)
    } catch (error) {
      const sequenceNumber =
        record.dynamodb?.SequenceNumber ?? record.kinesis?.sequenceNumber
      return { batchItemFailures: [{ itemIdentifier: sequenceNumber }] }
    }
  }
  return { batchItemFailures: [] }
}

const processRecord = async (record) => {
  console.log(record.eventID)
}
```

`ReportBatchItemFailures` is the only allowed value. See [Configuring partial batch response with Kinesis](https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-batchfailurereporting.html) and [with DynamoDB](https://docs.aws.amazon.com/lambda/latest/dg/services-ddb-batchfailurereporting.html).

## Parallelization factor

The `stream` event's `parallelizationFactor` sets how many batches from each shard Lambda processes at the same time, from `1` (the default) to `10`. Records with the same partition key stay in order:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          parallelizationFactor: 10
```

## Filter patterns

The `stream` event's `filterPatterns` lists event filter patterns. Lambda invokes the function only with records that match at least one pattern; it skips the other records, and the stream keeps them until they expire. This mapping receives only inserted items:

```yaml
functions:
  handleInsertedItem:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:dynamodb:us-east-1:123456789012:table/foo/stream/1970-01-01T00:00:00.000
          filterPatterns:
            - eventName: [INSERT]
```

- `filterPatterns`: a list of 1 to 10 pattern objects. AWS accepts 5 filters per event source mapping by default; the quota can be raised to 10.
- A DynamoDB pattern matches the record's fields, such as `eventName` or `dynamodb.NewImage`. A Kinesis pattern matches the record's metadata, such as `partitionKey`, or the payload under `data` when the payload is JSON.

See [Using event filtering with a DynamoDB event source](https://docs.aws.amazon.com/lambda/latest/dg/with-ddb-filtering.html) and [with a Kinesis event source](https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis-filtering.html).

## Tumbling windows

The `stream` event's `tumblingWindowInSeconds` groups records into windows of `0` to `900` seconds and passes a `state` object from one invocation to the next within a window, so the function can aggregate values:

```yaml
functions:
  aggregate:
    handler: handler.aggregate
    events:
      - stream:
          arn: arn:aws:dynamodb:us-east-1:123456789012:table/foo/stream/1970-01-01T00:00:00.000
          tumblingWindowInSeconds: 30
```

With a tumbling window, the event carries these fields in addition to `Records`:

- `window`: the start and end timestamps of the window.
- `state`: the object the previous invocation in the window returned, empty at the start of a window, up to 1 MB.
- `isFinalInvokeForWindow`: `true` for the last invocation of the window.
- `isWindowTerminatedEarly`: `true` when the window ended early because `state` passed 1 MB.

The handler returns `{ state }` to pass the state on. See [Using tumbling windows](https://docs.aws.amazon.com/lambda/latest/dg/services-kinesis-windows.html).

## Kinesis enhanced fan-out consumers

The `stream` event's `consumer` reads a Kinesis stream through an [enhanced fan-out](https://docs.aws.amazon.com/streams/latest/dev/enhanced-consumers.html) stream consumer, which gives the function its own read throughput per shard. `consumer: true` creates a consumer:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          consumer: true
```

The Framework names the consumer `<function key><stream name>Consumer`. With `provider.kinesis.consumerNamingMode: serviceSpecific`, the name adds the service and stage, `<function key><stream name><service><stage>Consumer`, so several services or stages can read the same stream. Changing the naming mode replaces the consumer.

To use a consumer that already exists, set `consumer` to its ARN. A consumer's ARN contains its creation timestamp, so a consumer deleted and created again with the same name has a different ARN:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          consumer: arn:aws:kinesis:us-east-1:123456789012:stream/foo/consumer/foobar:1558544531
```

To start reading from a point in time, set `startingPosition: AT_TIMESTAMP` and `startingPositionTimestamp` in Unix time seconds. The Framework applies `startingPositionTimestamp` to Kinesis events that set `consumer`, and stops packaging when such an event sets `AT_TIMESTAMP` without a timestamp:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          consumer: true
          startingPosition: AT_TIMESTAMP
          startingPositionTimestamp: 1000000001
```

## Turn off a stream trigger

To keep the event source mapping but stop Lambda from reading the stream, set the `stream` event's `enabled` to `false`:

```yaml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          enabled: false
```

## `stream` event options

The object form of the `stream` event accepts these keys:

| Key                          | Type                            | Default                    | Allowed values                                                                              |
| ---------------------------- | ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `arn`                        | ARN string or intrinsic         | Required                   | The stream ARN, or `Fn::GetAtt`, `Fn::ImportValue`, `Ref` or `Fn::Join` that resolves to it |
| `type`                       | String                          | Read from a literal ARN    | `dynamodb`, `kinesis`; required with an intrinsic `arn`                                     |
| `batchSize`                  | Integer                         | `10`                       | `1` to `10000`                                                                              |
| `batchWindow`                | Integer (seconds)               | Not set (AWS uses `0`)     | `0` to `300`                                                                                |
| `startingPosition`           | String                          | `TRIM_HORIZON`             | `TRIM_HORIZON`, `LATEST`, `AT_TIMESTAMP` (Kinesis only)                                     |
| `startingPositionTimestamp`  | Number (Unix seconds)           | Not set                    | Applied to Kinesis events with `consumer` and `AT_TIMESTAMP`                                |
| `enabled`                    | Boolean                         | `true`                     | `true`, `false`                                                                             |
| `parallelizationFactor`      | Integer                         | Not set (AWS uses `1`)     | `1` to `10`                                                                                 |
| `maximumRetryAttempts`       | Integer                         | Not set (AWS uses `-1`)    | `-1` to `10000`                                                                             |
| `maximumRecordAgeInSeconds`  | Integer                         | Not set (AWS uses `-1`)    | `-1`, or `60` to `604800`                                                                   |
| `bisectBatchOnFunctionError` | Boolean                         | Not set (AWS uses `false`) | `true`, `false`                                                                             |
| `destinations.onFailure`     | ARN string, or `arn` and `type` | Not set                    | An SQS queue or SNS topic ARN; `type` is `sqs` or `sns`                                     |
| `functionResponseType`       | String                          | Not set                    | `ReportBatchItemFailures`                                                                   |
| `filterPatterns`             | List of objects                 | Not set                    | 1 to 10 patterns                                                                            |
| `tumblingWindowInSeconds`    | Integer (seconds)               | Not set                    | `0` to `900`                                                                                |
| `consumer`                   | `true` or ARN                   | Not set                    | `true` creates a consumer; an ARN uses an existing one (Kinesis only)                       |

## IAM permissions for stream events

The Framework adds these permissions on each stream to the execution role it generates (the service's shared role, or each function's role with `provider.iam.role.mode: perFunction`). When the function uses a role of your own, set in `provider.iam.role` as an ARN, in `provider.role` or in the function's `role`, add them to that role:

- DynamoDB stream: `dynamodb:GetRecords`, `dynamodb:GetShardIterator`, `dynamodb:DescribeStream` and `dynamodb:ListStreams`.
- Kinesis stream: `kinesis:GetRecords`, `kinesis:GetShardIterator`, `kinesis:DescribeStream` and `kinesis:ListStreams`.
- Kinesis stream with `consumer`: `kinesis:GetRecords`, `kinesis:GetShardIterator`, `kinesis:DescribeStreamSummary` and `kinesis:ListShards` on the stream, and `kinesis:SubscribeToShard` on the consumer.
- `destinations.onFailure`: `sqs:ListQueues` and `sqs:SendMessage` on a queue, or `sns:Publish` on a topic.

For a stream encrypted with a customer managed AWS KMS key, add `kms:Decrypt` on that key to `provider.iam.role.statements`. See [IAM permissions](../guide/iam.md).

## Related

- [SQS queue events](./sqs.md), for queue-based processing without shard ordering
- [`serverless.yml` reference: Streams](../guide/serverless.yml.md#streams)
- [Using Lambda with Kinesis Data Streams](https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html)
- [Using Lambda with DynamoDB](https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html)
