<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure Alibaba Cloud Function Compute in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/functions)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Functions

If you are using Alibaba Cloud Function Compute as a provider, all _functions_ inside the service are Alibaba Cloud Function Compute functions.

## Configuration

All of the Alibaba Cloud Function Compute in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: my-aliyun-service

provider:
  name: aliyun

plugins:
  - serverless-aliyun-function-compute

functions:
  first:
    handler: index.hello
    events:
      - http:
          path: /foo
          method: get
```

## Handler

The `handler` property should be the function name you've exported in your entrypoint file.

When you e.g. export a function with the name `hello` in `index.js` your `handler` should be `handler: index.hello`.

```javascript
// index.js
exports.hello = (event, context, callback) => {};
```

## Memory size and timeout

The `memorySize` and `timeout` for the functions can be specified on the provider or function level. The provider wide definition causes all functions to share this config, whereas the function wide definition means that this configuration is only valid for the function.

The default `memorySize` is 128 MB and the default timeout is `30s` if not specified.

```yml
# serverless.yml

provider:
  memorySize: 512
  timeout: 90s

functions:
  first:
    handler: first
  second:
    handler: second
    memorySize: 256
    timeout: 120s
```

## Handler signatures

The signature of an event handler is:

```javascript
function (event, context, callback) { }
```

### `event`

If the function is triggered by a HTTP event without the `bodyFormat` specified, the `event` passed to the handler will be:

```javascript
// event
{
  type: 'Buffer',
  // A buffer containing a JSON string of data about the incoming request
  data: [ ... ]
}


// let objEvent = JSON.parse(Buffer.from(event).toString());
// let objBody = Base64.decode(objEvent.body);  use a Base64 decoder
// This will give a string of the data. JSON.parse() if you need to turn it into a string
```

If the `bodyFormat` is specified, the `event` passed to the handler will be something like this:

```javascript
// event
{
  body: '',
  headers: { ... },
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/test',
  pathParameters: { ... },
  queryParameters: { ... }
}
```

If the function is triggered by an OSS event, then the `event` would be a JSON string containing data about the event:

```javascript
// JSON.parse(event)
{
  events: [{
    eventName: 'ObjectCreated:PostObject',
    eventSource: 'acs:oss',
    eventTime: '2017-09-15T03:23:17.000Z',
    eventVersion: '1.0',
    oss: {
      bucket: {
        arn: 'acs:oss:cn-shanghai:xxx:my-service-resource',
        name: 'my-service-resource',
        ownerIdentity: 'xxx',
        virtualBucket: ''
      },
      object: {
        deltaSize: 585,
        eTag: '...',
        key: 'source/some.object',
        size: 585
      },
      ossSchemaVersion: '1.0',
      ruleId: '...'
    },
    region: 'cn-shanghai',
    requestParameters: { ... },
    responseElements: { ... },
    userIdentity: { ... }
  }]
}
```

### `context`

The `context` argument contains information about the function and the service. The credentials in `context.credentials` can be used to access other Alibaba Cloud resources.

```javascript
{
  requestId: '...',
  credentials: {
    accessKeyId: '...',
    accessKeySecret: '...',
    securityToken: '...'
  },
  function: {
    name: '...'
    handler: '...'
    memory: 128,
    timeout: 30
  }
}
```

### `callback`

The `callback` argument is a callback taking an `error` and a `response`:

```javascript
exports.http = (event, context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello World!' }),
  };

  callback(null, response);
};
```
