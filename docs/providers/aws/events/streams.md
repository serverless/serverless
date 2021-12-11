<!--
title: Serverless Framework - AWS Lambda Events - Kinesis & DynamoDB Streams
menuText: Kinesis & DynamoDB
menuOrder: 4
description:  Setting up AWS Kinesis Streams and AWS DynamoDB Streams Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/streams)

<!-- DOCS-SITE-LINK:END -->

# DynamoDB / Kinesis Streams

This setup specifies that the `compute` function should be triggered whenever:

1. the corresponding [DynamoDB](https://serverless.com/dynamodb/) table is modified (e.g. a new entry is added).
2. the Lambda checkpoint has not reached the end of the Kinesis stream (e.g. a new record is added).

The ARN for the stream can be specified as a string, the reference to the ARN of a resource by logical ID, or the import of an ARN that was exported by a different service or CloudFormation stack.

**Note:** The `stream` event will hook up your existing streams to a Lambda function. Serverless won't create a new stream for you.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - stream: arn:aws:dynamodb:region:XXXXXX:table/foo/stream/1970-01-01T00:00:00.000
      - stream:
          type: dynamodb
          arn:
            Fn::GetAtt: [MyDynamoDbTable, StreamArn]
      - stream:
          type: dynamodb
          arn:
            Fn::ImportValue: MyExportedDynamoDbStreamArnId
      - stream:
          type: kinesis
          arn:
            Fn::GetAtt:
              - MyKinesisStream
              - Arn
      - stream:
          type: kinesis
          arn:
            Fn::ImportValue: MyExportedKinesisStreamArnId
      - stream:
          type: dynamodb
          arn:
            Ref: MyDynamoDbTableStreamArn
      - stream:
          type: kinesis
          arn:
            Fn::Join:
              - ':'
              - - arn
                - aws
                - kinesis
                - Ref: AWS::Region
                - Ref: AWS::AccountId
                - stream/MyOtherKinesisStream
      - stream:
          type: kinesis
          arn: arn:aws:kinesis:region:XXXXXX:stream/foobar
          consumer: true
      - stream:
          type: kinesis
          arn: arn:aws:kinesis:region:XXXXXX:stream/foobar
          consumer: preExistingName
```

## Setting the BatchSize and StartingPosition

This configuration sets up a disabled Kinesis stream event for the `preprocess` function which has a batch size of `100`. The starting position is
`LATEST`.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchSize: 100
          startingPosition: LATEST
          maximumRetryAttempts: 10
          enabled: false
```

## Setting the BatchWindow

The configuration below sets up a Kinesis stream event for the `preprocess` function which has a batch window of `10`.

The `batchWindow` property specifies a maximum amount of time to wait before triggering a Lambda invocation with a batch of records. Your Lambda function will be invoked when one of the following three things happens:

1. The total payload size reaches 6MB;

2. The `batchWindow` reaches its maximum value; or

3. the `batchSize` reaches it maximum value.

For more information, read the [AWS release announcement](https://aws.amazon.com/about-aws/whats-new/2019/09/aws-lambda-now-supports-custom-batch-window-for-kinesis-and-dynamodb-event-sources/) for this property.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchWindow: 10
```

## Setting BisectBatchOnFunctionError

This configuration provides the ability to recursively split a failed batch and retry on a smaller subset of records, eventually isolating the metadata causing the error.

**Note:** Serverless only sets this property if you explicitly add it to the stream configuration (see example below).

[Related AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-eventsourcemapping.html#cfn-lambda-eventsourcemapping-bisectbatchonfunctionerror)

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          bisectBatchOnFunctionError: true
```

## Setting the MaximumRetryAttempts

This configuration sets up the maximum number of times to retry when the function returns an error.

**Note:** Serverless only sets this property if you explicitly add it to the stream configuration (see example below).

[Related AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-eventsourcemapping.html#cfn-lambda-eventsourcemapping-maximumretryattempts)

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchSize: 100
          maximumRetryAttempts: 10
          startingPosition: LATEST
          enabled: false
```

## Setting the MaximumRecordAgeInSeconds

This configuration sets up the maximum age of a record that Lambda sends to a function for processing.

**Note:** Serverless only sets this property if you explicitly add it to the stream configuration (see example below).

[Related AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-eventsourcemapping.html#cfn-lambda-eventsourcemapping-maximumrecordageinseconds)

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          maximumRecordAgeInSeconds: 120
```

## Setting the OnFailure destination

This configuration sets up the onFailure location for events to be sent to once it has reached the maximum number of times to retry when the function returns an error.

**Note:** Serverless only sets this property if you explicitly add it to the stream configuration (see example below).

[Related AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-eventsourcemapping.html#cfn-lambda-eventsourcemapping-destinationconfig)

The ARN for the SNS or SQS can be specified as a string, the reference to the ARN of a resource by logical ID, or the import of an ARN that was exported by a different service or CloudFormation stack.

**Note:** The `destinationConfig` will hook up your existing SNS or SQS resources. Serverless won't create a new SNS or SQS for you.

```yml
functions:
  preprocess1:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchSize: 100
          maximumRetryAttempts: 10
          startingPosition: LATEST
          enabled: false
          destinations:
            onFailure: arn:aws:sqs:region:XXXXXX:queue

  preprocess2:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchSize: 100
          maximumRetryAttempts: 10
          startingPosition: LATEST
          enabled: false
          destinations:
            onFailure:
              arn:
                Fn::GetAtt:
                  - MyQueue
                  - Arn
              type: sqs

  preprocess3:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchSize: 100
          maximumRetryAttempts: 10
          startingPosition: LATEST
          enabled: false
          destinations:
            onFailure:
              arn:
                Fn::Join:
                  - ':'
                  - - arn
                    - aws
                    - kinesis
                    - Ref: AWS::Region
                    - Ref: AWS::AccountId
                    - mySnsTopic
              type: sns
```

## Setting the ParallelizationFactor

The configuration below sets up a Kinesis stream event for the `preprocess` function which has a parallelization factor of 10 (default is 1).

The `parallelizationFactor` property specifies the number of concurrent Lambda invocations for each shard of the Kinesis Stream.

For more information, read the [AWS release announcement](https://aws.amazon.com/blogs/compute/new-aws-lambda-scaling-controls-for-kinesis-and-dynamodb-event-sources/) for this property.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          parallelizationFactor: 10
```

## Setting the FunctionResponseTypes

This configuration allows customers to automatically checkpoint records that have been successfully processed for Amazon Kinesis and Amazon DynamoDB Streams.

For more information, read the [AWS release announcement](https://aws.amazon.com/about-aws/whats-new/2020/12/aws-lambda-launches-checkpointing-for-amazon-kinesis-and-amazon-dynamodb-streams/)

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:dynamodb:region:XXXXXX:table/foo/stream/1970-01-01T00:00:00.000
          functionResponseType: ReportBatchItemFailures
```

## Using a Kinesis Data Streams Enhanced Fan-out

This configuration controls the optional usage of Kinesis data streams enhanced fan-out. It can only be used for Kinesis data stream events.

The `consumer` property can be used to put a [stream consumer](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-kinesis-streamconsumer.html) between your function's [event source mapping](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html) and the stream it consumes.

The configuration below creates a new stream consumer.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          consumer: true
```

The configuration below uses the pre-existing stream consumer with the given ARN.

**Note:** When you register a consumer, Kinesis Data Streams generates an ARN for it.
If you delete a consumer and then create a new one with the same name, it won't have the same ARN.
That's because consumer ARNs contain the creation timestamp.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          consumer: arn:aws:kinesis:region:XXXXXX:stream/foo/consumer/foobar:1558544531
```

For more information, read this [AWS blog post](https://aws.amazon.com/blogs/compute/increasing-real-time-stream-processing-performance-with-amazon-kinesis-data-streams-enhanced-fan-out-and-aws-lambda/) or this [AWS documentation](https://docs.aws.amazon.com/streams/latest/dev/introduction-to-enhanced-consumers.html).

## Setting TumblingWindowInSeconds

This configuration allows customers to aggregate values in near-realtime, allowing state to by passed forward by Lambda invocations. A event source created with this property adds several new attributes to the events delivered to the Lambda function.

- **window**: beginning and ending timestamps of the tumbling window;
- **state**: an object containing state of a previous execution. Initially empty can contain up to **1mb** of data;
- **isFinalInvokeForWindow**: indicates if this is the last execution for the tumbling window;
- **isWindowTerminatedEarly**: happens only when the state object exceeds maximum allowed size of 1mb.

For more information and examples, read the [AWS release announcement](https://aws.amazon.com/blogs/compute/using-aws-lambda-for-streaming-analytics/)

Note: Serverless only sets this property if you explicitly add it to the stream configuration (see example below).

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:dynamodb:region:XXXXXX:table/foo/stream/1970-01-01T00:00:00.000
          tumblingWindowInSeconds: 30
```

## Setting filter patterns

This configuration allows customers to filter event before lambda invocation. It accepts up to 5 filter patterns by default and up to 10 with quota extension. If one event matches at least 1 pattern, lambda will process it.

For more details and examples of filter patterns, please see the [AWS event filtering documentation](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html)

Note: Serverless only sets this property if you explicitly add it to the stream configuration (see an example below). The following example will only process inserted items in the DynamoDB table (it will skip removed and modified items).

```yml
functions:
  handleInsertedDynamoDBItem:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:dynamodb:region:XXXXXX:table/foo/stream/1970-01-01T00:00:00.000
          filterPatterns:
            - eventName: [INSERT]
```
