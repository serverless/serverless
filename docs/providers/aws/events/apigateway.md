<!--
title: Serverless Framework - AWS Lambda Events - API Gateway
menuText: API Gateway
menuOrder: 1
description: Setting up AWS API Gateway Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/apigateway)

<!-- DOCS-SITE-LINK:END -->

# API Gateway

- [API Gateway](#api-gateway)
  - [Lambda Proxy Integration](#lambda-proxy-integration)
    - [Simple HTTP Endpoint](#simple-http-endpoint)
    - [Example "LAMBDA-PROXY" event (default)](#example-lambda-proxy-event-default)
    - [HTTP Endpoint with Extended Options](#http-endpoint-with-extended-options)
    - [Enabling CORS](#enabling-cors)
    - [HTTP Endpoints with `AWS_IAM` Authorizers](#http-endpoints-with-aws_iam-authorizers)
    - [HTTP Endpoints with Custom Authorizers](#http-endpoints-with-custom-authorizers)
    - [HTTP Endpoints with `operationId`](#http-endpoints-with-operationId)
    - [Catching Exceptions In Your Lambda Function](#catching-exceptions-in-your-lambda-function)
    - [Setting API keys for your Rest API](#setting-api-keys-for-your-rest-api)
    - [Configuring endpoint types](#configuring-endpoint-types)
    - [Request Parameters](#request-parameters)
    - [Request Schema Validators](#request-schema-validators)
    - [Setting source of API key for metering requests](#setting-source-of-api-key-for-metering-requests)
  - [Lambda Integration](#lambda-integration)
    - [Example "LAMBDA" event (before customization)](#example-lambda-event-before-customization)
    - [Request templates](#request-templates)
      - [Default Request Templates](#default-request-templates)
      - [Custom Request Templates](#custom-request-templates)
      - [Pass Through Behavior](#pass-through-behavior)
    - [Responses](#responses)
      - [Custom Response Headers](#custom-response-headers)
      - [Custom Response Templates](#custom-response-templates)
    - [Status Codes](#status-codes)
      - [Available Status Codes](#available-status-codes)
      - [Using Status Codes](#using-status-codes)
      - [Custom Status Codes](#custom-status-codes)
  - [Setting an HTTP Proxy on API Gateway](#setting-an-http-proxy-on-api-gateway)
  - [Accessing private resources using VPC Link](#accessing-private-resources-using-vpc-link)
  - [Mock Integration](#mock-integration)
  - [Share API Gateway and API Resources](#share-api-gateway-and-api-resources)
    - [Easiest and CI/CD friendly example of using shared API Gateway and API Resources.](#easiest-and-cicd-friendly-example-of-using-shared-api-gateway-and-api-resources)
    - [Manually Configuring shared API Gateway](#manually-configuring-shared-api-gateway)
      - [Note while using authorizers with shared API Gateway](#note-while-using-authorizers-with-shared-api-gateway)
  - [Share Authorizer](#share-authorizer)
  - [Resource Policy](#resource-policy)
  - [Compression](#compression)
  - [Binary Media Types](#binary-media-types)
  - [Detailed CloudWatch Metrics](#detailed-cloudwatch-metrics)
  - [AWS X-Ray Tracing](#aws-x-ray-tracing)
  - [Tags / Stack Tags](#tags--stack-tags)
  - [Logs](#logs)

_Are you looking for tutorials on using API Gateway? Check out the following resources:_

> - [Add a custom domain for your API Gateway](https://serverless.com/blog/serverless-api-gateway-domain/)
> - [Deploy multiple micro-services under the same domain](https://serverless.com/blog/api-gateway-multiple-services/)
> - [Create a Node REST API with Express.js](https://serverless.com/blog/serverless-express-rest-api/)
> - [Make a Serverless GraphQL API](https://serverless.com/blog/make-serverless-graphql-api-using-lambda-dynamodb/)

To create HTTP endpoints as Event sources for your AWS Lambda Functions, use the Serverless Framework's easy AWS API Gateway Events syntax.

There are five ways you can configure your HTTP endpoints to integrate with your AWS Lambda Functions:

- `lambda-proxy` / `aws-proxy` / `aws_proxy` (Recommended)
- `lambda` / `aws`
- `http`
- `http-proxy` / `http_proxy`
- `mock`

**The Framework uses the `lambda-proxy` method (i.e., everything is passed into your Lambda) by default unless another method is supplied by the user**

The difference between these is `lambda-proxy` (alternative writing styles are `aws-proxy` and `aws_proxy` for compatibility with the standard AWS integration type naming) automatically passes the content of the HTTP request into your AWS Lambda function (headers, body, etc.) and allows you to configure your response (headers, status code, body) in the code of your AWS Lambda Function. Whereas, the `lambda` method makes you explicitly define headers, status codes, and more in the configuration of each API Gateway Endpoint (not in code). We highly recommend using the `lambda-proxy` method if it supports your use-case, since the `lambda` method is highly tedious.

Use `http` for integrating with an HTTP back end, `http-proxy` for integrating with the HTTP proxy integration or `mock` for testing without actually invoking the back end.

## Lambda Proxy Integration

### Simple HTTP Endpoint

This setup specifies that the `hello` function should be run when someone accesses the API gateway at `hello` via
a `GET` request.

Here's an example:

```yml
# serverless.yml

functions:
  index:
    handler: handler.hello
    events:
      - http: GET hello
```

```javascript
// handler.js

'use strict';

module.exports.hello = function (event, context, callback) {
  console.log(event); // Contains incoming request data (e.g., query params, headers and more)

  const response = {
    statusCode: 200,
    headers: {
      'x-custom-header': 'My Header Value',
    },
    body: JSON.stringify({ message: 'Hello World!' }),
  };

  callback(null, response);
};
```

**Note:** When the body is a JSON-Document, you must parse it yourself:

```
JSON.parse(event.body);
```

### Example "LAMBDA-PROXY" event (default)

```json
{
  "resource": "/",
  "path": "/",
  "httpMethod": "POST",
  "headers": {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-GB,en-US;q=0.8,en;q=0.6,zh-CN;q=0.4",
    "cache-control": "max-age=0",
    "CloudFront-Forwarded-Proto": "https",
    "CloudFront-Is-Desktop-Viewer": "true",
    "CloudFront-Is-Mobile-Viewer": "false",
    "CloudFront-Is-SmartTV-Viewer": "false",
    "CloudFront-Is-Tablet-Viewer": "false",
    "CloudFront-Viewer-Country": "GB",
    "content-type": "application/x-www-form-urlencoded",
    "Host": "j3ap25j034.execute-api.eu-west-2.amazonaws.com",
    "origin": "https://j3ap25j034.execute-api.eu-west-2.amazonaws.com",
    "Referer": "https://j3ap25j034.execute-api.eu-west-2.amazonaws.com/dev/",
    "upgrade-insecure-requests": "1",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
    "Via": "2.0 a3650115c5e21e2b5d133ce84464bea3.cloudfront.net (CloudFront)",
    "X-Amz-Cf-Id": "0nDeiXnReyHYCkv8cc150MWCFCLFPbJoTs1mexDuKe2WJwK5ANgv2A==",
    "X-Amzn-Trace-Id": "Root=1-597079de-75fec8453f6fd4812414a4cd",
    "X-Forwarded-For": "50.129.117.14, 50.112.234.94",
    "X-Forwarded-Port": "443",
    "X-Forwarded-Proto": "https"
  },
  "queryStringParameters": null,
  "pathParameters": null,
  "stageVariables": null,
  "requestContext": {
    "path": "/dev/",
    "accountId": "125002137610",
    "resourceId": "qdolsr1yhk",
    "stage": "dev",
    "requestId": "0f2431a2-6d2f-11e7-b799-5152aa497861",
    "identity": {
      "cognitoIdentityPoolId": null,
      "accountId": null,
      "cognitoIdentityId": null,
      "caller": null,
      "apiKey": "",
      "sourceIp": "50.129.117.14",
      "accessKey": null,
      "cognitoAuthenticationType": null,
      "cognitoAuthenticationProvider": null,
      "userArn": null,
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
      "user": null
    },
    "resourcePath": "/",
    "httpMethod": "POST",
    "apiId": "j3azlsj0c4"
  },
  "body": "postcode=LS17FR",
  "isBase64Encoded": false
}
```

### HTTP Endpoint with Extended Options

Here we've defined an POST endpoint for the path `posts/create`.

```yml
# serverless.yml

functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
```

### Enabling CORS

To set CORS configurations for your HTTP endpoints, simply modify your event configurations as follows:

```yml
# serverless.yml

functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
          cors: true
```

Setting `cors` to `true` assumes a default configuration which is equivalent to:

```yml
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
            allowCredentials: false
```

To allow multiple origins, you can use the following configuration and provide an array in the `origins` or use comma separated `origin` field:

```yml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
          cors:
            origins:
              - http://example.com
              - http://example2.com
            headers:
              - Content-Type
              - X-Amz-Date
              - Authorization
              - X-Api-Key
              - X-Amz-Security-Token
              - X-Amz-User-Agent
            allowCredentials: false
```

Wildcards are accepted. The following example will match all sub-domains of example.com over http:

```yml
cors:
  origins:
    - http://*.example.com
    - http://example2.com
```

Please note that since you can't send multiple values for [Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin), this configuration uses a response template to check if the request origin matches one of your provided `origins` and overrides the header with the following code:

```
#set($origin = $input.params("Origin")
#if($origin == "http://example.com" || $origin == "http://*.amazonaws.com") #set($context.responseOverride.header.Access-Control-Allow-Origin = $origin) #end
```

Configuring the `cors` property sets [Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin), [Access-Control-Allow-Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Headers), [Access-Control-Allow-Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Methods),[Access-Control-Allow-Credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials) headers in the CORS preflight response.

If you use the lambda integration, the Access-Control-Allow-Origin and Access-Control-Allow-Credentials will also be provided to the method and integration responses.

Please note that the [Access-Control-Allow-Credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials)-Header is omitted when not explicitly set to `true`.

To enable the `Access-Control-Max-Age` preflight response header, set the `maxAge` property in the `cors` object:

```yml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
          cors:
            origin: '*'
            maxAge: 86400
```

If you are using CloudFront or another CDN for your API Gateway, you may want to setup a `Cache-Control` header to allow for OPTIONS request to be cached to avoid the additional hop.

To enable the `Cache-Control` header on preflight response, set the `cacheControl` property in the `cors` object:

```yml
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
            allowCredentials: false
            cacheControl: 'max-age=600, s-maxage=600, proxy-revalidate' # Caches on browser and proxy for 10 minutes and doesnt allow proxy to serve out of date content
```

CORS header accepts single value too

```yml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
          cors:
            headers: '*'
```

If you want to use CORS with the lambda-proxy integration, remember to include the `Access-Control-Allow-*` headers in your headers object, like this:

```javascript
// handler.js

'use strict';

module.exports.hello = function (event, context, callback) {
  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
      'Access-Control-Allow-Credentials': true, // Required for cookies, authorization headers with HTTPS
    },
    body: JSON.stringify({ message: 'Hello World!' }),
  };

  callback(null, response);
};
```

### HTTP Endpoints with `AWS_IAM` Authorizers

If you want to require that the caller submit the IAM user's access keys in order to be authenticated to invoke your Lambda Function, set the authorizer to `AWS_IAM` as shown in the following example:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer: aws_iam
```

Which is the short hand notation for:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            type: aws_iam
```

### HTTP Endpoints with Custom Authorizers

Custom Authorizers allow you to run an AWS Lambda Function before your targeted AWS Lambda Function. This is useful for Microservice Architectures or when you simply want to do some Authorization before running your business logic.

You can enable Custom Authorizers for your HTTP endpoint by setting the Authorizer in your `http` event to another function
in the same service, as shown in the following example:

```yml
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

Or, if you want to configure the Authorizer with more options, you can turn the `authorizer` property into an object as
shown in the following example:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            name: authorizerFunc
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
            identityValidationExpression: someRegex
            type: token
  authorizerFunc:
    handler: handler.authorizerFunc
```

If the Authorizer function does not exist in your service but exists in AWS, you can provide the ARN of the Lambda
function instead of the function name, as shown in the following example:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer: xxx:xxx:Lambda-Name
```

Or, if you want to configure the Authorizer with more options, you can turn the `authorizer` property into an object as
shown in the following example:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            arn: xxx:xxx:Lambda-Name
            managedExternally: false
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
            identityValidationExpression: someRegex
```

If permissions for the Authorizer function are managed externally (for example, if the Authorizer function exists
in a different AWS account), you can skip creating the permission for the function by setting `managedExternally: true`,
as shown in the following example:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            arn: xxx:xxx:Lambda-Name
            managedExternally: true
```

**IMPORTANT NOTE**: The permission allowing the authorizer function to be called by API Gateway must exist
before deploying the stack, otherwise deployment will fail.

You can also use the Request Type Authorizer by setting the `type` property. In this case, your `identitySource` could contain multiple entries for your policy cache. The default `type` is 'token'.

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            arn: xxx:xxx:Lambda-Name
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization, context.identity.sourceIp
            identityValidationExpression: someRegex
            type: request
```

You can also configure an existing Cognito User Pool as the authorizer, as shown
in the following example with optional access token allowed scopes:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer:
            arn: arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ
            scopes:
              - my-app/read
```

If you are using the default `lambda-proxy` integration, your attributes will be
exposed at `event.requestContext.authorizer.claims`.

If you want more control over which attributes are exposed as claims you
can switch to `integration: lambda` and add the following configuration. The
claims will be exposed at `events.cognitoPoolClaims`.

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          integration: lambda
          authorizer:
            arn: arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ
            claims:
              - email
              - nickname
```

If you are creating the Cognito User Pool in the `resources` section of the same template, you can refer to the ARN using the `Fn::GetAtt` attribute from CloudFormation. To do so, you _must_ give your authorizer a name and specify a type of `COGNITO_USER_POOLS`:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          integration: lambda
          authorizer:
            name: MyAuthorizer
            type: COGNITO_USER_POOLS
            arn:
              Fn::GetAtt:
                - CognitoUserPool
                - Arn
---
resources:
  Resources:
    CognitoUserPool:
      Type: 'AWS::Cognito::UserPool'
      Properties: ...
```

### HTTP Endpoints with `operationId`

Include `operationId` when you want to provide a name for the method endpoint. This will set `OperationName` inside `AWS::ApiGateway::Method` accordingly. One common use case for this is customizing method names in some code generators (e.g., swagger).

```yml
functions:
  create:
    handler: users.create
    events:
      - http:
          path: users/create
          method: post
          operationId: createUser
```

### Using asynchronous integration

Use `async: true` when integrating a lambda function using [event invocation](https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html#SSS-Invoke-request-InvocationType). This lets API Gateway to return immediately with a 200 status code while the lambda continues running. If not otherwise specified integration type will be `AWS`.

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          async: true # default is false
```

### Catching Exceptions In Your Lambda Function

In case an exception is thrown in your lambda function AWS will send an error message with `Process exited before completing request`. This will be caught by the regular expression for the 500 HTTP status and the 500 status will be returned.

### Setting API keys for your Rest API

You can specify a list of API keys to be used by your service Rest API by adding an `apiKeys` array property to the `provider.apiGateway` object in `serverless.yml`. You'll also need to explicitly specify which endpoints are `private` and require one of the api keys to be included in the request by adding a `private` boolean property to the `http` event object you want to set as private. API Keys are created globally, so if you want to deploy your service to different stages make sure your API key contains a stage variable as defined below. When using API keys, you can optionally define usage plan quota and throttle, using `usagePlan` object.

When setting the value, you need to be aware that changing value will require replacement and CloudFormation doesn't allow
two API keys with the same name. It means that you need to change the name also when changing the value. If you don't care
about the name of the key, it is recommended only to set the value and let CloudFormation name the key.

Here's an example configuration for setting API keys for your service Rest API:

```yml
service: my-service
provider:
  name: aws
  apiGateway:
    apiKeys:
      - myFirstKey
      - ${opt:stage}-myFirstKey
      - ${env:MY_API_KEY} # you can hide it in a serverless variable
      - name: myThirdKey
        value: myThirdKeyValue
      - value: myFourthKeyValue # let cloudformation name the key (recommended when setting api key value)
        description: Api key description # Optional
        customerId: A string that will be set as the customerID for the key # Optional
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
    events:
      - http:
          path: user/create
          method: get
          private: true
```

Please note that those are the API keys names, not the actual values. Once you deploy your service, the value of those API keys will be auto generated by AWS and printed on the screen for you to use. The values can be concealed from the output with the `--conceal` deploy option.

Clients connecting to this Rest API will then need to set any of these API keys values in the `x-api-key` header of their request. This is only necessary for functions where the `private` property is set to true.

You can also setup multiple usage plans for your API. In this case you need to map your usage plans to your api keys. Here's an example how this might look like:

```yml
service: my-service
provider:
  name: aws
  apiGateway:
    apiKeys:
      - free:
          - myFreeKey
          - ${opt:stage}-myFreeKey
      - paid:
          - myPaidKey
          - ${opt:stage}-myPaidKey
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
functions:
  hello:
    events:
      - http:
          path: user/create
          method: get
          private: true
```

### Configuring endpoint types

API Gateway [supports regional endpoints](https://aws.amazon.com/about-aws/whats-new/2017/11/amazon-api-gateway-supports-regional-api-endpoints/) for associating your API Gateway REST APIs with a particular region. This can reduce latency if your requests originate from the same region as your REST API and can be helpful in building multi-region applications.

By default, the Serverless Framework deploys your REST API using the EDGE endpoint configuration. If you would like to use the REGIONAL or PRIVATE configuration, set the `endpointType` parameter in your `provider` block.

Here's an example configuration for setting the endpoint configuration for your service Rest API:

```yml
service: my-service
provider:
  name: aws
  endpointType: REGIONAL
functions:
  hello:
    events:
      - http:
          path: user/create
          method: get
```

API Gateway also supports the association of VPC endpoints if you have an API Gateway REST API using the PRIVATE endpoint configuration. This feature simplifies the invocation of a private API through the generation of the following AWS Route 53 alias:

```
https://<rest_api_id>-<vpc_endpoint_id>.execute-api.<aws_region>.amazonaws.com
```

Here's an example configuration:

```yml
service: my-service
provider:
  name: aws
  endpointType: PRIVATE
  vpcEndpointIds:
    - vpce-123
    - vpce-456
```

### Request Parameters

To pass optional and required parameters to your functions, so you can use them in API Gateway tests and SDK generation, marking them as `true` will make them required, `false` will make them optional.

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          request:
            parameters:
              querystrings:
                url: true
              headers:
                foo: false
              paths:
                bar: false
```

In order for path variables to work, API Gateway also needs them in the method path itself, like so:

```yml
functions:
  create:
    handler: posts.post_detail
    events:
      - http:
          path: posts/{id}
          method: get
          request:
            parameters:
              paths:
                id: true
```

To map different values for request parameters, define the `required` and `mappedValue` properties of the request parameter.

```yml
functions:
  create:
    handler: posts.post_detail
    events:
      - http:
          path: posts/{id}
          method: get
          request:
            parameters:
              paths:
                id: true
              headers:
                custom-header:
                  required: true
                  mappedValue: context.requestId
```

For a list of acceptable values, see the [AWS Documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html)

### Request Schema Validators

To use request schema validation with API gateway, add the [JSON Schema](https://json-schema.org/)
for your content type. Since JSON Schema is represented in JSON, it's easier to include it from a
file.

```yml
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

In addition, you can also customize created model with `name` and `description` properties.

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          request:
            schemas:
              application/json:
                schema: ${file(create_request.json)}
                name: PostCreateModel
                description: 'Validation model for Creating Posts'
```

To reuse the same model across different events, you can define global models on provider level.
In order to define global model you need to add its configuration to `provider.apiGateway.request.schemas`.
After defining a global model, you can use it in the event by referencing it by the key. Provider models are created for `application/json` content type.

```yml
provider:
    ...
    apiGateway:
      request:
        schemas:
          post-create-model:
            name: PostCreateModel
            schema: ${file(api_schema/post_add_schema.json)}
            description: "A Model validation for adding posts"

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

A sample schema contained in `create_request.json` might look something like this:

```json
{
  "definitions": {},
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "title": "The Root Schema",
  "required": ["username"],
  "properties": {
    "username": {
      "type": "string",
      "title": "The Foo Schema",
      "default": "",
      "pattern": "^[a-zA-Z0-9]+$"
    }
  }
}
```

**NOTE:** schema validators are only applied to content types you specify. Other content types are
not blocked. Currently, API Gateway [supports](https://docs.aws.amazon.com/apigateway/latest/developerguide/models-mappings.html) JSON Schema draft-04.

### Setting source of API key for metering requests

API Gateway provide a feature for metering your API's requests and you can choice [the source of key](https://docs.aws.amazon.com/apigateway/api-reference/resource/rest-api/#apiKeySource) which is used for metering. If you want to acquire that key from the request's X-API-Key header, set option like this:

```yml
service: my-service
provider:
  name: aws
  apiGateway:
    apiKeySourceType: HEADER
functions:
  hello:
    events:
      - http:
          path: hello
          method: get
```

Another option is AUTHORIZER. If you set this, API Gateway will acquire that key from UsageIdentifierKey which is provided by custom authorizer.

```yml
service: my-service
provider:
  name: aws
  apiGateway:
    apiKeySourceType: AUTHORIZER
functions:
  hello:
    events:
      - http:
          path: hello
          method: get
```

## Lambda Integration

This method is more complicated and involves a lot more configuration of the `http` event syntax.

### Example "LAMBDA" event (before customization)

**Refer to this only if you're using the non-default `LAMBDA` integration method**

```json
{
  "body": {},
  "method": "GET",
  "principalId": "",
  "stage": "dev",
  "cognitoPoolClaims": {
    "sub": ""
  },
  "enhancedAuthContext": {},
  "headers": {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-GB,en-US;q=0.8,en;q=0.6,zh-CN;q=0.4",
    "CloudFront-Forwarded-Proto": "https",
    "CloudFront-Is-Desktop-Viewer": "true",
    "CloudFront-Is-Mobile-Viewer": "false",
    "CloudFront-Is-SmartTV-Viewer": "false",
    "CloudFront-Is-Tablet-Viewer": "false",
    "CloudFront-Viewer-Country": "GB",
    "Host": "ec5ycylws8.execute-api.us-east-1.amazonaws.com",
    "upgrade-insecure-requests": "1",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
    "Via": "2.0 f165ce34daf8c0da182681179e863c24.cloudfront.net (CloudFront)",
    "X-Amz-Cf-Id": "l06CAg2QsrALeQcLAUSxGXbm8lgMoMIhR2AjKa4AiKuaVnnGsOFy5g==",
    "X-Amzn-Trace-Id": "Root=1-5970ef20-3e249c0321b2eef14aa513ae",
    "X-Forwarded-For": "94.117.120.169, 116.132.62.73",
    "X-Forwarded-Port": "443",
    "X-Forwarded-Proto": "https"
  },
  "query": {},
  "path": {},
  "identity": {
    "cognitoIdentityPoolId": "",
    "accountId": "",
    "cognitoIdentityId": "",
    "caller": "",
    "apiKey": "",
    "sourceIp": "94.197.120.169",
    "accessKey": "",
    "cognitoAuthenticationType": "",
    "cognitoAuthenticationProvider": "",
    "userArn": "",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36",
    "user": ""
  },
  "stageVariables": {},
  "requestPath": "/request/path"
}
```

### Request templates

#### Default Request Templates

Serverless ships with the following default request templates you can use out of the box:

1. `application/json`
2. `application/x-www-form-urlencoded`

Both templates give you access to the following properties you can access with the help of the `event` object:

- body
- method
- principalId
- stage
- headers
- queryStringParameters
- path
- identity
- stageVariables
- requestPath

#### Custom Request Templates

However you can define and use your own request templates as follows (you can even overwrite the default request templates
by defining a new request template for an existing content type):

```yml
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

**Note:** The templates are defined as plain text here. However you can also reference an external file with the help of the `${file(templatefile)}` syntax.

**Note 2:** In .yml, strings containing `:`, `{`, `}`, `[`, `]`, `,`, `&`, `*`, `#`, `?`, `|`, `-`, `<`, `>`, `=`, `!`, `%`, `@`, `` ` `` must be quoted.

If you want to map querystrings to the event object, you can use the `$input.params('hub.challenge')` syntax from API Gateway, as follows:

```yml
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
              application/json: '{ "foo" : "$input.params(''bar'')" }'
```

**Note:** Notice when using single-quoted strings, any single quote `'` inside its contents must be doubled (`''`) to escape it.
You can then access the query string `https://example.com/dev/whatever?bar=123` by `event.foo` in the lambda function.
If you want to spread a string into multiple lines, you can use the `>` or `|` syntax, but the following strings have to be all indented with the same amount, [read more about `>` syntax](http://stackoverflow.com/questions/3790454/in-yaml-how-do-i-break-a-string-over-multiple-lines).

In order to remove one of the default request templates you just need to pass it as null, as follows:

```yml
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
              application/x-www-form-urlencoded: null
```

#### Pass Through Behavior

[API Gateway](https://serverless.com/amazon-api-gateway/) provides multiple ways to handle requests where the Content-Type header does not match any of the specified mapping templates. When this happens, the request payload will either be passed through the integration request _without transformation_ or rejected with a `415 - Unsupported Media Type`, depending on the configuration.

You can define this behaviour as follows (if not specified, a value of **NEVER** will be used):

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          method: get
          path: whatever
          integration: lambda
          request:
            passThrough: NEVER
```

There are 3 available options:

| Value             | Passed Through When                          | Rejected When                                                          |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| NEVER             | Never                                        | No templates defined or Content-Type does not match a defined template |
| WHEN_NO_MATCH     | Content-Type does not match defined template | Never                                                                  |
| WHEN_NO_TEMPLATES | No templates were defined                    | One or more templates defined, but Content-Type does not match         |

See the [api gateway documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/integration-passthrough-behaviors.html) for detailed descriptions of these options.

**Notes:**

- A missing/empty request Content-Type is considered to be the API Gateway default (`application/json`)
- API Gateway docs refer to "WHEN_NO_TEMPLATE" (singular), but this will fail during creation as the actual value should be "WHEN_NO_TEMPLATES" (plural)

### Responses

Serverless lets you setup custom headers and a response template for your `http` event.

#### Custom Response Headers

Here's an example which shows you how you can setup a custom response header:

```yml
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

**Note:** You're able to use the [integration response variables](http://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html#mapping-response-parameters)
for your header values. Headers are passed to API Gateway exactly like you define them. Passing the `Cache-Control` header
as `"'max-age=120'"` means API Gateway will receive the value as `'max-age=120'` (enclosed with single quotes).

#### Custom Response Templates

Sometimes you'll want to define a custom response template API Gateway should use to transform your lambdas output.
Here's an example which will transform the return value of your lambda so that the browser renders it as HTML:

```yml
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
              Content-Type: "'text/html'"
            template: $input.path('$')
```

**Note:** The template is defined as plain text here. However you can also reference an external file with the help of
the `${file(templatefile)}` syntax.

### Status Codes

Serverless ships with default status codes you can use to e.g. signal that a resource could not be found (404) or that
the user is not authorized to perform the action (401). Those status codes are regex definitions that will be added to your API Gateway configuration.

**_Note:_** Status codes as documented in this chapter relate to `lambda` integration method (as documented at the top of this page). If using default integration method `lambda-proxy` object with status code and message should be returned as in the example below:

```javascript
module.exports.hello = (event, context, callback) => {
  callback(null, { statusCode: 404, body: 'Not found', headers: { 'Content-Type': 'text/plain' } });
};
```

#### Available Status Codes

| Status Code | Meaning               |
| ----------- | --------------------- |
| 400         | Bad Request           |
| 401         | Unauthorized          |
| 403         | Forbidden             |
| 404         | Not Found             |
| 422         | Unprocessable Entity  |
| 500         | Internal Server Error |
| 502         | Bad Gateway           |
| 504         | Gateway Timeout       |

#### Using Status Codes

To return a given status code you simply need to add square brackets with the status code of your choice to your
returned message like this: `[401] You are not authorized to access this resource!`.

Here's an example which shows you how you can raise a 404 HTTP status from within your lambda function.

```javascript
module.exports.hello = (event, context, callback) => {
  callback(new Error('[404] Not found'));
};
```

#### Custom Status Codes

You can override the defaults status codes supplied by Serverless. You can use this to change the default status code, add/remove status codes, or change the templates and headers used for each status code. Use the pattern key to change the selection process that dictates what code is returned.

If you specify a status code with a pattern of '' that will become the default response code. See below on how to change the default to 201 for post requests.

If you omit any default status code. A standard default 200 status code will be generated for you.

```yml
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
                pattern: '' # Default response method
              409:
                pattern: '.*"statusCode":409,.*' # JSON response
                template: $input.path("$.errorMessage") # JSON return object
                headers:
                  Content-Type: "'application/json+hal'"
```

You can also create varying response templates for each code and content type by creating an object with the key as the content type

```yml
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
                pattern: '' # Default response method
              409:
                pattern: '.*"statusCode":409,.*' # JSON response
                template:
                  application/json: $input.path("$.errorMessage") # JSON return object
                  application/xml: $input.path("$.body.errorMessage") # XML return object
                headers:
                  Content-Type: "'application/json+hal'"
```

## Setting an HTTP Proxy on API Gateway

To set up an HTTP proxy, you'll need two CloudFormation templates, one for the endpoint (known as resource in CF), and
one for method. These two templates will work together to construct your proxy. So if you want to set `your-app.com/serverless` as a proxy for `serverless.com`, you'll need the following two templates in your `serverless.yml`:

```yml
service: service-name
provider: aws
functions: ...

resources:
  Resources:
    ProxyResource:
      Type: AWS::ApiGateway::Resource
      Properties:
        ParentId:
          Fn::GetAtt:
            - ApiGatewayRestApi # our default Rest API logical ID
            - RootResourceId
        PathPart: serverless # the endpoint in your API that is set as proxy
        RestApiId:
          Ref: ApiGatewayRestApi
    ProxyMethod:
      Type: AWS::ApiGateway::Method
      Properties:
        ResourceId:
          Ref: ProxyResource
        RestApiId:
          Ref: ApiGatewayRestApi
        HttpMethod: GET # the method of your proxy. Is it GET or POST or ... ?
        MethodResponses:
          - StatusCode: 200
        Integration:
          IntegrationHttpMethod: POST
          Type: HTTP
          Uri: http://serverless.com # the URL you want to set a proxy to
          IntegrationResponses:
            - StatusCode: 200
```

There's a lot going on in these two templates, but all you need to know to set up a simple proxy is setting the method &
endpoint of your proxy, and the URI you want to set a proxy to.

Now that you have these two CloudFormation templates defined in your `serverless.yml` file, you can simply run
`serverless deploy` and that will deploy these custom resources for you along with your service and set up a proxy on your Rest API.

## Accessing private resources using VPC Link

If you have an Edge Optimized or Regional API Gateway, you can access the internal VPC resources using VPC Link. Please refer [AWS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-private-integration.html) to know more about API Gateway private integration.

We can use following configuration to have an http-proxy vpc-link integration.

```yml
- http:
    path: v1/repository
    method: get
    integration: http-proxy
    connectionType: vpc-link
    connectionId: '{your-vpc-link-id}'
    cors: true
    request:
      uri: http://www.github.com/v1/repository
      method: get
```

## Mock Integration

Mocks allow developers to offer simulated methods for an API, with this, responses can be defined directly, without the need for a integration backend. A simple mock response example is provided below:

```yml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          cors: true
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

## Share API Gateway and API Resources

As your application grows, you will likely need to break it out into multiple, smaller services. By default, each Serverless project generates a new API Gateway. However, you can share the same API Gateway between multiple projects by referencing its REST API ID and Root Resource ID in `serverless.yml` as follows:

```yml
service: service-name
provider:
  name: aws
  apiGateway:
    restApiId: xxxxxxxxxx # REST API resource ID. Default is generated by the framework
    restApiRootResourceId: xxxxxxxxxx # Root resource, represent as / path
    websocketApiId: xxxxxxxxxx # Websocket API resource ID. Default is generated by the framework
    description: Some Description # optional - description of deployment history

functions: ...
```

If your application has many nested paths, you might also want to break them out into smaller services.

```yml
service: service-a
provider:
  apiGateway:
    restApiId: xxxxxxxxxx
    restApiRootResourceId: xxxxxxxxxx
    websocketApiId: xxxxxxxxxx
    description: Some Description

functions:
  create:
    handler: posts.create
    events:
      - http:
          method: post
          path: /posts
```

```yml
service: service-b
provider:
  apiGateway:
    restApiId: xxxxxxxxxx
    restApiRootResourceId: xxxxxxxxxx
    websocketApiId: xxxxxxxxxx
    description: Some Description

functions:
  create:
    handler: posts.createComment
    events:
      - http:
          method: post
          path: /posts/{id}/comments
```

The above example services both reference the same parent path `/posts`. However, Cloudformation will throw an error if we try to generate an existing path resource. To avoid that, we reference the resource ID of `/posts`:

```yml
service: service-a
provider:
  apiGateway:
    restApiId: xxxxxxxxxx
    restApiRootResourceId: xxxxxxxxxx
    websocketApiId: xxxxxxxxxx
    description: Some Description
    restApiResources:
      posts: xxxxxxxxxx

functions: ...
```

```yml
service: service-b
provider:
  apiGateway:
    restApiId: xxxxxxxxxx
    restApiRootResourceId: xxxxxxxxxx
    websocketApiId: xxxxxxxxxx
    description: Some Description
    restApiResources:
      /posts: xxxxxxxxxx

functions: ...
```

You can define more than one path resource, but by default, Serverless will generate them from the root resource.
`restApiRootResourceId` is optional if a path resource isn't required for the root (`/`).

```yml
service: service-a
provider:
  apiGateway:
    restApiId: xxxxxxxxxx
    # restApiRootResourceId: xxxxxxxxxx # Optional
    websocketApiId: xxxxxxxxxx
    description: Some Description
    restApiResources:
      /posts: xxxxxxxxxx
      /categories: xxxxxxxxx

functions:
  listPosts:
    handler: posts.list
    events:
      - http:
          method: get
          path: /posts

  listCategories:
    handler: categories.list
    events:
      - http:
          method: get
          path: /categories
```

### Easiest and CI/CD friendly example of using shared API Gateway and API Resources.

You can define your API Gateway resource in its own service and export the `restApiId`, `restApiRootResourceId` and `websocketApiId` using cloudformation cross-stack references.

```yml
service: my-api

provider:
  name: aws
  runtime: nodejs12.x
  stage: dev
  region: eu-west-2

resources:
  Resources:
    MyApiGW:
      Type: AWS::ApiGateway::RestApi
      Properties:
        Name: MyApiGW

    MyWebsocketApi:
      Type: AWS::ApiGatewayV2::Api
      Properties:
        Name: MyWebsocketApi
        ProtocolType: WEBSOCKET
        RouteSelectionExpression: '$request.body.action'

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

    websocketApiId:
      Value:
        Ref: MyWebsocketApi
      Export:
        Name: MyApiGateway-websocketApiId
```

This creates API gateway and then exports the `restApiId`, `rootResourceId` and `websocketApiId` values using cloudformation cross stack output.
We will import this and reference in future services.

```yml
service: service-a

provider:
  apiGateway:
    restApiId:
      'Fn::ImportValue': MyApiGateway-restApiId
    restApiRootResourceId:
      'Fn::ImportValue': MyApiGateway-rootResourceId
    websocketApiId:
      'Fn::ImportValue': MyApiGateway-websocketApiId

functions: service-a-functions
```

```yml
service: service-b

provider:
  apiGateway:
    restApiId:
      'Fn::ImportValue': MyApiGateway-restApiId
    restApiRootResourceId:
      'Fn::ImportValue': MyApiGateway-rootResourceId
    websocketApiId:
      'Fn::ImportValue': MyApiGateway-websocketApiId

functions: service-b-functions
```

You can use this method to share your API Gateway across services in same region. Read about this limitation [here](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-importvalue.html).

**Note:** We've noticed you can't use provider.tags together with `Fn::ImportValue` for `restApiId` and `restApiRootResourceId`. Doing so won't resolve the imported value, and therefore returns an error.

### Manually Configuring shared API Gateway

Use AWS console on browser, navigate to the API Gateway console. Select your already existing API Gateway.
Top Navbar should look like this

```
    APIs>apigateway-Name (xxxxxxxxxx)>Resources>/ (yyyyyyyyyy)
```

Here xxxxxxxxx is your restApiId and yyyyyyyyyy the restApiRootResourceId.

#### Note while using authorizers with shared API Gateway

AWS API Gateway allows only 1 Authorizer for 1 ARN, This is okay when you use conventional serverless setup, because each stage and service will create different API Gateway. But this can cause problem when using authorizers with shared API Gateway. If we use the same authorizer directly in different services like this.

```yml
service: service-c

provider:
  apiGateway:
    restApiId:
      'Fn::ImportValue': apiGateway-restApiId
    restApiRootResourceId:
      'Fn::ImportValue': apiGateway-rootResourceId

functions:
  deleteUser:
    events:
      - http:
        path: /users/{userId}
        authorizer:
          arn: xxxxxxxxxxxxxxxxx #cognito/custom authorizer arn
```

```yml
service: service-d

provider:
  apiGateway:
    restApiId:
      'Fn::ImportValue': apiGateway-restApiId
    restApiRootResourceId:
      'Fn::ImportValue': apiGateway-rootResourceId

functions:
  deleteProject:
    events:
      - http:
        path: /project/{projectId}
        authorizer:
          arn: xxxxxxxxxxxxxxxxx #cognito/custom authorizer arn
```

we encounter error from cloudformation as reported [here](https://github.com/serverless/serverless/issues/4711).

A proper fix for this is work is using [Share Authorizer](#share-authorizer) or you can add a unique `name` attribute to `authorizer` in each function. This creates different API Gateway authorizer for each function, bound to the same API Gateway. However, there is a limit of 10 authorizers per RestApi, and they are forced to contact AWS to request a limit increase to unblock development.

## Share Authorizer

Auto-created Authorizer is convenient for conventional setup. However, when you need to define your custom Authorizer, or use `COGNITO_USER_POOLS` authorizer with shared API Gateway, it is painful because of AWS limitation. Sharing Authorizer is a better way to do.

```yml
functions:
  createUser:
     ...
    events:
      - http:
          path: /users
          ...
          authorizer:
            # Provide both type and authorizerId
            type: COGNITO_USER_POOLS # TOKEN or REQUEST or COGNITO_USER_POOLS, same as AWS Cloudformation documentation
            authorizerId:
              Ref: ApiGatewayAuthorizer  # or hard-code Authorizer ID
            scopes: # Optional - List of Oauth2 scopes when type is COGNITO_USER_POOLS
              - myapp/myscope

  deleteUser:
     ...
    events:
      - http:
          path: /users/{userId}
          ...
          # Provide both type and authorizerId
          type: COGNITO_USER_POOLS # TOKEN or REQUEST or COGNITO_USER_POOLS, same as AWS Cloudformation documentation
          authorizerId:
            Ref: ApiGatewayAuthorizer # or hard-code Authorizer ID

resources:
  Resources:
    ApiGatewayAuthorizer:
      Type: AWS::ApiGateway::Authorizer
      Properties:
        AuthorizerResultTtlInSeconds: 300
        IdentitySource: method.request.header.Authorization
        Name: Cognito
        RestApiId:
          Ref: YourApiGatewayName
        Type: COGNITO_USER_POOLS
        ProviderARNs:
          - arn:aws:cognito-idp:${self:provider.region}:xxxxxx:userpool/abcdef

```

## Resource Policy

Resource policies are policy documents that are used to control the invocation of the API. Find more use cases from the [Apigateway Resource Policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html) documentation.

```yml
provider:
  name: aws
  runtime: nodejs12.x

  resourcePolicy:
    - Effect: Allow
      Principal: '*'
      Action: execute-api:Invoke
      Resource:
        - execute-api:/*/*/*
      Condition:
        IpAddress:
          aws:SourceIp:
            - '123.123.123.123'
```

## Compression

API Gateway allows for clients to receive [compressed payloads](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-gzip-compression-decompression.html), and supports various [content encodings](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-enable-compression.html#api-gateway-supported-content-encodings).

```yml
provider:
  name: aws
  apiGateway:
    minimumCompressionSize: 1024
```

## Binary Media Types

API Gateway makes it possible to return binary media such as images or files as responses.

Configuring API Gateway to return binary media can be done via the `binaryMediaTypes` config:

```yml
provider:
  apiGateway:
    binaryMediaTypes:
      - '*/*'
```

In your Lambda function you need to ensure that the correct `content-type` header is set. Furthermore you might want to return the response body in base64 format.

To convert the request or response payload, you can set the [contentHandling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-payload-encodings-workflow.html) property (if set, the response contentHandling property will be passed to integration responses with 2XXs method response statuses).

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          request:
            contentHandling: CONVERT_TO_TEXT
          response:
            contentHandling: CONVERT_TO_TEXT
```

## Detailed CloudWatch Metrics

Use the following configuration to enable detailed CloudWatch Metrics:

```yml
provider:
  apiGateway:
    metrics: true
```

## AWS X-Ray Tracing

API Gateway supports a form of out of the box distributed tracing via [AWS X-Ray](https://aws.amazon.com/xray/) though enabling [active tracing](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-xray.html). To enable this feature for your serverless application's API Gateway add the following to your `serverless.yml`

```yml
# serverless.yml

provider:
  name: aws
  tracing:
    apiGateway: true
```

## Tags / Stack Tags

API Gateway stages will be tagged with the `tags` and `stackTags` values defined at the `provider` level:

```yml
# serverless.yml

provider:
  name: aws
  stackTags:
    stackTagKey: stackTagValue
  tags:
    tagKey: tagValue
```

## Logs

Use the following configuration to enable API Gateway logs:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    restApi: true
```

The log streams will be generated in a dedicated log group which follows the naming schema `/aws/api-gateway/{service}-{stage}`.

To be able to write logs, API Gateway [needs a CloudWatch role configured](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html). This setting is per region, shared by all the APIs. There are three approaches for handling it:

- Let Serverless create and assign an IAM role for you (default behavior). Note that since this is a shared setting, this role is not removed when you remove the deployment.
- Let Serverless assign an existing IAM role that you created before the deployment, if not already assigned:

  ```yml
  # serverless.yml
  provider:
    logs:
      restApi:
        role: arn:aws:iam::123456:role
  ```

- Do not let Serverless manage the CloudWatch role configuration. In this case, you would create and assign the IAM role yourself, e.g. in a separate "account setup" deployment:

  ```yml
  provider:
    logs:
      restApi:
        roleManagedExternally: true # disables automatic role creation/checks done by Serverless
  ```

**Note:** Serverless configures the API Gateway CloudWatch role setting using a custom resource lambda function. If you're using `iam.deploymentRole` to specify a limited-access IAM role for your serverless deployment, the custom resource lambda will assume this role during execution.

By default, API Gateway access logs will use the following format:

```
'requestId: $context.requestId, ip: $context.identity.sourceIp, caller: $context.identity.caller, user: $context.identity.user, requestTime: $context.requestTime, httpMethod: $context.httpMethod, resourcePath: $context.resourcePath, status: $context.status, protocol: $context.protocol, responseLength: $context.responseLength'
```

You can specify your own [format for API Gateway Access Logs](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html#apigateway-cloudwatch-log-formats) by including your preferred string in the `format` property:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    restApi:
      format: '{ "requestId":"$context.requestId",   "ip": "$context.identity.sourceIp" }'
```

The default API Gateway log level will be INFO. You can change this to error with the following:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    restApi:
      level: ERROR
```

Valid values are INFO, ERROR.

If you want to disable access logging completely you can do with the following:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    restApi:
      accessLogging: true
```

By default, the full requests and responses data will be logged. If you want to disable like so:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    restApi:
      fullExecutionData: false
```

Websockets have the same configuration options as the the REST API. Example:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    websocket:
      level: INFO
      fullExecutionData: false
```
