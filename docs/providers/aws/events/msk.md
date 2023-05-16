<!--
title: Serverless Framework - AWS Lambda Events - Managed Streaming for Apache Kafka (MSK)
menuText: MSK
menuOrder: 18
description:  Setting up AWS MSK Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/msk)

<!-- DOCS-SITE-LINK:END -->

# MSK

[Amazon Managed Streaming for Apache Kafka (Amazon MSK)](https://aws.amazon.com/msk/) is a fully managed streaming service that uses Apache Kafka.
Amazon MSK can be used as event source for Lambda, which allows Lambda service to internally poll it for new messages and invoke corresponding Lambda functions.

## Simple event definition

In the following example, we specify that the `compute` function should be triggered whenever there are new messages available to consume from defined Kafka `topic`.

In order to configure `msk` event, you have to provide two required properties: `arn`, which represents an ARN of MSK cluster and `topic` to consume messages from.

The ARN for the MSK cluster can be specified as a string, the reference to the ARN resource by a logical ID, or the import of an ARN that was exported by a different service or CloudFormation stack.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      # These are all possible formats
      - msk:
          arn: arn:aws:kafka:region:XXXXXX:cluster/MyCluster/xxxx-xxxxx-xxxx
          topic: mytopic
      - msk:
          arn:
            Fn::ImportValue: MyExportedMSKClusterArn
          topic: mytopic
      - msk:
          arn: !Ref MyMSKCluster
          topic: mytopic
```

## Setting the BatchSize, MaximumBatchingWindow and StartingPosition

For the MSK event integration, you can set the `batchSize`, which effects how many messages can be processed in a single Lambda invocation. The default `batchSize` is 100, and the max `batchSize` is 10000.
Likewise `maximumBatchingWindow` can be set to determine the amount of time the Lambda spends gathering records before invoking the function. The default is 0, but **if you set `batchSize` to more than 10, you must set `maximumBatchingWindow` to at least 1**. The maximum is 300.
In addition, you can also configure `startingPosition`, which controls the position at which Lambda should start consuming messages from MSK topic. It supports two possible values, `TRIM_HORIZON` and `LATEST`, with `TRIM_HORIZON` being the default.

In the following example, we specify that the `compute` function should have an `msk` event configured with `batchSize` of 1000, `maximumBatchingWindow` to 30 seconds and `startingPosition` equal to `LATEST`.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:region:XXXXXX:cluster/MyCluster/xxxx-xxxxx-xxxx
          topic: mytopic
          batchSize: 1000
          maximumBatchingWindow: 30
          startingPosition: LATEST
```

Optionally, you can provide the following properties:

- `consumerGroupId` - the consumer group id to use for consuming messages

For example:

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:region:XXXXXX:cluster/MyCluster/xxxx-xxxxx-xxxx
          topic: mytopic
          batchSize: 1000
          maximumBatchingWindow: 30
          startingPosition: LATEST
          consumerGroupId: MyConsumerGroupId
```

## Enabling and disabling MSK event

The `msk` event also supports `enabled` parameter, which is used to control if the event source mapping is active. Setting it to `false` will pause polling for and processing new messages.

In the following example, we specify that the `compute` function's `msk` event should be disabled.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:region:XXXXXX:cluster/MyCluster/xxxx-xxxxx-xxxx
          topic: mytopic
          enabled: false
```

## Enabling authentication

In order to authenticate to the `msk` you can set the `saslScram512`, which sets the authentication protocol.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:region:XXXXXX:cluster/MyCluster/xxxx-xxxxx-xxxx
          topic: mytopic
          saslScram512: arn:aws:secretsmanager:region:XXXXXX:secret:AmazonMSK_xxxxxx
```

## Setting filter patterns

This configuration allows customers to filter event before lambda invocation. It accepts up to 5 filter criterion by default and up to 10 with quota extension. If one event matches at least 1 pattern, lambda will process it.

For more details and examples of filter patterns, please see the [AWS event filtering documentation](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html)

Note: Serverless only sets this property if you explicitly add it to the `msk` configuration (see an example below). The following example will only process records that are published in the MSK cluster where field `a` is equal to 1 or 2.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:region:XXXXXX:cluster/MyCluster/xxxx-xxxxx-xxxx
          topic: mytopic
          filterPatterns:
            - value:
                a: [1]
```

## IAM Permissions

The Serverless Framework will automatically configure the most minimal set of IAM permissions for you. However you can still add additional permissions if you need to. Read the official [AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/with-msk.html) for more information about IAM Permissions for MSK events.
