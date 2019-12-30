<!--
title: Serverless Framework - Tencent-SCF 事件 - API Gateway
menuText: API Gateway
menuOrder: 9
description:  Setting up API Gateway Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/apigateway/)

<!-- DOCS-SITE-LINK:END -->

您可以借助 Serverless Framework 编写 SCF 云函数来实现 Web 后端服务，并通过 API 网关对外提供服务。API 网关会将请求内容以参数形式传递给函数，并将函数返回作为响应返回给请求方。详情可以参考 [API 网关触发器概述](https://cloud.tencent.com/document/product/583/12513)。

## 创建 HTTP 访问的接入点

通过如下配置，可以创建一个 SCF 函数，并且创建对应的 API 网关触发器，支持 `POST` 请求，对应的 `serverless.yml` 配置如下：

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
以 Node.js 为例，对应的函数代码如下：

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

## API 网关触发器的集成请求事件消息结构

在 API 网关触发器接收到请求时，会将类似以下 JSON 格式的事件数据发送给绑定的云函数。

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
