<!--
title: Serverless Framework - Tencent-SCF Events - Cloud Message Queue
menuText: CMQ
menuOrder: 9
description:  Setting up Cloud Message Queue Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/cmq/)

<!-- DOCS-SITE-LINK:END -->

# CMQ (Cloud Message Queue)

## Using a pre-existing topic

In the following example we choose a pre-existing CMQ topic with name `cmq_trigger`. The function will be called every time a message is sent to the `test-topic` topic.

```yml
functions:
  hello_world:
    handler: index.main_handler
    runtime: Nodejs8.9
    events:
      - cmq:
          name: cmq_trigger
          parameters:
            name: test-topic
            enable: true
```

**Note:** CMQ triggers are enabled by default.

## Event Structure for CMQ Topic Trigger

When receiving a message, the specified CMQ Topic sends the following event data in JSON format to the bound SCF.

```json
{
  "Records": [
    {
      "CMQ": {
        "type": "topic",
        "topicOwner":120xxxxx,
        "topicName": "testtopic",
        "subscriptionName":"xxxxxx",
        "publishTime": "1970-01-01T00:00:00.000Z",
        "msgId": "123345346",
        "requestId":"123345346",
        "msgBody": "Hello from CMQ!",
        "msgTag": ["tag1","tag2"]
      }
    }
  ]
}
```
