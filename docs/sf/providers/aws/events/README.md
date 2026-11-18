<!--
title: AWS Lambda Event Sources
description: Every AWS event source the Serverless Framework can connect to a Lambda function, grouped by kind, with the event key and a link to its page.
short_title: Event Sources
keywords: ['Serverless Framework', 'AWS Lambda event sources', 'Lambda triggers', 'serverless.yml events']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/)

<!-- DOCS-SITE-LINK:END -->

# AWS Lambda Event Sources

An event source is the AWS service or resource that invokes a Lambda function, such as an HTTP request, a queue message or a schedule. In `serverless.yml`, each function lists its event sources under `events`, one list item per trigger, keyed by the event name:

```yaml
functions:
  processOrder:
    handler: handler.handler
    events:
      - httpApi: 'POST /orders'
      - sqs: arn:aws:sqs:us-east-1:123456789012:orders
```

The pages in this section document each event key. For how events work across all sources, see [AWS Lambda events](../guide/events.md).

## HTTP event sources

- [HTTP API (API Gateway v2)](./http-api.md): `httpApi` routes HTTP requests from an Amazon API Gateway HTTP API to a function.
- [REST API (API Gateway v1)](./apigateway.md): `http` routes HTTP requests from an Amazon API Gateway REST API, for features only REST APIs have.
- [WebSocket API](./websocket.md): `websocket` handles connect, disconnect and message routes of an API Gateway WebSocket API.
- [Application Load Balancer](./alb.md): `alb` registers a function as the target of a listener rule on an existing Application Load Balancer.
- [CloudFront (Lambda@Edge)](./cloudfront.md): `cloudFront` runs a function at CloudFront edge locations on viewer and origin requests and responses.

## Messaging and stream event sources

- [SQS](./sqs.md): `sqs` processes messages from an Amazon SQS queue in batches.
- [SNS](./sns.md): `sns` invokes a function for each message published to an Amazon SNS topic.
- [Kinesis and DynamoDB Streams](./streams.md): `stream` processes records from a Kinesis data stream or a DynamoDB table stream.
- [MSK](./msk.md): `msk` consumes a topic of an Amazon MSK (Managed Streaming for Apache Kafka) cluster.
- [Kafka](./kafka.md): `kafka` consumes a topic of a self-managed Apache Kafka cluster.
- [ActiveMQ](./activemq.md): `activemq` consumes a queue of an Amazon MQ for ActiveMQ broker.
- [RabbitMQ](./rabbitmq.md): `rabbitmq` consumes a queue of an Amazon MQ for RabbitMQ broker.

## Storage and data event sources

- [S3](./s3.md): `s3` invokes a function for Amazon S3 event notifications, such as an object created or removed, on a new or existing bucket.
- [CloudWatch Logs](./cloudwatch-log.md): `cloudwatchLog` streams log events from a CloudWatch Logs log group through a subscription filter.

## Scheduling and EventBridge event sources

- [Schedule](./schedule.md): `schedule` runs a function on a `rate()` or `cron()` schedule.
- [EventBridge](./event-bridge.md): `eventBridge` invokes a function for events on the default or a custom Amazon EventBridge event bus that match a pattern.
- [CloudWatch Events](./cloudwatch-event.md): `cloudwatchEvent` invokes a function for AWS service events on the default event bus that match a pattern.

## Other AWS service event sources

- [Cognito User Pool](./cognito-user-pool.md): `cognitoUserPool` attaches a function to an Amazon Cognito user pool trigger, such as pre sign-up or post confirmation.
- [AWS IoT rule](./iot.md): `iot` invokes a function for MQTT messages that match an AWS IoT rule's SQL statement.
- [IoT fleet provisioning](./iot-fleet-provisioning.md): `iotFleetProvisioning` makes a function the pre-provisioning hook of an AWS IoT fleet provisioning template.
- [Alexa Skill](./alexa-skill.md): `alexaSkill` lets an Alexa custom skill invoke a function.
- [Alexa Smart Home](./alexa-smart-home.md): `alexaSmartHome` lets an Alexa smart home skill invoke a function.
