<!--
title: HTTP API Events (API Gateway v2)
description: 'Expose Lambda functions over HTTP with the httpApi event and Amazon API Gateway HTTP APIs: routes, CORS, JWT, Lambda and IAM authorizers, logs.'
short_title: HTTP API
keywords:
  [
    'Serverless Framework',
    'AWS Lambda HTTP API',
    'API Gateway v2',
    'httpApi event',
    'HTTP API JWT authorizer',
    'HTTP API CORS',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/http-api)

<!-- DOCS-SITE-LINK:END -->

# HTTP API Events (API Gateway v2)

The `httpApi` event exposes a Lambda function at an HTTP route of an [Amazon API Gateway HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html) (API Gateway v2). The Framework creates one HTTP API per service, or uses an [existing HTTP API](#reuse-an-http-api-from-another-service), and a route for each event. HTTP APIs cost less than REST APIs and have fewer features; for API keys, usage plans, request validation or mapping templates, use the [`http` event and a REST API](./apigateway.md). AWS compares the two in [Choose between REST APIs and HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html).

This `serverless.yml` creates an HTTP API with a `GET /hello` route:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          method: GET
          path: /hello
```

```javascript
// handler.mjs
export const hello = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello', path: event.rawPath }),
  }
}
```

`serverless deploy` and `serverless info` print the API's URL under `endpoints`. The URL is also in the `HttpApiUrl` stack output, and the API ID in `HttpApiId`. The Framework deploys the API's `$default` stage with automatic deployment, so the URL has no stage path: `https://<api-id>.execute-api.<region>.amazonaws.com/hello`.

## Routes

A route is an HTTP method and a path. The `httpApi` event takes a route as a string, `'<METHOD> <path>'`, or as `method` and `path` keys:

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

`method` is `GET`, `POST`, `PUT`, `PATCH`, `OPTIONS`, `HEAD`, `DELETE`, `ANY` or `*`, in any case; `*` is the same as `ANY`. `path` starts with `/`. Two events with the same method and path stop the deploy with `Duplicate route '<METHOD> <path>' configuration in function <function> for httpApi event in serverless.yml`.

### Path parameters

A path segment in braces is a path parameter. The function receives its value in `event.pathParameters`:

```yaml
functions:
  params:
    handler: handler.params
    events:
      - httpApi:
          method: GET
          path: /get/for/any/{param}
```

A greedy parameter such as `{proxy+}` matches the rest of the path.

### Catch-all routes

`httpApi: '*'` creates the API's `$default` route, which receives every request that no other route matches. `method: '*'` matches any method on one path:

```yaml
functions:
  catchAllAny:
    handler: handler.catchAllAny
    events:
      - httpApi: '*'
  catchAllMethod:
    handler: handler.catchAllMethod
    events:
      - httpApi:
          method: '*'
          path: /any/method
```

## Endpoint timeout

The Framework sets the integration timeout of every route to 30 seconds, the HTTP API maximum, which can't be increased. A function that runs longer still completes, but the client gets an error response. The Framework prints a warning when a function with `httpApi` events has a `timeout` of 30 seconds or more; keep the function `timeout` below 30.

## CORS setup

HTTP APIs answer CORS preflight requests themselves, with one configuration for all routes. To turn on CORS with the defaults, set `provider.httpApi.cors` to `true`:

```yaml
provider:
  name: aws
  httpApi:
    cors: true
```

`cors: true` sends these headers:

| Header                         | Value                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `Access-Control-Allow-Origin`  | `*`                                                                                                                       |
| `Access-Control-Allow-Headers` | `Content-Type`, `X-Amz-Date`, `Authorization`, `X-Api-Key`, `X-Amz-Security-Token`, `X-Amz-User-Agent`, `X-Amzn-Trace-Id` |
| `Access-Control-Allow-Methods` | `OPTIONS` and the methods of the service's routes; an `ANY` route adds every method                                       |

To set the headers yourself, use the object form:

