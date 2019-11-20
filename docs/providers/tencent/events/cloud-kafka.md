<!--
title: Serverless Framework - Tencent-SCF Events - Cloud Kafka
menuText: Cloud Kafka
menuOrder: 9
description:  Setting up Cloud Kafka Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/cloud-kafka/)

<!-- DOCS-SITE-LINK:END -->

# CKafka (Cloud Kafka)

## Using a pre-existing CKafka topic

In the following example we choose a pre-existing CKafka topic with name `ckafka_trigger`. The function will be called every time a message is sent to the `test` topic.

```yml
functions:
  hello_world:
    handler: index.main_handler
    runtime: Nodejs8.9
    events:
      - ckafka:
          name: ckafka_trigger
          parameters:
            name: ckafka-2o10hua5 # ckafka-id
            topic: test
            maxMsgNum: 999
            offset: latest
            enable: true
```

**Note:** CKafka triggers are enabled by default, and the consumer of CKafka will start to get the message from the `latest` offset.

## Event Message Structure for CKafka Trigger

When the specified CKafka topic receives a message, the backend consumer module of SCF will consume the message and encapsulate the message into an event in JSON format like the one below, which triggers the bound function and pass the data content as input parameters to the function.

```json
{
  "Records": [
    {
      "Ckafka": {
        "topic": "test-topic",
        "partition": 1,
        "offset": 36,
        "msgKey": "None",
        "msgBody": "Hello from Ckafka!"
      }
    },
    {
      "Ckafka": {
        "topic": "test-topic",
        "partition": 1,
        "offset": 37,
        "msgKey": "None",
        "msgBody": "Hello from Ckafka again!"
      }
    }
  ]
}
```
