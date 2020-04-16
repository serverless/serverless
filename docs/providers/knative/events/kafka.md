<!--
title: Serverless Framework - Knative Events - Kafka
menuText: Kafka
menuOrder: 2
description: Setting up a Kafka event source with Knative via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/events/kafka/)

<!-- DOCS-SITE-LINK:END -->

# Kafka

Functions can used as sinks for [Knative Eventing](https://knative.dev/docs/eventing) event sources such as Kafka.

Here's how to setup a function as an event sink for the Kafka event source:

```yaml
functions:
  myFunction:
    handler: gcr.io/knative-releases/github.com/knative/eventing-contrib/cmd/event_display:latest
    events:
      - kafka:
          consumerGroup: ${env:KAFKA_CONSUMER_GROUP_NAME}
          bootstrapServers:
            - server1
            - server2
          topics:
            - my-topic
```
