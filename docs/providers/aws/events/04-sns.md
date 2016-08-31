<!--
title: SNS Event configuration docs
layout: Page
-->

# SNS

## Simple event definition

Here we create a new SNS topic with the name `dispatch` which is bound to the `dispatcher` function. The function will be
called every time a message is sent to the `dispatch` topic.

```yml
functions:
  dispatcher:
    handler: dispatcher.dispatch
    events:
      - sns: dispatch
```
Or if you have a pre-existing topic ARN, you can just provide the topic ARN instead:

```yml
functions:
  dispatcher:
    handler: dispatcher.dispatch
    events:
      - sns: topic:arn:xxx
```

Just make sure your topic is already subscribed to the function, as there's no way to add subscriptions to pre-existing topics in CF. The framework will just give permission to SNS to invoke the function.

## Extended event definition

This event definition ensures that the `aggregator` function get's called every time a message is sent to the
`aggregate` topic. `Data aggregation pipeline` will be shown in the AWS console so that the user can understand what the
SNS topic is used for.

```yml
functions:
  aggregator:
    handler: aggregator.handler
    events:
      - sns:
          topicName: aggregate
          displayName: Data aggregation pipeline
```
