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

_Are you looking for tutorials on using API Gateway? Check out the following resources:_

> - [Add a custom domain for your API Gateway](https://serverless.com/blog/serverless-api-gateway-domain/)
> - [Deploy multiple micro-services under the same domain](https://serverless.com/blog/api-gateway-multiple-services/)
> - [Create a Node REST API with Express.js](https://serverless.com/blog/serverless-express-rest-api/)
> - [Make a Serverless GraphQL API](https://serverless.com/blog/make-serverless-graphql-api-using-lambda-dynamodb/)

To create HTTP endpoints as Event sources for your AWS Lambda Functions, use the Serverless Framework's easy AWS API Gateway Events syntax.

There are five ways you can configure your HTTP endpoints to integrate with your AWS Lambda Functions:
* `lambda-proxy` / `aws-proxy` / `aws_proxy` (Recommended)
* `lambda` / `aws`
* `http`
* `http-proxy` / `http_proxy`
* `mock`

**The Framework uses the `lambda-proxy` method (i.e., everything is passed into your Lambda) by default unless another method is supplied by the user**

The difference between these is `lambda-proxy` (alternative writing styles are `aws-proxy` and `aws_proxy` for compatibility with the standard AWS integration type naming) automatically passes the content of the HTTP request into your AWS Lambda function (headers, body, etc.) and allows you to configure your response (headers, status code, body) in the code of your AWS Lambda Function.  Whereas, the `lambda` method makes you explicitly define headers, status codes, and more in the configuration of each API Gateway Endpoint (not in code).  We highly recommend using the `lambda-proxy` method if it supports your use-case, since the `lambda` method is highly tedious.

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

module.exports.hello = function(event, context, callback) {

    console.log(event); // Contains incoming request data (e.g., query params, headers and more)

    const response = {
      statusCode: 200,
      headers: {
        "x-custom-header" : "My Header Value"
      },
      body: JSON.stringify({ "message": "Hello World!" })
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

Configuring the `cors` property sets  [Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin), [Access-Control-Allow-Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Headers), [Access-Control-Allow-Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Methods),[Access-Control-Allow-Credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials) headers in the CORS preflight response.

If you want to use CORS with the lambda-proxy integration, remember to include the `Access-Control-Allow-*` headers in your headers object, like this:

```javascript
// handler.js

'use strict';

module.exports.hello = function(event, context, callback) {

    const response = {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin" : "*", // Required for CORS support to work
        "Access-Control-Allow-Credentials" : true // Required for cookies, authorization headers with HTTPS
      },
      body: JSON.stringify({ "message": "Hello World!" })
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

Custom Authorizers allow you to run an AWS Lambda Function before your targeted AWS Lambda Function.  This is useful for Microservice Architectures or when you simply want to do some Authorization before running your business logic.

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
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
            identityValidationExpression: someRegex
```

You can also use the Request Type Authorizer by setting the `type` property. In this case, your `identitySource` could contain multiple entries for you policy cache. The default `type` is 'token'.

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
in the following example:

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

### Catching Exceptions In Your Lambda Function

In case an exception is thrown in your lambda function AWS will send an error message with `Process exited before completing request`. This will be caught by the regular expression for the 500 HTTP status and the 500 status will be returned.

### Setting API keys for your Rest API

You can specify a list of API keys to be used by your service Rest API by adding an `apiKeys` array property to the
`provider` object in `serverless.yml`. You'll also need to explicitly specify which endpoints are `private` and require
one of the api keys to be included in the request by adding a `private` boolean property to the `http` event object you
want to set as private. API Keys are created globally, so if you want to deploy your service to different stages make sure
your API key contains a stage variable as defined below. When using API keys, you can optionally define usage plan quota
and throttle, using `usagePlan` object.

Here's an example configuration for setting API keys for your service Rest API:

```yml
service: my-service
provider:
  name: aws
  apiKeys:
    - myFirstKey
    - ${opt:stage}-myFirstKey
    - ${env:MY_API_KEY} # you can hide it in a serverless variable
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

### Configuring endpoint types

API Gateway [supports regional endpoints](https://aws.amazon.com/about-aws/whats-new/2017/11/amazon-api-gateway-supports-regional-api-endpoints/) for associating your API Gateway REST APIs with a particular region. This can reduce latency if your requests originate from the same region as your REST API and can be helpful in building multi-region applications.

By default, the Serverless Framework deploys your REST API using the EDGE endpoint configuration. If you would like to use the REGIONAL configuration, set the `endpointType` parameter in your `provider` block.

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
    "stageVariables": {}
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
- query
- path
- identity
- stageVariables

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

#### Pass Through Behavior
API Gateway provides multiple ways to handle requests where the Content-Type header does not match any of the specified mapping templates.  When this happens, the request payload will either be passed through the integration request *without transformation* or rejected with a `415 - Unsupported Media Type`, depending on the configuration.

You can define this behavior as follows (if not specified, a value of **NEVER** will be used):

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

|Value             | Passed Through When                           | Rejected When                                                           |
|----------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
|NEVER             |  Never                                        | No templates defined or Content-Type does not match a defined template  |
|WHEN_NO_MATCH     |  Content-Type does not match defined template | Never                                                                   |
|WHEN_NO_TEMPLATES |  No templates were defined                    | One or more templates defined, but Content-Type does not match          |

See the [api gateway documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#integration-passthrough-behaviors) for detailed descriptions of these options.

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

### Custom Response Templates

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

***Note:*** Status codes as documented in this chapter relate to `lambda` integration method (as documented at the top of this page). If using default integration method `lambda-proxy` object with status code and message should be returned as in the example below:

```javascript
module.exports.hello = (event, context, callback) => {
  callback(null, { statusCode: 404, body: "Not found", headers: { "Content-Type": "text/plain" } });
}
```

#### Available Status Codes

| Status Code | Meaning |
| --- | --- |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Unprocessable Entity |
| 500 | Internal Server Error |
| 502 | Bad Gateway |
| 504 | Gateway Timeout |

#### Using Status Codes

To return a given status code you simply need to add square brackets with the status code of your choice to your
returned message like this: `[401] You are not authorized to access this resource!`.

Here's an example which shows you how you can raise a 404 HTTP status from within your lambda function.

```javascript
module.exports.hello = (event, context, callback) => {
  callback(new Error('[404] Not found'));
}
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
functions:
  ...

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
