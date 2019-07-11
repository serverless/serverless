<!--
title: Serverless Framework - Kubeless Events - PubSub
menuText: PubSub
menuOrder: 2
description:  PubSub Events in Kubeless
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/events/pubsub)

<!-- DOCS-SITE-LINK:END -->

# Kubeless PubSub Events

Kubeless functions can also be registered to listen to PubSub events in a Kafka topic. Kafka (and Zookeeper) are deployed in your Kubernetes cluster as part of the Kubeless deployment.

The function then will be triggered whenever a message is published under a certain topic.

The topic in which the function will be listening is defined in the events section of the `serverless.yml`:

```
service: hello

provider:
  name: kubeless
  runtime: python2.7

plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
    events:
      - trigger: 'hello_topic'
```

## Triggering a function

You can trigger a function by publishing a message under a certain topic.

The Kubeless CLI allows to do this from your command line:

```
kubeless topic publish --topic hello_topic --data 'hello world!' # push a message into the queue
serverless logs -f hello

# Output
hello world!
```

You can install the Kubeless CLI tool following the [installation guide](../guide/installation.md).
