<!--
title: Serverless Framework - AWS Lambda Events - Kinesis & DynamoDB Streams
menuText: Kinesis & DynamoDB
menuOrder: 2
description:  Setting up AWS Kinesis Streams and AWS DynamoDB Streams Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/streams)
<!-- DOCS-SITE-LINK:END -->

# DynamoDB / Kinesis Streams

This setup specifies that the `compute` function should be triggered whenever:
  1. the corresponding DynamoDB table is modified (e.g. a new entry is added).
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
            Fn::GetAtt:
              - MyDynamoDbTable
              - StreamArn
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
```

## Setting the BatchSize and StartingPosition

This configuration sets up a disabled Kinesis stream event for the `preprocess` function which has a batch size of `100`. The starting position is
`LATEST`.

**Note:** The `stream` event will hook up your existing streams to a Lambda function. Serverless won't create a new stream for you.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchSize: 100
          startingPosition: LATEST
          enabled: false
```
