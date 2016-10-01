<!--
title: DynamoDB Streams configuration docs
menuText: DynamoDB Streams config
layout: Doc
-->

# DynamoDB Streams

This setup specifies that the `compute` function should be triggered whenever the corresponding dynamodb table is modified (e.g. a new entry is added).

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - dynamodb: some:dynamodb:stream:arn
```

## Setting the BatchSize and StartingPosition

This configuration sets up a dynamodb event for the `preprocess` function which has a batch size of `100`. The staring position is
`LATEST`.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - dynamodb:
          streamArn: some:dynamodb:stream:arn
          bathSize: 100
          startingPosition: LATEST
```
