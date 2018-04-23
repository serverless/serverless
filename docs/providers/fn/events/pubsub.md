<!--
title: Serverless Framework - Fn Events - PubSub
menuText: PubSub
menuOrder: 2
description:  PubSub Events in Fn
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/Fn/events/pubsub)
<!-- DOCS-SITE-LINK:END -->

# Fn PubSub Events

Fn functions can also be registered to listen to PubSub events in a Kafka topic. Kafka (and Zookeeper) are deployed in your Kubernetes cluster as part of the Fn deployment.

The function then will be triggered whenever a message is published under a certain topic.

The topic in which the function will be listening is defined in the events section of the `serverless.yml`:

```
service: hello

provider:
  name: Fn
  runtime: python2.7

plugins:
  - serverless-Fn

functions:
  hello:
    handler: handler.hello
    events:
      - trigger: 'hello_topic'
```

## Triggering a function

You can trigger a function by publishing a message under a certain topic.

The Fn CLI allows to do this from your command line:

```
Fn topic publish --topic hello_topic --data 'hello world!' # push a message into the queue
serverless logs -f hello

# Output
hello world!
```

You can install the Fn CLI tool following the [installation guide](../guide/installation.md).
