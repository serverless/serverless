<!--
title: AWS Lambda Events
description: The event sources that can trigger your Lambda functions in serverless.yml, from HTTP APIs and queues to schedules and streams, with a link to each event page.
short_title: AWS Lambda Events
keywords:
  [
    'Serverless Framework',
    'AWS Lambda events',
    'Lambda triggers',
    'event sources',
    'API Gateway',
    'SQS',
    'S3',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/events)

<!-- DOCS-SITE-LINK:END -->

# AWS Lambda Events

Events are what trigger your Lambda functions: an HTTP request, a message on a queue, a file upload, a schedule. You list them under each function's `events` in `serverless.yml`, and on `serverless deploy` the Framework creates the event source or connects an existing one, and gives it permission to invoke the function. This page lists every event type, with a link to its page.

A function can have several events, of the same or different types:

```yaml
# serverless.yml
functions:
  createUser:
    handler: handler.createUser
    events:
      - httpApi: 'POST /users'
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:new-users
```

Each event is an object whose single key is the event type; its value holds that event's settings. The resources the Framework creates for events have predictable logical IDs, listed in the [AWS CloudFormation resource reference](./resources.md#aws-cloudformation-resource-reference), so you can refer to them with `Ref` and `Fn::GetAtt` or change them with `resources.extensions`.

## HTTP and WebSocket events

- [HTTP API (`httpApi`)](../events/http-api.md): serve HTTP endpoints from an API Gateway HTTP API, with JWT and Lambda authorizers and CORS.
- [REST API (`http`)](../events/apigateway.md): serve HTTP endpoints from an API Gateway REST API, for API keys, usage plans, request validation and other REST API features.
- [WebSocket API (`websocket`)](../events/websocket.md): handle connect, disconnect and message routes of an API Gateway WebSocket API.
- [Application Load Balancer (`alb`)](../events/alb.md): route requests from an existing Application Load Balancer listener to a function.

## Storage and messaging events

- [S3 (`s3`)](../events/s3.md): run a function on S3 bucket notifications, such as object uploads, for a new or an existing bucket.
- [SNS (`sns`)](../events/sns.md): subscribe a function to an SNS topic, with filter policies and dead-letter queues.
- [SQS (`sqs`)](../events/sqs.md): process messages from an existing SQS queue in batches.
- [Amazon MQ for ActiveMQ (`activemq`)](../events/activemq.md): consume messages from an Amazon MQ ActiveMQ broker queue.
- [Amazon MQ for RabbitMQ (`rabbitmq`)](../events/rabbitmq.md): consume messages from an Amazon MQ RabbitMQ broker queue.

## Stream events

- [Kinesis and DynamoDB streams (`stream`)](../events/streams.md): process records from a Kinesis data stream or a DynamoDB table stream.
- [Amazon MSK (`msk`)](../events/msk.md): consume records from topics of an Amazon Managed Streaming for Apache Kafka cluster.
- [Self-managed Apache Kafka (`kafka`)](../events/kafka.md): consume records from topics of a Kafka cluster you run.

## Schedule and event bus events

- [Schedule (`schedule`)](../events/schedule.md): run a function on a `rate` or `cron` schedule.
- [EventBridge (`eventBridge`)](../events/event-bridge.md): run a function for events on an EventBridge event bus that match a pattern.
- [CloudWatch Events (`cloudwatchEvent`)](../events/cloudwatch-event.md): run a function for AWS service events on the default event bus, such as EC2 state changes.
- [CloudWatch Logs (`cloudwatchLog`)](../events/cloudwatch-log.md): process log events from a CloudWatch Logs log group through a subscription filter.

## Other events

- [Cognito User Pool (`cognitoUserPool`)](../events/cognito-user-pool.md): customize sign-up, sign-in and messages with Cognito User Pool triggers.
- [CloudFront (`cloudFront`)](../events/cloudfront.md): run a function as Lambda@Edge on CloudFront viewer and origin requests and responses.
- [IoT (`iot`)](../events/iot.md): run a function for MQTT messages that match an AWS IoT topic rule.
- [IoT Fleet Provisioning (`iotFleetProvisioning`)](../events/iot-fleet-provisioning.md): validate devices with a pre-provisioning hook of an AWS IoT provisioning template.
- [Alexa Skill (`alexaSkill`)](../events/alexa-skill.md): handle requests from an Alexa custom skill.
- [Alexa Smart Home (`alexaSmartHome`)](../events/alexa-smart-home.md): handle directives from an Alexa smart home skill.

## Related

- [Functions](./functions.md) for the rest of a function's configuration
- [`serverless.yml` reference](./serverless.yml.md) for every event's keys
- [Invoking Lambda functions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-invocation.html) in the AWS Lambda developer guide