```yaml
provider:
  name: aws
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

In the object form, `allowedOrigins` defaults to `*`, `allowedHeaders` to the headers of `cors: true`, and `allowedMethods` to `OPTIONS` plus the methods of the service's routes. `allowCredentials` defaults to `false`, and `maxAge` is an integer of 0 or more.

## JWT authorizers

A JWT authorizer validates a JSON Web Token, such as one from an Amazon Cognito user pool, before API Gateway invokes the function. AWS describes the checks in [Control access to HTTP APIs with JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

Define the authorizer under `provider.httpApi.authorizers`:

```yaml
provider:
  name: aws
  httpApi:
    authorizers:
      someJwtAuthorizer:
        type: jwt
        identitySource: $request.header.Authorization
        issuerUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE
        audience:
          - 1example23456789
          - 2example34567890
```

`identitySource`, `issuerUrl` and `audience` are required. `type: jwt` is optional: an authorizer without `type` is a JWT authorizer. `name` sets the authorizer's name in API Gateway (default: the key under `authorizers`). For a Cognito user pool, `issuerUrl` is `https://cognito-idp.<region>.amazonaws.com/<user pool ID>` and `audience` lists the app client IDs. API Gateway matches `audience` against the token's `aud` claim, or its `client_id` claim when the token has no `aud`, so the app client IDs match both Cognito ID tokens and access tokens.

Then reference it in the `httpApi` event's `authorizer`, with the scopes the route requires:

```yaml
functions:
  someFunction:
    handler: handler.someFunction
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

A route with `scopes` accepts a token whose `scope` or `scp` claim contains at least one of them. `authorizer: someJwtAuthorizer` (a string) is the same as `authorizer: { name: someJwtAuthorizer }`. A name that isn't defined under `provider.httpApi.authorizers` stops the deploy with `Event references not configured authorizer '<name>'`.

After API Gateway validates the token, the function receives its claims in `event.requestContext.authorizer.jwt.claims` (payload format `'2.0'`), for example the Cognito user ID in `event.requestContext.authorizer.jwt.claims.sub`.

## Lambda (request) authorizers

A Lambda authorizer runs a function that decides whether API Gateway invokes the route. AWS describes the request and response formats in [Control access to HTTP APIs with AWS Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html).

To use a function of the service as the authorizer, define the authorizer with `type: request` and the function's name in `functionName`:

```yaml
provider:
  name: aws
  httpApi:
    authorizers:
      customAuthorizer:
        type: request
        functionName: authorizerFunc

functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          method: get
          path: /hello
          authorizer:
            name: customAuthorizer
  authorizerFunc:
    handler: authorizer.handler
```

To use a function outside the service, give its ARN in `functionArn` instead:

```yaml
provider:
  name: aws
  httpApi:
    authorizers:
      customAuthorizer:
        type: request
        functionArn: arn:aws:lambda:us-east-1:123456789012:function:external-authorizer
```

The Framework creates the permission that lets API Gateway invoke the authorizer function, unless `managedExternally` is `true`.

### Lambda authorizer settings

A `request` authorizer under `provider.httpApi.authorizers` accepts these keys:

| Key                     | Default       | Description                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                  | Required      | `request`.                                                                                                                                                                                                                                                                                                                                                         |
| `functionName`          | -             | A function of the service. A name that isn't a function of the service stops the deploy.                                                                                                                                                                                                                                                                           |
| `functionArn`           | -             | The ARN of any function; accepts CloudFormation intrinsic functions. Set exactly one of `functionName` and `functionArn`.                                                                                                                                                                                                                                          |
| `name`                  | The key       | The authorizer's name in API Gateway.                                                                                                                                                                                                                                                                                                                              |
| `identitySource`        | None          | One or more [identity sources](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html#http-api-lambda-authorizer.identity-sources), such as `$request.header.Auth`. API Gateway returns 401 without invoking the authorizer when one is missing. Required when `resultTtlInSeconds` is above 0, because it is the cache key. |
| `resultTtlInSeconds`    | API Gateway's | Seconds to cache the authorizer's result, 0 (no caching) to 3600.                                                                                                                                                                                                                                                                                                  |
| `enableSimpleResponses` | `false`       | Lets the function return `{ "isAuthorized": true }` instead of an IAM policy.                                                                                                                                                                                                                                                                                      |
| `payloadVersion`        | `'2.0'`       | The event format sent to the authorizer, `'1.0'` or `'2.0'`.                                                                                                                                                                                                                                                                                                       |
| `managedExternally`     | `false`       | With `true`, the Framework doesn't create the invoke permission, for example for a function in another AWS account. The permission must exist before you deploy.                                                                                                                                                                                                   |

This example sets all of them:

```yaml
provider:
  name: aws
  httpApi:
    authorizers:
      customAuthorizer:
        type: request
        functionArn: arn:aws:lambda:us-east-1:123456789012:function:external-authorizer
        name: customAuthorizerName
        resultTtlInSeconds: 300
        enableSimpleResponses: true
        payloadVersion: '2.0'
        identitySource:
          - $request.header.Auth
          - $request.header.Authorization
        managedExternally: true
