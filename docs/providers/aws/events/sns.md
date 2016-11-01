<!--
title: Serverless Framework - AWS Lambda Events - SNS
menuText: SNS
menuOrder: 5
description:  Setting up AWS SNS Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/sns)
<!-- DOCS-SITE-LINK:END -->

# SNS

In the following example we create a new SNS topic with the name `dispatch` which is bound to the `dispatcher` function. The function will be called every time a message is sent to the `dispatch` topic.

```yml
functions:
  dispatcher:
    handler: dispatcher.dispatch
    events:
      - sns: dispatch
```

You're also able to add the same SNS topic to multiple functions:

```yml
functions:
  dispatcher:
    handler: dispatcher.dispatch
    events:
      - sns: dispatch
  dispatcher2:
    handler: dispatcher2.dispatch
    events:
      - sns: dispatch
```

This will run both functions for a message sent to the dispatch topic.

## Creating the permission for a pre-existing topic

If you want to run a function from a preexisting SNS topic you need to connect the topic to a Lambda function yourself. By defining a topic arn inside of the SNS topic we're able to set up the Lambda Permission so SNS is allowed to call this function.

```yml
functions:
  dispatcher:
    handler: dispatcher.dispatch
    events:
      - sns: arn:xxx
```

Just make sure your function is already subscribed to the topic, as there's no way to add subscriptions to pre-existing topics in CF. The framework will just give permission to SNS to invoke the function.

## Setting a display name

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
