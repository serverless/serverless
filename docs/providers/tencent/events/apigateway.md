<!--
title: Serverless Framework - Tencent-SCF Events - API Gateway
menuText: API Gateway
menuOrder: 9
description:  Setting up API Gateway Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/apigateway/)

<!-- DOCS-SITE-LINK:END -->

# API Gateway

Tencent Serverless Cloud Functions can create function based API endpoints through API Gateway.

It might be helpful to read the Tencent Serverless Cloud Functions [API Gateway Trigger](https://intl.cloud.tencent.com/document/product/583/12513) to learn the full functionality.

## HTTP Endpoint

This setup specifies that the function should be run when someone accesses the API gateway via a `POST` request.

Here's an example:

```yml
functions:
  hello_world:
    handler: index.main_handler
    runtime: Nodejs8.9

    events:
      - apigw:
          name: hello_world_apigw
          parameters:
            stageName: release
            serviceId: # if you don't specify an exsiting serviceId, a new service will be created by default.
            httpMethod: POST
            integratedResponse: true # enable integrated response
```

```javascript
//index.js
exports.main_handler = async (event, context, callback) => {
  console.log(event);
  return {
    isBase64Encoded: false,
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: 'hello world',
  };
};
```

## Event message structures of integration request for API Gateway trigger

When an API Gateway trigger receives a request, it sends the event data to the bound function in JSON format as shown below.

```json
{
  "requestContext": {
    "serviceId": "service-f94sy04v",
    "path": "/test/{path}",
    "httpMethod": "POST",
    "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
    "identity": {
      "secretId": "abdcdxxxxxxxsdfs"
    },
    "sourceIp": "10.0.2.14",
    "stage": "release"
  },
  "headers": {
    "Accept-Language": "en-US,en,cn",
    "Accept": "text/html,application/xml,application/json",
    "Host": "service-3ei3tii4-251000691.ap-guangzhou.apigateway.myqloud.com",
    "User-Agent": "User Agent String"
  },
  "body": "{\"test\":\"body\"}",
  "pathParameters": {
    "path": "value"
  },
  "queryStringParameters": {
    "foo": "bar"
  },
  "headerParameters": {
    "Refer": "10.0.2.14"
  },
  "stageVariables": {
    "stage": "release"
  },
  "path": "/test/value",
  "queryString": {
    "foo": "bar",
    "bob": "alice"
  },
  "httpMethod": "POST"
}
```
