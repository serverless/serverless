<!--
title: Serverless Framework - Tencent-SCF Events - Cloud Object Storage
menuText: cos
menuOrder: 9
description:  Setting up Cloud Object Storage Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/cos/)

<!-- DOCS-SITE-LINK:END -->

# COS (Cloud Object Storage)

## Event Definition

This example sets up a `COS` event which will trigger the `hello_world` function whenever an object is uploaded to the `cli-appid.cos.ap-beijing.myqcloud.com` under your account.

```yml
# serverless.yml

functions:
  hello_world:
    handler: index.main_handler
    runtime: Nodejs8.9

    events:
      - cos:
          name: cli-appid.cos.ap-beijing.myqcloud.com
          parameters:
            bucket: cli-appid.cos.ap-beijing.myqcloud.com
            filter:
              prefix: filterdir/
              suffix: .jpg
            events: cos:ObjectCreated:*
            enable: true
```

- Use `events` in COS trigger to set the specific trigger event. In the example, the function is called whenever an object is uploaded to the bucket.

- Use filter rules to configure COS trigger, In the example, the function is called whenever an image with `.jpg` extension is uploaded to folder `filterdir` in the bucket.

See the documentation about the [COS Trigger](https://intl.cloud.tencent.com/document/product/583/9707) to get more detail.

## Event Message Structure for COS Trigger

When an object creation or deletion event occurs in the specified COS bucket, event data will be sent to the bound SCF function in JSON format as shown below.

```json
{
  "Records": [
    {
      "cos": {
        "cosSchemaVersion": "1.0",
        "cosObject": {
          "url": "http://testpic-1253970026.cos.ap-chengdu.myqcloud.com/testfile",
          "meta": {
            "x-cos-request-id": "NWMxOWY4MGFfMjViMjU4NjRfMTUyMV8yNzhhZjM=",
            "Content-Type": ""
          },
          "vid": "",
          "key": "/1253970026/testpic/testfile",
          "size": 1029
        },
        "cosBucket": {
          "region": "cd",
          "name": "testpic",
          "appid": "1253970026"
        },
        "cosNotificationId": "unknown"
      },
      "event": {
        "eventName": "cos:ObjectCreated:*",
        "eventVersion": "1.0",
        "eventTime": 1545205770,
        "eventSource": "qcs::cos",
        "requestParameters": {
          "requestSourceIP": "192.168.15.101",
          "requestHeaders": {
            "Authorization": "q-sign-algorithm=sha1&q-ak=AKIDQm6iUh2NJ6jL41tVUis9KpY5Rgv49zyC&q-sign-time=1545205709;1545215769&q-key-time=1545205709;1545215769&q-header-list=host;x-cos-storage-class&q-url-param-list=&q-signature=098ac7dfe9cf21116f946c4b4c29001c2b449b14"
          }
        },
        "eventQueue": "qcs:0:lambda:cd:appid/1253970026:default.printevent.$LATEST",
        "reservedInfo": "",
        "reqid": 179398952
      }
    }
  ]
}
```
