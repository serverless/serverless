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

# Functions

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