```

## AWS IAM authorization

To require callers to sign requests with AWS credentials ([IAM authorization](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-access-control-iam.html)), set the `httpApi` event's `authorizer.type` to `aws_iam`:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          method: get
          path: /hello
          authorizer:
            type: aws_iam
```

With `type: aws_iam`, the authorizer takes no other keys; `name`, `id` or `scopes` stop the deploy. Callers need `execute-api:Invoke` on the route.

## Access logs

To turn on access logs for the API's stage, set `provider.logs.httpApi` to `true`:

```yaml
provider:
  name: aws
  logs:
    httpApi: true
```

Without `logs.httpApi`, the stage has no access logs. The Framework creates the log group `/aws/http-api/<stack name>` (by default `/aws/http-api/<service>-<stage>`) and points the stage's access logs at it. The log group keeps logs for `provider.logRetentionInDays` days when that is set, and indefinitely otherwise. HTTP API access logs don't use the account-level CloudWatch role that REST API execution logs need; the identity that deploys needs the CloudWatch Logs permissions in [Configure logging for HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html). The default format is:

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

To change it, set `format` to a string with the [variables for access logs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging-variables.html) you need:

```yaml
provider:
  name: aws
  logs:
    httpApi:
      format: '{ "ip": "$context.identity.sourceIp", "requestTime":"$context.requestTime" }'
```

## Event payload format

HTTP APIs send Lambda functions events in [payload format](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html) `'2.0'` by default. Format `'1.0'` adds `multiValueHeaders` and `multiValueQueryStringParameters`, and its response format differs. To change the format for every function, set `provider.httpApi.payload`:

```yaml
provider:
  name: aws
  httpApi:
    payload: '1.0'
```

To change it for one function, set `httpApi.payload` on the function; it takes precedence over `provider.httpApi.payload`:

```yaml
functions:
  hello:
    handler: handler.hello
    httpApi:
      payload: '1.0'
    events:
      - httpApi:
          path: /hello
          method: GET
```

Allowed values are `'1.0'` and `'2.0'`, as strings.

## Detailed metrics

To turn on [detailed CloudWatch metrics](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html) for each route (default: off), set `provider.httpApi.metrics`:

```yaml
provider:
  name: aws
  httpApi:
    metrics: true
```

## Tags

The Framework applies `provider.tags` to the HTTP API it creates and to the API's stage:

```yaml
provider:
  name: aws
  tags:
    project: myProject
```

With `provider.tags` set, tags added to the API outside the Framework are removed on the next deploy. `provider.httpApi.useProviderTags` is deprecated and has no effect; remove it.

## API name

The Framework names the HTTP API `<stage>-<service>`. To name it `<service>-<stage>`, set `provider.httpApi.shouldStartNameWithService` to `true`. To choose the name, set `provider.httpApi.name`, which takes precedence:

```yaml
provider:
  name: aws
  httpApi:
    name: my-custom-api-name
```

## Disable default endpoint

