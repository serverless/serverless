<!--
title: Serverless Framework - AWS Lambda Events - HTTP API
menuText: HTTP API
menuOrder: 2
description: Setting up API Gateway HTTP APIs with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/http-api)

<!-- DOCS-SITE-LINK:END -->

# HTTP API

HTTP APIs are a special flavored [API Gateway](https://aws.amazon.com/api-gateway/) implementation which offer more features and improved performance. They have some benefits and drawbacks compared to the traditional API Gateway REST APIs. Read the differences in the [AWS Documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html).

The Serverless Framework makes it possible to setup [API Gateway](https://aws.amazon.com/api-gateway/) HTTP APIs via the `httpApi` event.

## Event Definition

### General setup

```yaml
functions:
  simple:
    handler: handler.simple
    events:
      - httpApi: 'PATCH /elo'
  extended:
    handler: handler.extended
    events:
      - httpApi:
          method: POST
          path: /post/just/to/this/path
```

### Catch-alls

```yaml
functions:
  catchAllAny:
    handler: index.catchAllAny
    events:
      - httpApi: '*'
  catchAllMethod:
    handler: handler.catchAllMethod
    events:
      - httpApi:
          method: '*'
          path: /any/method
```

### Parameters

```yaml
functions:
  params:
    handler: handler.params
    events:
      - httpApi:
          method: GET
          path: /get/for/any/{param}
```

### Endpoints timeout

Framework ensures that function timeout setting (which defaults to 6 seconds) is respected in HTTP API endpoint configuration. Still note that maximum possible timeout for an endpoint is 29 seconds. Ensure to keep function timeout below that. Otherwise you may observe successful lambda invocations reported with `503` status code.

### CORS Setup

With HTTP API we may configure CORS headers that'll be effective for all configured endpoints.

Default CORS configuration can be turned on with:

```yaml
provider:
  httpApi:
    cors: true
```

It'll result with headers as:

| Header                       | Value                                                                                       |
| :--------------------------- | :------------------------------------------------------------------------------------------ |
| Access-Control-Allow-Origin  | \*                                                                                          |
| Access-Control-Allow-Headers | Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent) |
| Access-Control-Allow-Methods | OPTIONS, _(...all defined in endpoints)_                                                    |

If there's a need to fine tune CORS headers, then each can be configured individually as follows:

```yaml
provider:
  httpApi:
    cors:
      allowedOrigins:
        - https://url1.com
        - https://url2.com
      allowedHeaders:
        - Content-Type
        - Authorization
      allowedMethods:
        - GET
      allowCredentials: true
      exposedResponseHeaders:
        - Special-Response-Header
      maxAge: 6000 # In seconds
```

### JWT Authorizers

Currently the only way to restrict access to configured HTTP API endpoints is by setting up an JWT Authorizers.

_For deep details on that follow [AWS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)_

To ensure endpoints (as configured in `serverless.yml`) are backed with authorizers, follow below steps.

#### 1. Configure authorizers on `provider.httpApi.authorizers`

```yaml
provider:
  httpApi:
    authorizers:
      someJwtAuthorizer:
        identitySource: $request.header.Authorization
        issuerUrl: https://cognito-idp.${region}.amazonaws.com/${cognitoPoolId}
        audience:
          - ${client1Id}
          - ${client2Id}
```

#### 2. Configure endpoints which are expected to have restricted access:

```yaml
functions:
  someFunction:
    handler: index.handler
    events:
      - httpApi:
          method: POST
          path: /some-post
          authorizer:
            name: someJwtAuthorizer
            scopes: # Optional
              - user.id
              - user.email
```

### Access logs

Deployed stage can have acess logging enabled, for that just turn on logs for HTTP API in provider settings as follows:

```yaml
provider:
  logs:
    httpApi: true
```

Default logs format is:

```json
{
  "requestId": "$context.requestId",
  "ip": "$context.identity.sourceIp",
  "requestTime": "$context.requestTime",
  "httpMethod": "$context.httpMethod",
  "routeKey": "$context.routeKey",
  "status": "$context.status",
  "protocol": "$context.protocol",
  "responseLength": "$context.responseLength"
}
```

It can be overriden via `format` setting:

```yaml
provider:
  logs:
    httpApi:
      format: '{ "ip": "$context.identity.sourceIp", "requestTime":"$context.requestTime" }'
```

See [AWS HTTP API Logging](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging-variables.html) documentation for more info on variables that can be used

### Reusing HTTP API in different services

We may attach configured endpoints to HTTP API created externally. For that provide HTTP API id in provider settings as follows:

```yaml
provider:
  httpApi:
    id: xxxx # id of externally created HTTP API to which endpoints should be attached.
```

In such case no API and stage resources are created, therefore extending HTTP API with CORS or access logs settings is not supported.
