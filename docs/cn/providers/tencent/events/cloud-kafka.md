<!--
title: Serverless Framework - Tencent-SCF 事件 - Cloud Kafka
menuText: Cloud Kafka
menuOrder: 9
description:  Setting up Cloud Kafka Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

## 关联已存在的 Ckafka Topic

该例子中，我们通过 `serverless.yml` 创建了一个名为 `ckafka_trigger` 的 CKafka 触发器，并且关联了一个名为 `test` 的 CKafka Topic，每次这个 Topic 收到消息后，函数都会被调用。详情可以参考 [CKafka 触发器概述](https://cloud.tencent.com/document/product/583/17530)。

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

> 注： CKafka 触发器默认开启，SCF 的后台模块作为消费者，连接 CKafka 实例并消费消息。

## CKafka 触发器的事件消息结构

在指定的 CKafka Topic 接收到消息时，云函数的后台消费者模块会消费到消息，并将消息组装为类似以下的 JSON 格式事件，触发绑定的函数并将数据内容作为入参传递给函数。

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
