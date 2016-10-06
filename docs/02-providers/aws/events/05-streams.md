<!--
title: DynamoDB / Kinesis Streams configuration docs
menuText: DynamoDB / Kinesis Streams config
layout: Doc
-->

# DynamoDB / Kinesis Streams

This setup specifies that the `compute` function should be triggered whenever the corresponding DynamoDB table is modified (e.g. a new entry is added).

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - stream: some:dynamodb:stream:arn
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
          arn: some:kinesis:stream:arn
          batchSize: 100
          startingPosition: LATEST
          enabled: false
```
