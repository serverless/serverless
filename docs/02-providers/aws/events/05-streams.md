<!--
title: DynamoDB / Kinesis Streams configuration docs
menuText: DynamoDB / Kinesis Streams config
layout: Doc
-->

# DynamoDB / Kinesis Streams

This setup specifies that the `compute` function should be triggered whenever the corresponding DynamoDB table is modified (e.g. a new entry is added).

**Note:** The `stream` event will hook up your existing streams to a Lambda function. Serverless won't create a new stream for you.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - stream: arn:aws:dynamodb:region:XXXXXX:table/foo/stream/1970-01-01T00:00:00.000
      - stream:
          arn:
            Fn::GetAtt:
              - MyKinesisStream
              - Arn
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
