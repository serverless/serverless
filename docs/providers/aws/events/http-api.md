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

# API Gateway HTTP API

API Gateway lets you deploy HTTP APIs. It comes [in two versions](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html):

- v1, also called **REST API**
- v2, also called **HTTP API**, which is faster and cheaper than v1

Despite their confusing name, both versions allow deploying any HTTP API (like REST, GraphQL, etc.). Read the full comparison [in the AWS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html).

This guide documents using API Gateway **v2 HTTP API** via the `httpApi` event.

To use API Gateway **v1 REST API** instead, follow the [API Gateway REST API guide](apigateway.md).

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

One of the available ways to restrict access to configured HTTP API endpoints is to use JWT Authorizers.

_For deep details on that follow [AWS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)_

To ensure endpoints (as configured in `serverless.yml`) are backed with authorizers, follow below steps.

#### 1. Configure authorizers on `provider.httpApi.authorizers`

```yaml
provider:
  httpApi:
    authorizers:
      someJwtAuthorizer:
        type: jwt
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

### Lambda (Request) Authorizers

Another way to restrict access to your HTTP API endpoints is to use a custom Lambda Authorizers.

_For deep details on that follow [AWS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html)_

#### Using function from existing service as an authorizer

In order to use function that is a part of your `serverless.yml` service configuration as a custom authorizer, you have to first reference it by name when configuring your authorizer. In the following example, we have a function called `authorizerFunc` that is used to define `customAuthorizer` that is later used by function `hello` to restrict access to its endpoints.

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

#### Using function defined outside of your service as an authorizer

It is also possible to use an existing Lambda function as a custom authorizer. In order to do that, you have to reference it's ARN when configuring your authorizer. In the following example, `customAuthorizer` references external function and is later used by function `hello` to restrict access to its endpoints.

```yaml
provider:
  name: aws
  httpApi:
    authorizers:
      customAuthorizer:
        type: request
        functionArn: arn:aws:lambda:us-east-1:11111111111:function:external-authorizer

functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          method: get
          path: /hello
          authorizer:
            name: customAuthorizer
```

#### Detailed authorizer configuration

Examples presented above use minimal authorizer configuration. Below you can find all possible configuration options for custom authorizers.

- `type` - Should be set to `request` for custom Lambda authorizers.
- `name` - Optional. Custom name for created authorizer
- `functionName` - Name of function defined in the same service to be used as authorizer function. Cannot be defined when `functionArn` is set.
- `functionArn` - ARN of the function to be used as authorizer function. It accepts CloudFormation intrinsic functions. Cannot be defined when `functionName` is set.
- `resultTtlInSeconds` - Optional. Time to live for cached authorizer results, accepts values from 0 (no caching) to 3600 (1 hour). When set to non-zero value, `identitySource` must be defined as well.
- `enableSimpleResponses` - Optional. Flag that specifies if authorizer function will return authorization responses in simple format. Defaults to `false`.
- `payloadVersion` - Optional. Version of payload that will be sent to authorizer function. Defaults to `'2.0'`.
- `identitySource` - Optional. One or more mapping expressions of the request parameters in form of e.g `$request.header.Auth`. Specified values are verified to be non-empty and not null by authorizer. It is a required property when `resultTtlInSeconds` is non-zero as `identitySource` is additionally used as cache key for authorizer responses caching.
- `managedExternally` - Optional. Flag that specifies if the authorizer function is fully managed externally (e.g. exists in another AWS account). When that flag is set to `true`, creation of permission resource for the authorizer function will be skipped.

Below you can find configuration example with example values set.

```yaml
provider:
  name: aws
  httpApi:
    authorizers:
      customAuthorizer:
        type: request
        functionName: authorizerFunc # Mutually exclusive with `functionArn`
        functionArn: arn:aws:lambda:us-east-1:11111111111:function:external-authorizer # Mutually exclusive with `functionName`
        name: customAuthorizerName
        resultTtlInSeconds: 300
        enableSimpleResponses: true
        payloadVersion: '2.0'
        identitySource:
          - $request.header.Auth
          - $request.header.Authorization
        managedExternally: true # Applicable only when using externally defined authorizer functions to prevent creation of permission resource
```

### AWS IAM Authorization

It is also possible to secure your HTTP API endpoints by taking advantage of AWS IAM Policies.

_For deep details on that follow [AWS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html)_

In order to do that, you need to set `authorizer` with `type: aws_iam` on `httpApi` event, as seen on the example below:

```yaml
provider:
  name: aws

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

### Access logs

Deployed stage can have access logging enabled, for that just turn on logs for HTTP API in provider settings as follows:

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

It can be overridden via `format` setting:

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

You can use AWS Fn::ImportValue function as well to reference an HTTP API created within another Cloud Formation stack and whose id is exported.

```yaml
provider:
  httpApi:
    id:
      Fn::ImportValue: xxxx # name of the exported value representing the external HTTP API id
```

In such case no API and stage resources are created, therefore extending HTTP API with CORS, access logs settings or authorizers is not supported.

## Shared Authorizer

For external HTTP API you can use shared authorizer in similar manner to RestApi. When using shared Lambda custom authorizer, you need to set `type` to `request`. Example configuration could look like:

