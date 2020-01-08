<!--
title: Serverless Framework - Tencent-SCF 事件 - Cloud Object Storage
menuText: cos
menuOrder: 9
description:  Setting up Cloud Object Storage Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/cos/)

<!-- DOCS-SITE-LINK:END -->

## COS 事件定义

该例子在 `hello_world` 函数中创建了一个 COS 触发器，当对象被上传到存储桶 `cli-appid.cos.ap-beijing.myqcloud.com` 时，该云函数会被触发。对应的 `serverless.yml` 如下所示：

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

- 通过 COS 触发器中的 `events` 参数来指定具体的触发事件。在上述例子中，由于参数为 `cos:ObjectCreated:*`，所以函数会在对象被上传到存储桶的时候触发。

- 通过规则过滤来指定具体的触发事件。在上述例子中，由于前缀为 `filterdir/`，后缀为 `.jpg`，因此仅当后缀为 `.jpg` 的文件被上传到 `filterdir` 文件时，函数才会被触发。

详情可以参考 [COS 触发器概述](https://cloud.tencent.com/document/product/583/9707)。

## COS 触发器的事件消息结构

在指定的 COS Bucket 发生对象创建或对象删除事件时，会将类似以下的 JSON 格式事件数据发送给绑定的 SCF 函数。

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
        "cosNotificationId": "unkown"
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
