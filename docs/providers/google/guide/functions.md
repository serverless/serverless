<!--
title: Serverless Framework - Google Cloud Functions Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure Google Cloud Functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/functions)
<!-- DOCS-SITE-LINK:END -->

# Google - Functions

If you are using Google Cloud Functions as a provider, all *functions* inside the service are Google Cloud Functions.

## Configuration

All of the Google Cloud Functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: my-gcloud-service

provider:
  name: google

plugins:
  - serverless-google-cloudfunctions

functions:
  first:
    handler: http
    events:
      - http: path
```

The `handler` property points to the file (default filename: index.js) and module containing the code you want to run in your function.

```javascript
// index.js
exports.http = (request, response) => {}
```

**Note:** The file which contains the handlers needs to have the name `index.js`.

You can add as many functions as you want within this property.

```yml
# serverless.yml
...

functions:
  functionOne:
    handler: http
  functionTwo:
    handler: http
  functionThree:
    handler: otherHandler
```

## Memory size and timeout

The `memorySize` and `timeout` for the functions can be specified on the provider or function level. The provider wide definition causes all functions to share this config, whereas the function wide definition means that this configuration is only valid for the function.

The default `memorySize` is 256 and the default timeout is `60s` if not specified.

```yml
# serverless.yml

provider:
  memorySize: 1024
  timeout: 90s

functions:
  first:
    handler: first
  second:
    handler: second
    memorySize: 512
    timeout: 120s
```

## Handler signatures

Google Cloud Functions have different handler signatures dependent on the event type which will trigger them.

### `http` events

```javascript
exports.http = (request, response) => {
  response.status(200).send('Hello World!');
};
```

### `event` events

```javascript
exports.event = (event, callback) => {
  console.log('Hello World!');
  callback();
};
```
