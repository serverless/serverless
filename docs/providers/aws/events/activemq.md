<!--
title: Serverless Framework - AWS Lambda Events - MQ
menuText: ActiveMQ
description:  Setting up AWS Active MQ Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/mq)

<!-- DOCS-SITE-LINK:END -->

# MQ

An Active MQ message broker can be used as an event source for AWS Lambda.

## Simple event definition

In the following example, we specify that the `compute` function should be triggered whenever there are new messages available to consume from defined ActiveMQ `queue`.

In order to configure `activemq` event, you have to provide three required properties:

- `basicAuthArn`, which is a [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) ARN for credentials required to do basic auth to allow Lambda to connect to your message broker
- `queue` to consume messages from.
- `arn` arn for your Amazon MQ message broker

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - activemq:
          arn: arn:aws:mq:us-east-1:0000:broker:ExampleMQBroker:b-xxx-xxx
          queue: queue-name
          basicAuthArn: arn:aws:secretsmanager:us-east-1:01234567890:secret:MySecret
```

## Enabling and disabling ActiveMQ event

The `activemq` event also supports `enabled` parameter, which is used to control if the event source mapping is active. Setting it to `false` will pause polling for and processing new messages.

In the following example, we specify that the `compute` function's `activemq` event should be disabled.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - activemq:
          arn: arn:aws:mq:us-east-1:0000:broker:ExampleMQBroker:b-xxx-xxx
          queue: queue-name
          enabled: false
          basicAuthArn: arn:aws:secretsmanager:us-east-1:01234567890:secret:MySecret
```

## Specifying batch size

You can also specify `batchSize` of number of items to retrieve in a single batch. If not specified, this will default to `100`.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - activemq:
          arn: arn:aws:mq:us-east-1:0000:broker:ExampleMQBroker:b-xxx-xxx
          queue: queue-name
          batchSize: 5000
          basicAuthArn: arn:aws:secretsmanager:us-east-1:01234567890:secret:MySecret
```

## IAM Permissions

The Serverless Framework will automatically configure the most minimal set of IAM permissions for you. However you can still add additional permissions if you need to. Read the official [AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/with-mq.html#events-mq-permissions) for more information about IAM Permissions for Amazon MQ events.
