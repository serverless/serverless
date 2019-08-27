<!--
title: Serverless Framework - Alibaba Cloud Function Compute Events - OSS
menuText: OSS
menuOrder: 2
description: Setting up OSS events with Alibaba Cloud Function Compute via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/events/oss)

<!-- DOCS-SITE-LINK:END -->

## OSS

Your Alibaba Cloud Function can be triggered by different `event` sources. Those event sources can be defined and configured with the help of the `event` event.

## OSS events

This example sets up a `oss` event which will trigger the `first` function whenever an object is uploaded to the `my-service-resource` under the account specified by the `ALIYUN_ACCOUNT` environment variable.

```yml
# serverless.yml

functions:
  first:
    handler: index.first
    events:
      - oss:
          sourceArn: acs:oss:cn-shanghai:${env:ALIYUN_ACCOUNT}:my-service-resource
          triggerConfig:
            events:
              - oss:ObjectCreated:PutObject
```

```javascript
// index.js

exports.first = (event, context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello!',
    }),
  };

  callback(null, response);
};
```

**Note:** See the documentation about the [function handlers](../guide/functions.md) to learn how your handler signature should look like to work this type of event.