Clients can call the API at its `execute-api` URL. To allow calls only through a [custom domain](#custom-domains), set `provider.httpApi.disableDefaultEndpoint` to `true`:

```yaml
provider:
  name: aws
  httpApi:
    disableDefaultEndpoint: true
```

## Reuse an HTTP API from another service

To add the service's routes to an HTTP API that another service or stack manages, set `provider.httpApi.id` to the API's ID:

```yaml
provider:
  name: aws
  httpApi:
    id: a1b2c3d4e5
```

`id` also accepts `Fn::ImportValue` with the name of a CloudFormation export that holds the ID:

```yaml
provider:
  name: aws
  httpApi:
    id:
      Fn::ImportValue: my-shared-http-api-id
```

The Framework then creates the routes, integrations and permissions, but not the API, its stage, or the `HttpApiId` and `HttpApiUrl` outputs. The routes reach clients through a stage of that API with automatic deployment, or after you deploy that API's stage yourself. The API-level settings stop the deploy with an error: `provider.httpApi.cors` with `Cannot setup CORS rules for externally configured HTTP API`, `provider.httpApi.authorizers` with `Cannot setup authorizers for externally configured HTTP API`, and `provider.logs.httpApi` with `Cannot setup access logs for externally configured HTTP API`.

## Shared authorizer

With `provider.httpApi.id`, a route can use an authorizer that already exists on that API: set the `httpApi` event's `authorizer.id` to the authorizer's ID and `type` to `jwt` or `request`. Without `type`, the route uses it as a JWT authorizer. `authorizer.id` without `provider.httpApi.id` stops the deploy with `Event references external authorizer '<id>', but httpApi is part of the current stack.`

This example creates a JWT authorizer on the shared API under `resources` and uses it for two routes:

```yaml
provider:
  name: aws
  httpApi:
    id: a1b2c3d4e5

functions:
  createUser:
    handler: users.create
    events:
      - httpApi:
          path: /users
          method: post
          authorizer:
            type: jwt
            id:
              Ref: ApiGatewayAuthorizer # or the authorizer ID
            scopes: # Optional
              - myapp/myscope
  deleteUser:
    handler: users.delete
    events:
      - httpApi:
          path: /users/{userId}
          method: delete
          authorizer:
            type: jwt
            id:
              Ref: ApiGatewayAuthorizer
            scopes:
              - myapp/anotherscope

resources:
  Resources:
    ApiGatewayAuthorizer:
      Type: AWS::ApiGatewayV2::Authorizer
      Properties:
        ApiId: a1b2c3d4e5
        Name: shared-jwt
        AuthorizerType: JWT
        IdentitySource:
          - $request.header.Authorization
        JwtConfiguration:
          Audience:
            - 1example23456789
          Issuer: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE
```

## Custom domains

API Gateway serves an HTTP API at `https://<api-id>.execute-api.<region>.amazonaws.com/`. To serve it at your own domain name, set `provider.domain`; the Framework reuses or requests the ACM certificate and creates the API Gateway custom domain, the API mapping and the Route 53 records:

```yaml
provider:
  name: aws
  domain: api.example.com
```

The domain maps to the `$default` stage of the HTTP API that the service creates, not to an API set with `provider.httpApi.id`. When the service also has `http` (REST) or `websocket` events, use the object form, `domain: { name: api.example.com, apiType: http }`, as [API types](../guide/domains.md#api-types) shows; without `apiType` the deploy stops with `Multiple API types detected in CloudFormation template`. [Custom domains](../guide/domains.md) explains the certificate lookup, DNS outside Route 53 and every option. To set the domain up yourself instead, create an ACM certificate in the service's Region, create the [custom domain name](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-custom-domain-names.html) in API Gateway with an API mapping to the API's `$default` stage, then point a DNS record at the domain's API Gateway domain name (`d-<id>.execute-api.<region>.amazonaws.com`).

## Related

- [HTTP API settings in the `serverless.yml` reference](../guide/serverless.yml.md#api-gateway-v2-http-api)
- [REST API events](./apigateway.md): the `http` event and API Gateway v1.
- [Custom domains](../guide/domains.md)
