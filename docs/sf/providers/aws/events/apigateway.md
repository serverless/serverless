<!--
title: REST API Events (API Gateway v1)
description: 'Expose Lambda functions as REST API endpoints with the http event: integrations, CORS, authorizers, API keys, request validation, logs and stages.'
short_title: REST API
keywords:
  [
    'Serverless Framework',
    'AWS Lambda API Gateway',
    'API Gateway REST API',
    'http event',
    'API Gateway authorizer',
    'API Gateway API keys',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/apigateway)

<!-- DOCS-SITE-LINK:END -->

# REST API Events (API Gateway v1)

The `http` event exposes a Lambda function at an endpoint of an [Amazon API Gateway REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-rest-api.html) (API Gateway v1). The Framework creates one REST API per service, or uses an [existing REST API](#use-an-existing-rest-api), with a resource and method for each event, and deploys it to a stage named after the service stage, or to the stage in [`provider.apiGateway.stage`](#api-name-and-stage-name). Use a REST API when you need API keys and usage plans, request validation, mapping templates, private endpoints or resource policies; for lower cost and latency without those features, use an [HTTP API](./http-api.md). AWS compares the two in [Choose between REST APIs and HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html).

This `serverless.yml` creates a REST API with a `GET /hello` endpoint:

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
      - http:
          path: hello
          method: get
```

With the default `lambda-proxy` integration, the handler receives the whole request and returns the whole response:

```javascript
// handler.mjs
export const hello = async (event) => {
  return {
    statusCode: 200,
    headers: { 'x-custom-header': 'My Header Value' },
    body: JSON.stringify({ message: 'Hello World!' }),
  }
}
```

`serverless deploy` and `serverless info` print the endpoint under `endpoints`. The `ServiceEndpoint` stack output holds the stage URL:

```text
endpoints:
  GET - https://abcdefghij.execute-api.us-east-1.amazonaws.com/dev/hello
```

## HTTP endpoints

The `http` event takes `path` and `method`, as keys or as one string `'<METHOD> /<path>'`:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
      - http: GET /posts/{id}
```

`method` is `get`, `post`, `put`, `patch`, `options`, `head`, `delete` or `any`, in any case. The Framework removes a leading and a trailing `/` from `path`. A segment in braces, such as `{id}`, is a path parameter; `{proxy+}` matches the rest of the path.

Stage names may contain only letters, digits, `-` and `_`. A service with `http` events and a service stage with other characters stops with `Invalid stage name <stage>: it should contains only [-_a-zA-Z0-9] for AWS provider if http event are present according to API Gateway limitation.`

## Integration types

The `http` event's `integration` sets how API Gateway passes requests to the backend. The names are case-insensitive:

| `integration`                                      | Backend                      | Request and response                                                                                                                |
| -------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `lambda-proxy` (default), `aws-proxy`, `aws_proxy` | The function                 | The function gets the whole request and returns status code, headers and body.                                                      |
| `lambda`, `aws`                                    | The function                 | Request and response mapping templates and status code patterns in `serverless.yml`. See [Lambda integration](#lambda-integration). |
| `http`                                             | An HTTP URL in `request.uri` | Mapping templates, as for `lambda`. See [HTTP and HTTP proxy integrations](#http-and-http-proxy-integrations).                      |
| `http-proxy`, `http_proxy`                         | An HTTP URL in `request.uri` | The request and response pass through.                                                                                              |
| `mock`                                             | None                         | API Gateway answers from templates. See [Mock integration](#mock-integration).                                                      |

With `async: true` and no `integration`, the integration is `lambda`. Use `lambda-proxy` unless you need mapping templates: it keeps the HTTP handling in your code.

## Lambda proxy integration

With `lambda-proxy`, the function receives the request in API Gateway's [proxy event format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format). This is a shortened event:

```json
{
  "resource": "/posts/{id}",
  "path": "/posts/42",
  "httpMethod": "POST",
  "headers": {
    "content-type": "application/json",
    "Host": "abcdefghij.execute-api.us-east-1.amazonaws.com"
  },
  "queryStringParameters": { "draft": "true" },
  "pathParameters": { "id": "42" },
  "stageVariables": null,
  "requestContext": {
    "accountId": "123456789012",
    "stage": "dev",
    "requestId": "0f2431a2-6d2f-11e7-b799-5152aa497861",
    "identity": { "sourceIp": "203.0.113.10" }
  },
  "body": "{\"title\":\"Hello\"}",
  "isBase64Encoded": false
}
```

`body` is a string: parse a JSON body with `JSON.parse(event.body)`. The function returns an object with `statusCode`, and optionally `headers`, `multiValueHeaders`, `body` (a string) and `isBase64Encoded`.

### Catching exceptions in your Lambda function

With `lambda-proxy`, an unhandled error in the function makes API Gateway respond with status `502`. To return another status, catch the error and return a response with that `statusCode`:

```javascript
// handler.mjs
export const create = async (event) => {
  try {
    const post = JSON.parse(event.body)
    return { statusCode: 201, body: JSON.stringify(post) }
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'The body must be valid JSON' }),
    }
  }
}
```

With the `lambda` integration, error messages map to status codes instead; see [Status codes](#status-codes).

## Enabling CORS

To answer browser CORS preflight requests for an endpoint, set the `http` event's `cors` to `true`:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
          cors: true
```

The Framework adds an `OPTIONS` method to the path that returns the CORS headers. `cors: true` is the same as this object:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
          cors:
            origin: '*'
            headers:
              - Content-Type
              - X-Amz-Date
              - Authorization
              - X-Api-Key
              - X-Amz-Security-Token
              - X-Amz-User-Agent
              - X-Amzn-Trace-Id
            allowCredentials: false
```

The `cors` object accepts these keys:

| Key                | Default            | Description                                                                                                                          |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `origin`           | `'*'`              | The allowed origin. A comma-separated list works like `origins`.                                                                     |
| `origins`          | -                  | A list of allowed origins; `*` in an origin is a wildcard (`https://*.example.com`). Replaces `origin`.                              |
| `headers`          | The headers above  | The allowed request headers; `'*'` allows any. A single string is accepted too.                                                      |
| `methods`          | The event's method | The allowed methods. The Framework adds `OPTIONS` and the event's method.                                                            |
| `allowCredentials` | `false`            | Sends `Access-Control-Allow-Credentials: true`. With `false`, the header is omitted.                                                 |
| `maxAge`           | -                  | Seconds browsers may cache the preflight response (`Access-Control-Max-Age`), at least 1.                                            |
| `cacheControl`     | -                  | A `Cache-Control` header for the preflight response, so a CDN can cache it, such as `'max-age=600, s-maxage=600, proxy-revalidate'`. |

The browser accepts one `Access-Control-Allow-Origin` value. With several origins, the preflight response returns the request's `Origin` when it matches one of them:

```yaml
cors:
  origins:
    - https://*.example.com
    - https://example2.com
```

When several events on the same path set `cors`, the Framework merges them into one `OPTIONS` method: it combines `headers`, `methods` and `origins`, and the last `maxAge` and `cacheControl` set win.

The `OPTIONS` method covers the preflight only. With `lambda-proxy`, the function must also return the CORS headers on the actual response:

```javascript
// handler.mjs
export const hello = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({ message: 'Hello World!' }),
  }
}
```

With the `lambda` integration, the Framework adds `Access-Control-Allow-Origin`, and `Access-Control-Allow-Credentials` when `allowCredentials` is `true`, to the method's responses. That `Access-Control-Allow-Origin` value is static: with several origins, it holds all of them joined by commas, and browsers reject a response with more than one origin. With the `lambda` integration, set one origin; to serve several origins, use `lambda-proxy` and return the request's matching `Origin` from the function.

## IAM authorization

To require callers to sign requests with AWS credentials, set the `http` event's `authorizer` to `aws_iam`:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer: aws_iam
```

`authorizer: { type: aws_iam }` is the same. Callers need `execute-api:Invoke` on the method; see [Control access to a REST API with IAM permissions](https://docs.aws.amazon.com/apigateway/latest/developerguide/permissions.html).

## HTTP endpoints with custom authorizers

A Lambda authorizer runs a function that decides whether API Gateway calls the endpoint. To use a function of the service, set `authorizer` to its name:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer: authorizerFunc
  authorizerFunc:
    handler: handler.authorizerFunc
```

To use a function outside the service, set `authorizer` to its ARN:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer: arn:aws:lambda:us-east-1:123456789012:function:Lambda-Name
```

The object form takes `name` or `arn` and these settings:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            name: authorizerFunc
            type: request
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization, context.identity.sourceIp
  authorizerFunc:
    handler: handler.authorizerFunc
```

| Key                            | Default                               | Description                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                         | -                                     | A function of the service. With `arn`, the authorizer's name instead (default: the part of the ARN's function name after its last hyphen).                                                          |
| `arn`                          | -                                     | The ARN of a Lambda function or a Cognito user pool. A CloudFormation intrinsic function needs `name` too.                                                                                          |
| `type`                         | `token`                               | `token`, `request`, `cognito_user_pools` or `aws_iam`, in any case. A `token` authorizer reads one header; a `request` authorizer reads several identity sources.                                   |
| `identitySource`               | `method.request.header.Authorization` | Where API Gateway reads the identity; for `request`, a comma-separated list. A `request` authorizer with `resultTtlInSeconds: 0` has no default.                                                    |
| `identityValidationExpression` | -                                     | A regular expression the `token` identity must match before API Gateway invokes the authorizer.                                                                                                     |
| `resultTtlInSeconds`           | `300`                                 | Seconds to cache the authorizer's result, 0 to 3600.                                                                                                                                                |
| `managedExternally`            | `false`                               | With `true`, the Framework doesn't create the permission that lets API Gateway invoke the function, for example for a function in another AWS account. The permission must exist before you deploy. |

The Framework creates the authorizer on the REST API and, unless `managedExternally` is `true`, the invoke permission. AWS describes the authorizer's input and output in [Use API Gateway Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html).

### Cognito user pool authorizers

To accept tokens from an Amazon Cognito user pool, set `authorizer.arn` to the user pool's ARN. `scopes` lists the OAuth scopes an access token must have:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            arn: arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_ZZZ
            scopes:
              - my-app/read
```

With `lambda-proxy`, the token's claims are in `event.requestContext.authorizer.claims`. To pass only some claims, use the `lambda` integration with `claims`; the function then gets them in `event.cognitoPoolClaims`. `claims` with `lambda-proxy` stops the deploy with `Cognito claims can only be filtered when using the lambda integration type`.

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          integration: lambda
          authorizer:
            arn: arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_ZZZ
            claims:
              - email
              - nickname
```

For a user pool declared under `resources`, reference its ARN with `Fn::GetAtt` and set `name` and `type: COGNITO_USER_POOLS`. Without `name`, the deploy stops with `Please provide an authorizer name for authorizers of type COGNITO_USER_POOLS`:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            name: MyAuthorizer
            type: COGNITO_USER_POOLS
            arn:
              Fn::GetAtt:
                - CognitoUserPool
                - Arn

resources:
  Resources:
    CognitoUserPool:
      Type: AWS::Cognito::UserPool
      Properties:
        UserPoolName: my-service-users
```

## JWT authorizers

A JWT authorizer validates a JSON Web Token from an OpenID Connect (OIDC) or OAuth 2.0 identity provider, such as Auth0, Okta, Microsoft Entra ID or an Amazon Cognito user pool, before API Gateway calls the endpoint. API Gateway checks the token itself, so no authorizer function runs. One authorizer can trust up to 10 issuers, and each endpoint can require its own OAuth scopes. AWS describes the checks in [Control access to REST APIs using JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-jwt-authorizer.html).

Define the authorizer once under `provider.apiGateway.authorizers`, then reference it by its key from `http` events. This `serverless.yml` protects two endpoints with one authorizer, and requires the `orders:read` scope on one of them:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs26.x
  apiGateway:
    authorizers:
      orders:
        type: jwt
        issuerUrl: https://my-tenant.us.auth0.com/
        audience: https://api.example.com/orders
        algorithms:
          - rs256

functions:
  listOrders:
    handler: orders.list
    events:
      - http:
          path: orders
          method: get
          authorizer:
            name: orders
            scopes:
              - orders:read
  health:
    handler: health.get
    events:
      - http:
          path: health
          method: get
          authorizer: orders
```

Replace `issuerUrl` with your issuer, exactly as it appears in your tokens' `iss` claim, and `audience` with the value of their `aud` claim (see [Issuer URL and audience](#issuer-url-and-audience)). `algorithms` is required: list the algorithms your issuer signs tokens with (see [Signing algorithms](#signing-algorithms)).

Callers send the token in the `Authorization` header, with or without a `Bearer ` prefix:

```bash
curl -H "Authorization: Bearer $TOKEN" https://abcdefghij.execute-api.us-east-1.amazonaws.com/dev/orders
```

API Gateway answers a missing, malformed or untrusted token with `401` and `{"message":"Unauthorized"}`, an expired one with `401` and `{"message":"The incoming token has expired"}`, and a valid token that lacks a required scope or fails a [claim rule](#claim-rules) with `403` and `{"Message":"Access Denied"}`. Both responses carry a `WWW-Authenticate` header that names the reason, for example `Bearer error="invalid_token" error_description="issuer does not match"`.

For each authorizer, the Framework creates one API Gateway authorizer on the service's REST API, or on the REST API in `provider.apiGateway.restApiId`. It creates no Lambda function or invoke permission for it. Defining authorizers in a service with no REST API (no `http` event, no service proxy and no `provider.apiGateway.restApiId`) stops packaging and deployment with `"provider.apiGateway.authorizers" defines authorizers, but this service has no REST API: add an http event, or set "provider.apiGateway.restApiId" to the shared REST API.`

### JWT authorizer settings

A JWT authorizer under `provider.apiGateway.authorizers.<key>` takes these settings. The key is the name that `http` events reference, case-sensitively. It holds letters, digits, `-` and `_` only, because it becomes part of a CloudFormation resource name, and `aws_iam`, in any case, is reserved for IAM authorization:

| Key                | Default                               | Description                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`             | Required                              | `jwt`, in any case. `provider.apiGateway.authorizers` holds JWT authorizers only; Lambda and Cognito user pool authorizers are set on the `http` event.                                                                                   |
| `algorithms`       | Required                              | A list of the signing algorithms the authorizer accepts: `RS256`, `RS384`, `RS512`, `ES256`, `ES384` or `ES512`, in any case, each at most once.                                                                                          |
| `issuerUrl`        | Required without `issuers`            | The issuer, exactly as in the token's `iss` claim: an `https://` URL with a host and no query, fragment or user info. A string, a variable or a CloudFormation intrinsic function.                                                        |
| `audience`         | Required without `issuers`            | The accepted value of the token's `aud` claim, or a list of 1 to 100 of them, each listed once. Each is a string or a CloudFormation intrinsic function.                                                                                  |
| `additionalClaims` | None                                  | Up to 10 claim rules for the issuer, by claim name. See [Claim rules](#claim-rules).                                                                                                                                                      |
| `issuers`          | None                                  | A list of 1 to 10 issuers, each with its own `issuerUrl`, `audience` and optional `additionalClaims`. Not with the top-level `issuerUrl`, `audience` or `additionalClaims`. See [Several issuers](#several-issuers).                      |
| `identitySource`   | `method.request.header.Authorization` | The request header that carries the token, as one `method.request.header.<Name>`. The header holds the token with or without a `Bearer ` prefix, in any case. Query strings, context values and lists of several sources aren't accepted. |
| `name`             | The key                               | The authorizer's name in API Gateway. Names are unique within a REST API.                                                                                                                                                                 |

A JWT authorizer has no result cache. On an `http` event that uses a JWT authorizer, `resultTtlInSeconds`, `identitySource`, `identityValidationExpression`, `claims`, `arn` and `managedExternally` stop packaging and deployment with `API_GATEWAY_JWT_AUTHORIZER_UNSUPPORTED_PROPERTY` and a message that names the key, for example `Function "listOrders" sets "resultTtlInSeconds" on an http event that uses JWT authorizer "orders". JWT authorizers don't cache results: remove "resultTtlInSeconds".`

The Framework checks the limits in the table when you package or deploy, and stops with `API_GATEWAY_JWT_AUTHORIZER_INVALID` and a message that names the authorizer and the key. Values written as CloudFormation intrinsic functions get only their shape checked; API Gateway checks the resolved values at deploy time.

### Signing algorithms

`algorithms` lists the signing algorithms the authorizer accepts; a token signed with any other algorithm gets `401`. It has no default. Without it, packaging and deployment stop with:

```text
API Gateway authorizer "orders" has no "algorithms". List the signing algorithms your issuer uses, for example "algorithms: [RS256]" (allowed: RS256, RS384, RS512, ES256, ES384, ES512). The issuer's discovery document lists them under "id_token_signing_alg_values_supported".
```

To find your issuer's algorithms, open its OpenID Connect discovery document, the issuer URL without a trailing slash followed by `/.well-known/openid-configuration`, and read `id_token_signing_alg_values_supported`:

```bash
curl -s https://my-tenant.us.auth0.com/.well-known/openid-configuration
```

```text
"id_token_signing_alg_values_supported": ["HS256", "RS256", "PS256"]
```

List only the algorithms your tokens are signed with. A token's `alg` header names the algorithm it uses, and most identity providers sign with `RS256` by default. API Gateway accepts `RS256`, `RS384`, `RS512`, `ES256`, `ES384` and `ES512`, and rejects tokens signed with HMAC algorithms such as `HS256` or with `PS256`. An issuer that signs with `PS256`, an option some providers such as Auth0 offer, needs its signing algorithm changed to one of the six before a JWT authorizer accepts its tokens.

### Issuer URL and audience

API Gateway accepts a token only when its `iss` claim equals one of the authorizer's issuer URLs exactly, including any trailing slash. To find the value, decode a token from your identity provider and copy its `iss` claim. The Framework passes `issuerUrl` to API Gateway as written. For example:

- **Auth0**: the issuer ends in `/`, such as `https://my-tenant.us.auth0.com/`.
- **Microsoft Entra ID**: use the issuer of your tenant, such as `https://login.microsoftonline.com/<tenant ID>/v2.0` for v2.0 tokens, not the `common` or `organizations` endpoint. Those endpoints aren't issuers: tokens carry the issuer of the user's own tenant.
- **Amazon Cognito user pool**: `https://cognito-idp.<region>.amazonaws.com/<user pool ID>`, with no trailing slash. See [Cognito user pool as the issuer](#cognito-user-pool-as-the-issuer).

When you deploy, API Gateway reads the issuer's discovery document at the issuer URL followed by `/.well-known/openid-configuration`, and finds the issuer's signing keys through it. The document and the keys must be reachable from the public internet, also for private REST APIs. An issuer URL that doesn't match the `issuer` in that document, or whose document can't be retrieved, stops the deploy (see [JWT authorizer deploy errors](#jwt-authorizer-deploy-errors)).

`audience` lists the accepted values of the token's `aud` claim. For an Amazon Cognito access token, which has no `aud` claim, API Gateway checks its `client_id` claim instead.

### Several issuers

To accept tokens from several identity providers, or from several tenants of one provider, list them under `issuers`. Each issuer has its own `audience` and optional `additionalClaims`:

```yaml
provider:
  name: aws
  apiGateway:
    authorizers:
      partners:
        type: jwt
        algorithms:
          - rs256
        issuers:
          - issuerUrl: https://login.microsoftonline.com/${param:entraTenantId}/v2.0
            audience: api://orders
          - issuerUrl: https://my-tenant.us.auth0.com/
            audience:
              - https://api.example.com/orders
              - https://api.example.com/reports
```

`entraTenantId` is a [parameter](../../../guides/parameters.md) that holds your Entra ID tenant ID. An authorizer lists 1 to 10 issuers, each issuer URL once. `algorithms` and `identitySource` apply to every issuer of the authorizer. `issuers` can't be combined with a top-level `issuerUrl`, `audience` or `additionalClaims`.

### Claim rules

`additionalClaims` makes API Gateway check other claims of the token for one issuer, in addition to `iss`, `aud`, the token's expiry and the endpoint's scopes. It maps claim names to rules, in one of three forms:

```yaml
provider:
  name: aws
  apiGateway:
    authorizers:
      orders:
        type: jwt
        issuerUrl: https://my-tenant.us.auth0.com/
        audience: https://api.example.com/orders
        algorithms:
          - rs256
        additionalClaims:
          # A string: the claim must be present and equal "acme"
          tenant: acme
          # true: the claim must be present, with any value
          department: true
          # value with required: false: checked only when the token carries the claim
          tier:
            value: gold
            required: false
```

`{ value: acme }` without `required` is the same as `tenant: acme`. An issuer takes up to 10 rules. The claim names `iss`, `aud`, `exp`, `nbf`, `iat`, `scope` and `scp` aren't accepted: API Gateway checks those itself, and [scopes](#scopes-on-endpoints) go on the `http` event.

API Gateway compares the value exactly, case-sensitively, and matches only a claim whose value in the token is a single string. A token whose claim is an array, such as `"groups": ["admins", "users"]`, fails the rule. A token that fails a claim rule gets `403`. To check array claims or several accepted values, check them in your function, or use a [Lambda authorizer](#http-endpoints-with-custom-authorizers).

### Scopes on endpoints

An `http` event's `authorizer.scopes` lists the OAuth scopes the endpoint requires. A token passes when its `scope` claim (a space-separated string) or its `scp` claim (a list) contains at least one of them; a valid token without any of them gets `403`. Each endpoint sets its own scopes:

```yaml
functions:
  listOrders:
    handler: orders.list
    events:
      - http:
          path: orders
          method: get
          authorizer:
            name: orders
            scopes:
              - orders:read
  createOrder:
    handler: orders.create
    events:
      - http:
          path: orders
          method: post
          authorizer:
            name: orders
            scopes:
              - orders:write
```

`authorizer: orders` (a string) is the same as `authorizer: { name: orders }`, without scopes. `type: jwt` beside `name` is optional. A `name` with `type: jwt` that isn't a key of `provider.apiGateway.authorizers` stops packaging and deployment with `Function "listOrders" references JWT authorizer "orderz", which isn't defined. Define it under "provider.apiGateway.authorizers", or set "authorizerId" to attach an existing one.`

Amazon Cognito names scopes `<resource server>/<scope>`, such as `orders/read`. When an authorizer trusts a Cognito user pool and other issuers, list each form of a scope the endpoint accepts.

### Cognito user pool as the issuer

A JWT authorizer accepts tokens from an Amazon Cognito user pool like any other issuer: the issuer URL is `https://cognito-idp.<region>.amazonaws.com/<user pool ID>`, and the audience is the app client ID. For a user pool declared under `resources` in the same service, set `issuerUrl` to the pool's `ProviderURL` attribute and `audience` to a `Ref` of the app client:

```yaml
provider:
  name: aws
  apiGateway:
    authorizers:
      users:
        type: jwt
        issuerUrl: !GetAtt UserPool.ProviderURL
        audience: !Ref UserPoolClient
        algorithms:
          - rs256

functions:
  getProfile:
    handler: profile.get
    events:
      - http:
          path: me
          method: get
          authorizer: users
  updateProfile:
    handler: profile.update
    events:
      - http:
          path: me
          method: put
          authorizer:
            name: users
            scopes:
              - aws.cognito.signin.user.admin

resources:
  Resources:
    UserPool:
      Type: AWS::Cognito::UserPool
      Properties:
        UserPoolName: ${self:service}-${sls:stage}-users
    UserPoolClient:
      Type: AWS::Cognito::UserPoolClient
      Properties:
        UserPoolId: !Ref UserPool
        ClientName: my-service-web
        ExplicitAuthFlows:
          - ALLOW_USER_SRP_AUTH
          - ALLOW_REFRESH_TOKEN_AUTH
```

With a Cognito issuer, API Gateway applies Cognito's token-type rule: an endpoint without `scopes` accepts only ID tokens, and an endpoint with `scopes` accepts only access tokens. A token of the other type gets `401`. The app client ID matches both: an ID token carries it in `aud`, and an access token in `client_id`.

Two more Cognito specifics:

- A Cognito access token carries no custom attributes such as `custom:tier`, so an `additionalClaims` rule on one rejects every access token from that pool with `403`. Put rules on custom attributes only on authorizers whose endpoints take ID tokens.
- An access token from user sign-in carries the scope `aws.cognito.signin.user.admin`. To require scopes that distinguish callers, define them on a resource server of the pool and grant them to the app client.

A JWT authorizer accepts tokens only from the app clients listed in `audience`. To accept tokens from every app client of a pool without listing them, use a [Cognito user pool authorizer](#cognito-user-pool-authorizers) instead.

### Read JWT claims in the function

With the default `lambda-proxy` integration, the function receives the validated token's claims in `event.requestContext.authorizer.claims`, each with its JSON type:

```javascript
// orders.mjs
export const list = async (event) => {
  const claims = event.requestContext.authorizer?.claims ?? {}
  return {
    statusCode: 200,
    body: JSON.stringify({ user: claims.sub }),
  }
}
```

Delivery of JWT claims to integrations is rolling out across AWS Regions and may not be available in every Region. Where it isn't, `event.requestContext.authorizer` is `null` even though API Gateway validated the token. Before your function relies on claims, check that they arrive in your Region; where they don't, decode the token from the `Authorization` header in the function, after API Gateway has validated it. AWS documents the claim format in [Pass JWT claims to your integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-jwt-authorizer-claims.html).

### Migrate from a Lambda or Cognito authorizer to a JWT authorizer

To move endpoints from a Lambda or Cognito user pool authorizer to a JWT authorizer, give the JWT authorizer a name that differs from the old authorizer's, define it under `provider.apiGateway.authorizers`, and point the events at it in one deploy:

```yaml
provider:
  name: aws
  apiGateway:
    authorizers:
      ordersJwt:
        type: jwt
        issuerUrl: https://my-tenant.us.auth0.com/
        audience: https://api.example.com/orders
        algorithms:
          - rs256

functions:
  listOrders:
    handler: orders.list
    events:
      - http:
          path: orders
          method: get
          authorizer: ordersJwt # was: authorizer: verifyToken
```

The deploy creates the JWT authorizer, switches the endpoints to it, and removes the old authorizer once no endpoint uses it. If the deploy fails, CloudFormation rolls back to the old authorizer. The new name matters because API Gateway creates the JWT authorizer before it deletes the old one, and names are unique within a REST API. A JWT authorizer named like an authorizer the deploy removes stops the deploy with:

```text
Authorizer name must be unique. Authorizer verifyToken already exists in this RestApi.
```

Packaging stops with `API_GATEWAY_AUTHORIZER_NAME_CONFLICT` when:

- a JWT authorizer's name in API Gateway (its `name`, or its key when it has no `name`) matches a Lambda or Cognito user pool authorizer of the service, or an `http` event gives a JWT authorizer's key as the `name` of a Lambda or Cognito user pool authorizer;
- an `http` event references a JWT authorizer as `authorizer: <key>` or `authorizer: { name: <key> }` and the service also has a function named `<key>`, because the reference could mean either. Write `authorizer: { type: jwt, name: <key> }` to use the JWT authorizer, or rename it;
- two keys differ only in case or punctuation, such as `orders` and `Orders`, because they would compile to the same CloudFormation resource.

After the switch, check what the function reads: a Lambda authorizer's context and `claims` with the `lambda` integration don't exist with a JWT authorizer; read [claims in the function](#read-jwt-claims-in-the-function) instead.

### JWT authorizer deploy errors

API Gateway reads each issuer's discovery document when the deploy creates or updates the authorizer, so issuer problems stop the deploy with API Gateway's message, inside CloudFormation's `Resource handler returned message: "..."`.

#### `Invalid issuer: ... Issuer should exactly match the issuer in its OpenID Connect discovery document`

```text
Invalid issuer: https://idp.example.com/. Issuer should exactly match the issuer in its OpenID Connect discovery document: https://idp.example.com.
```

The issuer URL differs from the `issuer` in the issuer's discovery document, most often by a trailing slash. Set `issuerUrl` to the value the message ends with, which is also the `iss` claim of the issuer's tokens.

#### `Invalid issuer: ... Issuer should have an OpenID Connect discovery document at ...`

```text
Invalid issuer: https://idp.example.com. Issuer should have an OpenID Connect discovery document at https://idp.example.com/.well-known/openid-configuration, but it couldn't be retrieved because it didn't return HTTP 200.
```

API Gateway couldn't read the discovery document. The message ends with the cause: `it didn't return HTTP 200` when the URL answers without a document, which usually means the issuer URL isn't the issuer (copy it from a token's `iss` claim), and `its host doesn't resolve to an allowed public address` when the host isn't public. The document must be reachable from the public internet and served with a certificate from a [certificate authority API Gateway supports](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-supported-certificate-authorities-for-http-endpoints.html).

#### Every token gets `401` after a successful deploy

API Gateway's `WWW-Authenticate` response header names the check that failed:

- `issuer does not match`: the token's `iss` differs from every issuer URL of the authorizer.
- `the token does not have a valid audience`: the token's `aud` (or, for a Cognito access token, `client_id`) isn't in `audience`.
- `the token's signing algorithm is not allowed`: add the token's `alg` to `algorithms`.
- `the token's token_use is not valid for this method`: a Cognito ID token on an endpoint with `scopes`, which accepts only access tokens (see [Cognito user pool as the issuer](#cognito-user-pool-as-the-issuer)).

AWS lists more causes in [Signing keys and troubleshooting JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-jwt-authorizer-keys.html).

## Share authorizer

To use one authorizer for endpoints in several services, for example on a shared REST API, create the authorizer once and reference its ID. Set the `http` event's `authorizer.authorizerId` and `type`:

```yaml
functions:
  createUser:
    handler: users.create
    events:
      - http:
          path: /users
          method: post
          authorizer:
            type: COGNITO_USER_POOLS # TOKEN, REQUEST, COGNITO_USER_POOLS or JWT
            authorizerId:
              Ref: ApiGatewayAuthorizer # or the authorizer ID
            scopes: # Optional, COGNITO_USER_POOLS and JWT only
              - myapp/myscope

resources:
  Resources:
    ApiGatewayAuthorizer:
      Type: AWS::ApiGateway::Authorizer
      Properties:
        AuthorizerResultTtlInSeconds: 300
        IdentitySource: method.request.header.Authorization
        Name: Cognito
        RestApiId:
          Ref: ApiGatewayRestApi # the service's REST API, or the shared REST API ID
        Type: COGNITO_USER_POOLS
        ProviderARNs:
          - arn:aws:cognito-idp:${aws:region}:123456789012:userpool/us-east-1_ZZZ
```

With `authorizerId`, `type: TOKEN` and `type: REQUEST` make the method use a Lambda authorizer, and `type: jwt` a JWT authorizer; `scopes` apply only with `COGNITO_USER_POOLS` and `jwt`. The Framework creates no authorizer or permission for these events.

### Share a JWT authorizer

A [JWT authorizer](#jwt-authorizers) is shared the same way. The service that owns the REST API, or any service on it, defines the authorizer under `provider.apiGateway.authorizers` and exports its ID. The Framework names the authorizer's CloudFormation resource after its key, with the first letter in uppercase and `ApiGatewayJwtAuthorizer` appended (`orders` becomes `OrdersApiGatewayJwtAuthorizer`; `-` becomes `Dash` and `_` becomes `Underscore`), and `Ref` returns the authorizer ID:

```yaml
# serverless.yml of service-a, which owns the REST API
service: service-a

provider:
  name: aws
  apiGateway:
    authorizers:
      orders:
        type: jwt
        issuerUrl: https://my-tenant.us.auth0.com/
        audience: https://api.example.com/orders
        algorithms:
          - rs256

functions:
  listOrders:
    handler: orders.list
    events:
      - http:
          path: orders
          method: get
          authorizer: orders

resources:
  Outputs:
    OrdersJwtAuthorizerId:
      Value:
        Ref: OrdersApiGatewayJwtAuthorizer
```

Another service on the same REST API (see [Use an existing REST API](#use-an-existing-rest-api)) attaches it with `type: jwt` and `authorizerId`, with its own scopes per endpoint:

```yaml
# serverless.yml of service-b, on service-a's REST API
service: service-b

provider:
  name: aws
  apiGateway:
    restApiId: a1b2c3d4e5
    restApiRootResourceId: f6g7h8i9j0

functions:
  listReports:
    handler: reports.list
    events:
      - http:
          path: reports
          method: get
          authorizer:
            type: jwt
            authorizerId: ${cf:service-a-dev.OrdersJwtAuthorizerId}
            scopes:
              - reports:read
```

`type: jwt` is required beside `authorizerId`: API Gateway rejects a method of another authorization type that names a JWT authorizer. An `http` event that sets `authorizerId` and also names a key of `provider.apiGateway.authorizers` in `name` stops packaging with `API_GATEWAY_JWT_AUTHORIZER_UNSUPPORTED_PROPERTY`: set one or the other. A service with `provider.apiGateway.restApiId` and no `http` events can own the authorizers of the shared REST API.

Changes to an authorizer take effect on a stage after that REST API is deployed again. A service that only defines the authorizer on a shared REST API, with no `http` events, doesn't create a stage deployment, so redeploy a service with endpoints on that REST API to apply them.

When services on a shared REST API each set the same authorizer `arn` instead, each creates its own authorizer resource on the API, and they can clash. Share the authorizer by ID, or give each authorizer a unique `name`. A REST API has a default quota of 10 authorizers.

## Operation ID

`operationId` sets the method's operation name, which SDK and OpenAPI code generators use as the method name:

```yaml
functions:
  create:
    handler: users.create
    events:
      - http:
          path: users/create
          method: post
          operationId: createUser
```

## Using asynchronous integration

With `async: true`, API Gateway invokes the function [asynchronously](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html) and responds without waiting for the function to finish. Without `integration`, the integration is `lambda`, and API Gateway returns `200`:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          async: true # default: false
```

## Setting API keys for your REST API

To require an API key on an endpoint, set the `http` event's `private` to `true` and list the keys under `provider.apiGateway.apiKeys`. Clients send a key's value in the `x-api-key` header. The Framework creates the keys, a usage plan for the stage and the links between them:

```yaml
service: my-service

provider:
  name: aws
  apiGateway:
    apiKeys:
      - myFirstKey
      - ${sls:stage}-myFirstKey
      - name: myThirdKey
        value: ${ssm:/my-service/third-api-key}
      - value: ${ssm:/my-service/fourth-api-key} # CloudFormation names the key
        description: Api key description # Optional
        customerId: my-customer # Optional
        enabled: true # Optional, default: true
    usagePlan:
      quota:
        limit: 5000
        offset: 2
        period: MONTH
      throttle:
        burstLimit: 200
        rateLimit: 100

functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: user/create
          method: get
          private: true
```

A string entry is a key name; AWS generates the value. `serverless deploy` and `serverless info` print the key values; `--conceal` hides them. Changing an entry's `value` replaces the key, which CloudFormation can't do while the key keeps a custom name: change the `name` too, or omit `name` and let CloudFormation name the key.

`usagePlan.quota.period` is `DAY`, `WEEK` or `MONTH`; `limit`, `offset`, `burstLimit` and `rateLimit` are integers of 0 or more.

For several usage plans, name each plan and group the keys under the plan names:

```yaml
provider:
  name: aws
  apiGateway:
    apiKeys:
      - free:
          - myFreeKey
          - ${sls:stage}-myFreeKey
      - paid:
          - myPaidKey
          - ${sls:stage}-myPaidKey
    usagePlan:
      - free:
          quota:
            limit: 5000
            offset: 2
            period: MONTH
          throttle:
            burstLimit: 200
            rateLimit: 100
      - paid:
          quota:
            limit: 50000
            offset: 1
            period: MONTH
          throttle:
            burstLimit: 2000
            rateLimit: 1000
```

Each group's name must match a plan name under `usagePlan`; a group without a matching plan stops the deploy with `API key "<name>" has no usage plan defined`. Keys inside a group take the same forms as above: a name, or an object with `name`, `value`, `description`, `customerId` and `enabled`. `quota` and `throttle` are optional in every plan. Every plan applies to the service's stage, so an endpoint with `private: true` accepts a key from any plan.

### API key source

API Gateway reads the API key from the `x-api-key` header by default (`apiKeySourceType: HEADER`). To take it from the `usageIdentifierKey` that a Lambda authorizer returns, set `provider.apiGateway.apiKeySourceType` to `AUTHORIZER`; see [API key sources](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-key-source.html):

```yaml
provider:
  name: aws
  apiGateway:
    apiKeySourceType: AUTHORIZER
```

## Configuring endpoint types

`provider.endpointType` sets the REST API's [endpoint type](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-endpoint-types.html): `EDGE` (the default), `REGIONAL` or `PRIVATE`, in any case. Edge-optimized APIs route requests through Amazon CloudFront; regional APIs serve clients in the same Region; private APIs are reachable only from VPCs through interface VPC endpoints.

```yaml
provider:
  name: aws
  endpointType: REGIONAL
```

For a private API, `vpcEndpointIds` lists the VPC endpoints to associate. API Gateway then creates a Route 53 alias for each, `https://<rest-api-id>-<vpc-endpoint-id>.execute-api.<region>.amazonaws.com`. `vpcEndpointIds` with `endpointType` set to `EDGE` or `REGIONAL` stops the deploy with `VPC endpoint IDs are only available for private APIs`. Without `endpointType`, the Framework ignores `vpcEndpointIds` and deploys an edge-optimized API, so set `endpointType: PRIVATE` with it.

```yaml
provider:
  name: aws
  endpointType: PRIVATE
  vpcEndpointIds:
    - vpce-0123456789abcdef0
```

A private API also needs a [resource policy](#resource-policy) that allows access from the VPC endpoints.

## Request parameters

`request.parameters` declares the query string, header and path parameters of a method, for API Gateway's console tests and SDK generation. `true` makes a parameter required and `false` optional. When at least one parameter is required, the Framework attaches a request validator, so API Gateway rejects requests without it:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/{id}
          method: post
          request:
            parameters:
              querystrings:
                url: true
              headers:
                foo: false
              paths:
                id: true
```

A path parameter must also appear in `path`, as `{id}` here.

To map a parameter to another value in the integration request, give `required` and `mappedValue`. The Framework applies mapped values for the `lambda`, `http` and `http-proxy` integrations. With `lambda-proxy`, it applies only the mapping of the `X-Amz-Tenant-Id` header, used by Lambda [tenant isolation](../guide/functions.md#tenant-isolation), and ignores the others:

```yaml
functions:
  create:
    handler: posts.postDetail
    events:
      - http:
          path: posts/{id}
          method: get
          integration: lambda
          request:
            parameters:
              paths:
                id: true
              headers:
                custom-header:
                  required: true
                  mappedValue: context.requestId
```

AWS lists the values `mappedValue` accepts in [parameter mapping](https://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html).

## Request schema validators

To validate request bodies, add a [JSON Schema](https://json-schema.org/) for each content type under `request.schemas`. The Framework creates an API Gateway model and a request validator; requests whose body doesn't match get `400`. Content types without a schema aren't validated. API Gateway supports [JSON Schema draft 4](https://docs.aws.amazon.com/apigateway/latest/developerguide/models-mappings-models.html).

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          request:
            schemas:
              application/json: ${file(create_request.json)}
```

A sample `create_request.json`:

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": ["username"],
  "properties": {
    "username": { "type": "string", "pattern": "^[a-zA-Z0-9]+$" }
  }
}
```

To name the model, use the object form with `schema`, `name` and `description`:

```yaml
request:
  schemas:
    application/json:
      schema: ${file(create_request.json)}
      name: PostCreateModel
      description: 'Validation model for Creating Posts'
```

To reuse a model in several events, define it under `provider.apiGateway.request.schemas` and reference it by its key. Provider models are for the `application/json` content type:

```yaml
provider:
  name: aws
  apiGateway:
    request:
      schemas:
        post-create-model:
          name: PostCreateModel
          schema: ${file(api_schema/post_add_schema.json)}
          description: 'A Model validation for adding posts'

functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          request:
            schemas:
              application/json: post-create-model
```

## Response streaming

REST APIs can stream responses from proxy integrations. Set the `http` event's `response.transferMode` to `STREAM` (default: `BUFFERED`):

```yaml
functions:
  streamHandler:
    handler: handler.stream
    events:
      - http:
          path: stream
          method: get
          response:
            transferMode: STREAM
```

`transferMode` works with `lambda-proxy` and `http-proxy` only; with another integration the deploy stops with `Property "response.transferMode" is supported only with AWS_PROXY (Lambda proxy) or HTTP_PROXY integrations.` `STREAM` with `async: true` stops it with `Property "response.transferMode: STREAM" cannot be combined with "http.async"`. A Node.js function streams by wrapping its handler with `awslambda.streamifyResponse`; see [Response streaming for Lambda functions](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html).

With proxy integrations, the Framework keeps only `request.parameters`, `request.schemas` (and `request.uri` for `http-proxy`) and `response.transferMode`; it removes other `request` and `response` keys and prints a warning.

## Lambda integration

With `integration: lambda`, API Gateway transforms the request with a mapping template, invokes the function with the result, and maps the function's return value or error to the response. You configure the templates and status codes in `serverless.yml`.

### Request templates

The Framework adds request templates for `application/json` and `application/x-www-form-urlencoded`. Both build an event with these properties: `body`, `method`, `principalId`, `stage`, `cognitoPoolClaims`, `enhancedAuthContext`, `headers`, `query`, `path`, `identity`, `stageVariables` and `requestPath`. A shortened event:

```json
{
  "body": { "title": "Hello" },
  "method": "POST",
  "principalId": "",
  "stage": "dev",
  "cognitoPoolClaims": { "sub": "" },
  "enhancedAuthContext": {},
  "headers": { "Content-Type": "application/json" },
  "query": {},
  "path": { "id": "42" },
  "identity": { "sourceIp": "203.0.113.10" },
  "stageVariables": {},
  "requestPath": "/posts/{id}"
}
```

To add or replace templates, set `request.template` per content type. A template can also come from a file with `${file(template.vm)}`:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          method: get
          path: whatever
          integration: lambda
          request:
            template:
              text/xhtml: '{ "stage" : "$context.stage" }'
              application/json: '{ "httpMethod" : "$context.httpMethod" }'
```

To read a query string parameter, use `$input.params('name')`. In a single-quoted YAML string, double the inner single quotes:

```yaml
request:
  template:
    application/json: '{ "foo" : "$input.params(''bar'')" }'
```

A request to `/dev/whatever?bar=123` then gives the function `event.foo` set to `123`. To remove a default template, set it to `null`:

```yaml
request:
  template:
    application/x-www-form-urlencoded: null
```

### Pass-through behavior

`request.passThrough` sets what API Gateway does with a request whose `Content-Type` matches no template. The default is `NEVER` for the `lambda` integration; for `http` and `mock` the Framework sets none and API Gateway's default applies. A request without `Content-Type` counts as `application/json`.

| Value               | Passed through unchanged when      | Rejected with `415 Unsupported Media Type` when               |
| ------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `NEVER`             | Never                              | No template is defined, or `Content-Type` matches no template |
| `WHEN_NO_MATCH`     | `Content-Type` matches no template | Never                                                         |
| `WHEN_NO_TEMPLATES` | No template is defined             | Templates are defined, but `Content-Type` matches none        |

```yaml
request:
  passThrough: WHEN_NO_MATCH
```

AWS describes the options in [integration passthrough behaviors](https://docs.aws.amazon.com/apigateway/latest/developerguide/integration-passthrough-behaviors.html).

### Responses

`response.headers` sets response headers from integration response values or static values; API Gateway receives them as written, so a static value keeps its single quotes:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          method: get
          path: whatever
          integration: lambda
          response:
            headers:
              Content-Type: integration.response.header.Content-Type
              Cache-Control: "'max-age=120'"
```

`response.template` transforms the function's return value for `application/json`. This one returns the value as HTML:

```yaml
response:
  headers:
    Content-Type: "'text/html'"
  template: $input.path('$')
```

### Status codes

With the `lambda` integration, API Gateway picks the response status by matching the function's error message against a pattern per status code. The Framework adds these patterns:

| Status code                  | Selected when                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 200                          | The function returns without an error, or its error matches no other pattern (the default response) |
| 400, 401, 403, 404, 422, 502 | The error message contains `[<code>]`, such as `[404] Not found`                                    |
| 500                          | The error message contains `[500]` or `Process exited before completing request`                    |
| 504                          | The error message contains `[504]`, or ends with `Task timed out after <n> seconds`                 |

To return `404`, throw an error with `[404]` in its message:

```javascript
// handler.mjs
export const hello = async (event) => {
  throw new Error('[404] Not found')
}
```

An error whose message contains none of these patterns, such as `new Error('database unavailable')`, gets the default response, so API Gateway returns `200`. To return an error status, put one of the codes above in brackets in the message of every error the function throws, such as `[500] database unavailable`. See [Handle Lambda errors in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/handle-errors-in-lambda-integration.html).

To change the status codes, set `response.statusCodes`. Each code takes a `pattern` (a regular expression matched against the error message), and optionally `template` and `headers`. The code with `pattern: ''` is the default response; without one, the Framework adds `200` as the default:

```yaml
functions:
  create:
    handler: posts.create
    events:
      - http:
          method: post
          path: whatever
          integration: lambda
          response:
            headers:
              Content-Type: "'text/html'"
            template: $input.path('$')
            statusCodes:
              201:
                pattern: '' # Default response
              409:
                pattern: '.*"statusCode":409,.*' # JSON response
                template:
                  application/json: $input.path("$.errorMessage")
                  application/xml: $input.path("$.body.errorMessage")
                headers:
                  Content-Type: "'application/json+hal'"
```

A code's `template` is a string for `application/json`, or a map of content types.

## HTTP and HTTP proxy integrations

The `http` and `http-proxy` integrations send requests to an HTTP endpoint instead of a function. `request.uri` is required; without it the deploy stops with `You need to set the request uri when using the HTTP_PROXY integration.` (or `HTTP`). `request.method` sets the backend method (default: the event's `method`):

```yaml
functions:
  proxy:
    handler: handler.proxy
    events:
      - http:
          path: v1/repository
          method: get
          integration: http-proxy
          request:
            uri: https://api.example.com/v1/repository
            method: get
```

### Accessing private resources using VPC Link

To reach a backend in a VPC through a [VPC link](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-private-integration.html), set `connectionType: vpc-link` and the link's ID in `connectionId`. Without `connectionId`, the deploy stops with `You need to set connectionId when using VPC_LINK connectionType.`

```yaml
functions:
  proxy:
    handler: handler.proxy
    events:
      - http:
          path: v1/repository
          method: get
          integration: http-proxy
          connectionType: vpc-link
          connectionId: a1b2c3
          request:
            uri: http://internal.example.com/v1/repository
            method: get
```

## Mock integration

A `mock` integration answers from API Gateway without a backend, for example to stub an endpoint. The request template sets the status code and `response.statusCodes` maps it to a response:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
          integration: mock
          request:
            template:
              application/json: '{"statusCode": 200}'
          response:
            template: $input.path('$')
            statusCodes:
              201:
                pattern: ''
```

## Use an existing REST API

To add a service's endpoints to a REST API that another service or stack manages, set `provider.apiGateway.restApiId` and `restApiRootResourceId` (the ID of the API's `/` resource). `restApiRootResourceId` is required whenever `restApiId` is set; without it the deploy stops with `Missing required "provider.apiGateway.restApiRootResourceId" property (needed if "provider.apiGateway.restApiId" is provided)`:

```yaml
service: service-a

provider:
  name: aws
  apiGateway:
    restApiId: a1b2c3d4e5
    restApiRootResourceId: f6g7h8i9j0
    description: Some description # Optional: deployment description

functions:
  create:
    handler: posts.create
    events:
      - http:
          method: post
          path: /posts
```

The Framework creates the resources, methods and a deployment to the stage, but not the API. It doesn't change the stage's settings: `provider.tags`, `provider.stackTags` and `provider.apiGateway.metrics` aren't applied, and `provider.tracing.apiGateway` and `provider.logs.restApi` stop the deploy with an error.

The Framework creates a resource for each path segment from the root. When another service already created a parent path, CloudFormation can't create it again: list the existing resources in `restApiResources`, by path, with their IDs:

```yaml
service: service-b

provider:
  name: aws
  apiGateway:
    restApiId: a1b2c3d4e5
    restApiRootResourceId: f6g7h8i9j0
    restApiResources:
      /posts: k1l2m3n4o5

functions:
  createComment:
    handler: posts.createComment
    events:
      - http:
          method: post
          path: /posts/{id}/comments
```

### Share a REST API through stack exports

A service can create the REST API and export its IDs, and other services in the same Region import them with `Fn::ImportValue`:

```yaml
service: my-api

provider:
  name: aws
  runtime: nodejs24.x

resources:
  Resources:
    MyApiGW:
      Type: AWS::ApiGateway::RestApi
      Properties:
        Name: MyApiGW

  Outputs:
    apiGatewayRestApiId:
      Value:
        Ref: MyApiGW
      Export:
        Name: MyApiGateway-restApiId
    apiGatewayRestApiRootResourceId:
      Value:
        Fn::GetAtt:
          - MyApiGW
          - RootResourceId
      Export:
        Name: MyApiGateway-rootResourceId
```

```yaml
service: service-a

provider:
  name: aws
  apiGateway:
    restApiId:
      Fn::ImportValue: MyApiGateway-restApiId
    restApiRootResourceId:
      Fn::ImportValue: MyApiGateway-rootResourceId

functions:
  create:
    handler: posts.create
    events:
      - http:
          method: post
          path: /posts
```

Cross-stack exports work only within one Region; see [`Fn::ImportValue`](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/intrinsic-function-reference-importvalue.html). The same pattern shares a WebSocket API through `provider.apiGateway.websocketApiId`; see [WebSocket API events](./websocket.md#use-an-existing-websocket-api).

## Resource policy

A [resource policy](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html) controls who can invoke the API. Set its statements in `provider.apiGateway.resourcePolicy`:

```yaml
provider:
  name: aws
  apiGateway:
    resourcePolicy:
      - Effect: Allow
        Principal: '*'
        Action: execute-api:Invoke
        Resource:
          - execute-api:/*/*/*
        Condition:
          IpAddress:
            aws:SourceIp:
              - '203.0.113.0/24'
```

## Compression

To compress responses larger than a size, set `provider.apiGateway.minimumCompressionSize` in bytes, from 0 to 10485760. API Gateway then [compresses payloads](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-gzip-compression-decompression.html) for clients that accept a supported encoding:

```yaml
provider:
  name: aws
  apiGateway:
    minimumCompressionSize: 1024
```

## Binary media types

To return binary data such as images, list the content types API Gateway treats as binary in `provider.apiGateway.binaryMediaTypes`:

```yaml
provider:
  name: aws
  apiGateway:
    binaryMediaTypes:
      - '*/*'

functions:
  binaryExample:
    handler: binaryExample.handler
    events:
      - http:
          path: binary
          method: get
```

With `lambda-proxy`, the function sets the `Content-Type` header, returns the body base64-encoded and sets `isBase64Encoded`. This handler returns `image.jpg` from its own directory:

```javascript
// binaryExample.mjs
import { readFile } from 'node:fs/promises'

export const handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'image/jpeg' },
  body: (await readFile(new URL('./image.jpg', import.meta.url))).toString(
    'base64',
  ),
  isBase64Encoded: true,
})
```

## Detailed CloudWatch metrics

To turn on [detailed CloudWatch metrics](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html) for every method of the stage, set `provider.apiGateway.metrics`:

```yaml
provider:
  name: aws
  apiGateway:
    metrics: true
```

## AWS X-Ray tracing

To turn on [X-Ray active tracing](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-xray.html) for the stage, set `provider.tracing.apiGateway`:

```yaml
provider:
  name: aws
  tracing:
    apiGateway: true
```

With `provider.apiGateway.restApiId`, `tracing.apiGateway` stops the deploy with `When external API Gateway resource is imported via "provider.apiGateway.restApiId", property "provider.tracing.apiGateway" is ineffective.`

## Tags, stack tags

The Framework tags the REST API's stage with `provider.stackTags` and `provider.tags`; `tags` wins for a key in both. It removes stage tags that are in neither:

```yaml
provider:
  name: aws
  stackTags:
    stackTagKey: stackTagValue
  tags:
    tagKey: tagValue
```

## Logs

To turn on logging for the REST API's stage, set `provider.logs.restApi` to `true`:

```yaml
provider:
  name: aws
  logs:
    restApi: true
```

Without `logs.restApi`, the stage has no logging. With it, the Framework turns on access logs and execution logs. Access logs go to the log group `/aws/api-gateway/<service>-<stage>`, which keeps logs for `provider.logRetentionInDays` days when that is set. With `provider.apiGateway.restApiId`, `logs.restApi` stops the deploy with an error.

The object form changes these settings:

```yaml
provider:
  name: aws
  logs:
    restApi:
      level: ERROR
      format: '{ "requestId":"$context.requestId", "ip": "$context.identity.sourceIp" }'
      accessLogging: true
      executionLogging: true
      fullExecutionData: false
```

| Key                     | Default                      | Description                                                                                                                                |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `level`                 | `INFO`                       | Execution log level, `INFO` or `ERROR`. With `executionLogging: false`, the level is `OFF`.                                                |
| `format`                | The default below            | The [access log format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html).                                 |
| `accessLogging`         | `true`                       | Writes access logs to the log group.                                                                                                       |
| `executionLogging`      | `true`                       | Writes execution logs.                                                                                                                     |
| `fullExecutionData`     | `true`                       | Logs full request and response data in execution logs.                                                                                     |
| `role`                  | A role the Framework creates | The ARN of the IAM role API Gateway uses to write logs. See [CloudWatch role for API Gateway logs](#cloudwatch-role-for-api-gateway-logs). |
| `roleManagedExternally` | `false`                      | With `true`, the Framework doesn't set up the CloudWatch role.                                                                             |

The default access log format is:

```text
requestId: $context.requestId, ip: $context.identity.sourceIp, caller: $context.identity.caller, user: $context.identity.user, requestTime: $context.requestTime, httpMethod: $context.httpMethod, resourcePath: $context.resourcePath, status: $context.status, protocol: $context.protocol, responseLength: $context.responseLength
```

### CloudWatch role for API Gateway logs

API Gateway writes logs only with a [CloudWatch Logs role set for the account](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html), one per Region, shared by all APIs. With access logging on, the Framework sets it up with a custom resource:

- By default, the Framework creates the IAM role `serverlessApiGatewayCloudWatchRole` with the `AmazonAPIGatewayPushToCloudWatchLogs` managed policy if it doesn't exist, and sets it as the account's CloudWatch role in the Region, replacing the role set before. `serverless remove` keeps the role and the setting.
- With `role`, the Framework sets that role as the account's CloudWatch role, replacing the role set before:

  ```yaml
  provider:
    name: aws
    logs:
      restApi:
        role: arn:aws:iam::123456789012:role/ApiGatewayCloudWatchLogsRole
  ```

- With `roleManagedExternally: true`, the Framework leaves the setting alone; set the role yourself, for example in a separate account setup stack:

  ```yaml
  provider:
    name: aws
    logs:
      restApi:
        roleManagedExternally: true
  ```

The custom resource acts when the stack first creates it; a later change to `role` doesn't update the account setting. With `accessLogging: false`, the REST API logs don't add the custom resource, so the account needs a CloudWatch role set already, unless `provider.logs.websocket` adds the custom resource for WebSocket API logs. The custom resource's Lambda function runs with the role in `provider.iam.deploymentRole` when that is set. The same `restApi` settings control the role setup for [WebSocket API logs](./websocket.md#logs).

## Disable default endpoint

Clients can call the API at its `execute-api` URL. To allow calls only through a [custom domain](../guide/domains.md), set `provider.apiGateway.endpoint.disable` to `true`:

```yaml
provider:
  name: aws
  apiGateway:
    endpoint:
      disable: true
```

`provider.apiGateway.disableDefaultEndpoint` does the same; when both are set, `endpoint.disable` wins.

## API name and stage name

The Framework names the REST API `<stage>-<service>`. With `provider.apiGateway.shouldStartNameWithService: true`, the name is `<service>-<stage>`; `provider.apiName` sets the name and takes precedence.

The API Gateway stage has the service stage's name. To deploy to a stage with another name, set `provider.apiGateway.stage`:

```yaml
provider:
  name: aws
  apiGateway:
    stage: customStageName
```

`provider.apiGateway.description` sets the description of the REST API and of its deployments.

## Timeout

API Gateway's default integration timeout is 29 seconds. To change it for every `http` event, set `provider.apiGateway.timeoutInMillis`; to change one event, set its `timeoutInMillis`, which wins. Both are integers of at least 50:

```yaml
provider:
  name: aws
  endpointType: REGIONAL
  apiGateway:
    timeoutInMillis: 10000 # 10 seconds for all endpoints

functions:
  fetch:
    handler: handler.fetch
    events:
      - http:
          path: /posts/{id}
          method: get
  create:
    handler: handler.create
    events:
      - http:
          path: /posts
          method: post
          timeoutInMillis: 40000 # 40 seconds for this endpoint
```

Timeouts above 29 seconds need an increase of the integration timeout quota and are available only for `REGIONAL` and `PRIVATE` endpoint types; see [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html). The Framework prints a warning when a function's `timeout` is longer than the integration timeout of one of its `http` events.

## Security policy

A [security policy](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies.html) sets the TLS versions and ciphers the REST API's default endpoint accepts. AWS's default is `TLS_1_0` for edge-optimized and regional APIs and `TLS_1_2` for private APIs. To choose one, set `provider.apiGateway.endpoint.securityPolicy`:

```yaml
provider:
  name: aws
  apiGateway:
    endpoint:
      securityPolicy: SecurityPolicy_TLS13_2025_EDGE # TLS 1.3 only, edge-optimized APIs
      accessMode: strict
```

The policies depend on the endpoint type; AWS lists them in [supported security policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies-list.html):

- `TLS_1_0`: TLS 1.0 to 1.3, every endpoint type.
- `TLS_1_2`: TLS 1.2 and 1.3, regional and private APIs. Edge-optimized APIs don't accept it.
- Enhanced policies, starting with `SecurityPolicy_`: for example `SecurityPolicy_TLS13_2025_EDGE` (TLS 1.3, edge-optimized) and `SecurityPolicy_TLS13_1_3_2025_09` (TLS 1.3, regional and private).

### Endpoint access mode

An enhanced `SecurityPolicy_*` policy requires `endpoint.accessMode`:

- `basic`: API Gateway doesn't run the `strict` checks.
- `strict`: API Gateway rejects requests whose `Host` header doesn't match the TLS Server Name Indication, or that come through another endpoint type. AWS recommends `strict` when your clients allow it; see [endpoint access mode](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies.html#apigateway-security-policies-endpoint-access-mode).

A custom domain has its own security policy; see [Custom domains](../guide/domains.md#security-policy-and-access-mode).

## Related

- [REST API settings in the `serverless.yml` reference](../guide/serverless.yml.md#api-gateway-v1-rest-api)
- [HTTP API events](./http-api.md): the `httpApi` event and API Gateway v2.
- [Custom domains](../guide/domains.md)
- [WebSocket API events](./websocket.md)
