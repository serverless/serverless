<!--
title: Serverless Framework - AWS Lambda Events - Self-managed Apache Kafka
menuText: Kafka
description:  Setting up AWS self-managed Apache Kafka Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/kafka)

<!-- DOCS-SITE-LINK:END -->

# Kafka

A self-managed Apache Kafka cluster can be used as an event source for AWS Lambda.

## Simple event definition

In the following example, we specify that the `compute` function should be triggered whenever there are new messages available to consume from defined Kafka `topic`.

In order to configure `kafka` event, you have to provide three required properties:

- `accessConfigurations`, which is either secret credentials required to do [SASL_SCRAM auth](https://docs.confluent.io/platform/current/kafka/authentication_sasl/authentication_sasl_scram.html),[SASL_PLAIN auth](https://docs.confluent.io/platform/current/kafka/authentication_sasl/authentication_sasl_plain.html) or this is VPC configuration to allow Lambda to connect to your cluster. Valid options are: `saslPlainAuth`, `saslScram256Auth`, or `saslScram512Auth`
- `topic` to consume messages from.
- `bootstrapServers` an array of bootstrap server addresses for your Kafka cluster

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:01234567890:secret:MyBrokerSecretName
          topic: AWSKafkaTopic
          bootstrapServers:
            - abc3.xyz.com:9092
            - abc2.xyz.com:9092
```

## Using VPC configurations

You can also specify VPC configurations for your event source. The values will be automatically transformed into their corresponding URI values, so it not required to specify the URI prefix. For example, `subnet-0011001100` will be automatically mapped to the value `subnet:subnet-0011001100`.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            vpcSubnet:
              - subnet-0011001100
              - subnet-0022002200
            vpcSecurityGroup: sg-0123456789
          topic: mytopic
          bootstrapServers:
            - abc3.xyz.com:9092
            - abc2.xyz.com:9092
```

## Enabling and disabling Kafka event

The `kafka` event also supports `enabled` parameter, which is used to control if the event source mapping is active. Setting it to `false` will pause polling for and processing new messages.

In the following example, we specify that the `compute` function's `kafka` event should be disabled.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:01234567890:secret:MyBrokerSecretName
          topic: AWSKafkaTopic
          bootstrapServers:
            - abc3.xyz.com:9092
            - abc2.xyz.com:9092
          enabled: false
```

## IAM Permissions

The Serverless Framework will automatically configure the most minimal set of IAM permissions for you. However you can still add additional permissions if you need to. Read the official [AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/kafka-smaa.html) for more information about IAM Permissions for Kafka events.
