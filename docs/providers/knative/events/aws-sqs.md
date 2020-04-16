<!--
title: Serverless Framework - Knative Events - AWS SQS
menuText: AWS SQS
menuOrder: 4
description: Setting up an AWS SQS event source with Knative via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/events/aws-sqs/)

<!-- DOCS-SITE-LINK:END -->

# AWS SQS

Functions can used as sinks for [Knative Eventing](https://knative.dev/docs/eventing) event sources such as AWS SQS.

Here's how to setup a function as an event sink for the AWS SQS event source:

```yaml
functions:
  myFunction:
    handler: gcr.io/knative-releases/github.com/knative/eventing-contrib/cmd/event_display:latest
    events:
      - awsSqs:
          secretName: aws-credentials
          secretKey: credentials
          queue: QUEUE_URL
```
