<!--
title: Serverless Framework Commands - AWS Lambda - Generate Event
menuText: generate event
menuOrder: 21
description: Generate sample Lambda function event payload
layout: Doc
-->

# AWS - Generate Event

Creates sample Lambda function payloads for different types of events.

```bash
serverless generate-event --type eventType
```

## Options

- `--type` or `-t` The type of the event to generate payload for. **Required**.
- `--body` or `-b` The body for the message, request, or stream event.

## Available event types

- aws:alexaSkill
- aws:alexaSmartHome
- aws:apiGateway
- aws:cloudWatch
- aws:cloudWatchLog
- aws:cognitoUserPool
- aws:dynamo
- aws:iot
- aws:kinesis
- aws:s3
- aws:sns
- aws:sqs
- aws:websocket

## Examples

### Generate SQS event payload

```bash
serverless generate-event -t aws:sqs
```

### Generate Kinesis event payload with body

```bash
serverless generate-event -t aws:kinesis -b '{"foo": "bar"}'
```

### Generate SQS event and save it to a file

```bash
serverless generate-event -t aws:sqs > event.json
```