```yml
httpApi:
    id: xxxx # Required

functions:
  createUser:
     ...
    events:
      - httpApi:
          path: /users
          ...
          authorizer:
            # Type of referenced authorizer
            type: jwt
            # Provide authorizerId
            id:
              Ref: ApiGatewayAuthorizer  # or hard-code Authorizer ID
            scopes: # Optional - List of Oauth2 scopes
              - myapp/myscope

  deleteUser:
     ...
    events:
      - httpApi:
          path: /users/{userId}
          ...
          authorizer:
            # Type of referenced authorizer
            type: jwt
            # Provide authorizerId
            id:
              Ref: ApiGatewayAuthorizer  # or hard-code Authorizer ID
            scopes: # Optional - List of Oauth2 scopes
              - myapp/anotherscope

resources:
  Resources:
    ApiGatewayAuthorizer:
      Type: AWS::ApiGatewayV2::Authorizer
      Properties:
        ApiId:
          Ref: YourApiGatewayName
        AuthorizerType: JWT
        IdentitySource:
          - $request.header.Authorization
        JwtConfiguration:
          Audience:
            - Ref: YourCognitoUserPoolClientName
          Issuer:
            Fn::Join:
              - ""
              - - "https://cognito-idp."
                - "${opt:region, self:provider.region}"
                - ".amazonaws.com/"
                - Ref: YourCognitoUserPoolName
```

### Event / payload format

HTTP API offers only a 'proxy' option for Lambda integration where an event submitted to the function contains the details of HTTP request such as headers, query string parameters etc.
There are two formats for this event available (see [Working with AWS Lambda proxy integrations for HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)), with the default being 2.0. It is possible to downgrade to 1.0 version by specifying `payload`. The payload version could be configured globally as:

```yaml
provider:
  httpApi:
    payload: '1.0'
```

The payload version can also be specified at the function level with httpApi.payload property and it will take precedence over the payload version configured at the provider level. It can be configured as:

```yaml
functions:
  hello:
    handler: index.handler
    httpApi:
      payload: '1.0'
    events:
      - httpApi:
          path: /hello
          method: GET
```

### Detailed Metrics

With HTTP API we may configure detailed metrics that can be used setup monitoring and alerting in Cloudwatch.

Detailed Metrics can be turned on with:

```yaml
provider:
  httpApi:
    metrics: true
```

### Tags

When using HTTP API, it is possible to tag the corresponding API Gateway resources. By setting `provider.httpApi.useProviderTags` to `true`, all tags defined on `provider.tags` will be applied to API Gateway and API Gateway Stage.

```yaml
provider:
  tags:
    project: myProject
  httpApi:
    useProviderTags: true
```

In the above example, the tag project: myProject will be applied to API Gateway and API Gateway Stage.

_Note: If the API Gateway has any existing tags applied outside of Serverless Framework, they will be removed during deployment._

### Disable Default Endpoint

By default, clients can invoke your API with the default https://{api_id}.execute-api.{region}.amazonaws.com endpoint. To require that clients use a custom domain name to invoke your API, disable the default endpoint.

```yml
provider:
  httpApi:
    disableDefaultEndpoint: true
```

### Service Naming

You can use the `shouldStartNameWithService` option to change the naming scheme for HTTP API from the default `${stage}-${service}` to `${service}-${stage}`.

```yml
provider:
  httpApi:
    shouldStartNameWithService: true
```

## Custom domains

API Gateway generates URLs for HTTP APIs in the following format:

```
https://<random>.execute-api.<region>.amazonaws.com/
```

It is possible to replace those URLs by a custom domain.

Step 1, create an HTTPS certificate in AWS ACM:

- Open [AWS ACM](https://console.aws.amazon.com/acm/home) (AWS Certificate Manager)
- Switch to the region of your application
- Click "Request a certificate"
- Select "Request a public certificate" and continue
- Add your domain and continue
- Choose the domain validation of your choice:
  - Email validation will require you to click a link you will receive in an email sent to admin@your-domain.com
  - Domain validation will require you to add CNAME entries to your DNS configuration
- Validate the domain via the method chosen above

Step 2, set up the custom domain in API Gateway:

- Open [API Gateway's "Custom Domain" configuration](https://console.aws.amazon.com/apigateway/main/publish/domain-names)
- Switch to the region of your application
- Click "Create"
- Enter your domain name, select the certificate you created above and validate the page
- After the domain is created, click the "API mappings" tab
- Click "Configure API mappings" and "Add new mapping"
- Select your HTTP API and the `$default` stage
- Click "Save"

Step 3, configure the DNS of the domain:

- If using Route53:
  - Open the Hosted Zone in the [Route53 console](https://console.aws.amazon.com/route53/v2/hostedzones)
  - Click "Create record"
  - Select "Record type" of type "A"
  - "Route traffic to": select "Alias", and then select your API Gateway
  - Finish the record creation
- If using any other domain registrar
  - Open the "Configurations" tab on the custom domain name you just created
  - Note the "API Gateway domain name" which should look like this: `d-1234567890.execute-api.us-east-1.amazonaws.com`
  - Create a CNAME entry to point your domain name to the API Gateway domain

Once a custom domain is set up, you can [disable the default API Gateway endpoint](#disable-default-endpoint):

```yaml
provider:
  httpApi:
    disableDefaultEndpoint: true
```
