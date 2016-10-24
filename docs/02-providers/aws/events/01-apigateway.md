<!--
title: API Gateway Event configuration
menuText: API Gateway Event config
layout: Doc
-->

# API Gateway

## Simple http setup

This setup specifies that the `index` function should be run when someone accesses the API gateway at `users/index` via
a `GET` request.

```yml
# serverless.yml
functions:
  index:
    handler: users.index
    events:
      - http: GET users/index
```

## Http setup with extended event options

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

## Request parameters

You can pass optional and required parameters to your functions, so you can use them in for example Api Gateway tests and SDK generation. Marking them as `true` will make them required, `false` will make them optional.

```yml
# serverless.yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          integration: lambda
          request:
            parameters:
              querystrings:
                url: true
              headers:
                foo: false
                bar: true
              paths:
                bar: false
```

In order for path variables to work, ApiGateway also needs them in the method path itself, like so:

```yml
# serverless.yml
functions:
  create:
    handler: posts.post_detail
    events:
      - http:
          path: posts/{id}
          method: get
          integration: lambda
          request:
            parameters:
              paths:
                id: true
```

## Integration types

Serverless supports the following integration types:

- `lambda`
- `lambda-proxy`

Here's a simple example which demonstrates how you can set the `integration` type for your `http` event:

```yml
# serverless.yml
functions:
  get:
    handler: users.get
    events:
      - http:
          path: users
          method: get
          integration: lambda
```

### `lambda-proxy`

**Important:** Serverless defaults to this integration type if you don't setup another one.
Furthermore any `request` or `response` configuration will be ignored if this `integration` type is used.

`lambda-proxy` simply passes the whole request as is (regardless of the content type, the headers, etc.) directly to the
Lambda function. This means that you don't have to setup custom request / response configuration (such as templates, the
passthrough behavior, etc.).

Your function needs to return corresponding response information.

Here's an example for a JavaScript / Node.js function which shows how this might look like:

```javascript
'use strict';

exports.handler = function(event, context, callback) {
    const responseBody = {
      message: "Hello World!",
      input: event
    };

    const response = {
      statusCode: 200,
      headers: {
        "x-custom-header" : "My Header Value"
      },
      body: JSON.stringify(responseBody)
    };

    callback(null, response);
};
```

**Note:** When the body is a JSON-Document, you must parse it yourself:
```
JSON.parse(event.body);
```

**Note:** If you want to use CORS with the lambda-proxy integration, remember to include `Access-Control-Allow-Origin` in your returned headers object.

Take a look at the [AWS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-create-api-as-simple-proxy-for-lambda.html)
for more information about this.

### `lambda`

The `lambda` integration type should be used if you want more control over the `request` and `response` configurations.

Serverless ships with defaults for the request / response configuration (such as request templates, error code mappings,
default passthrough behaviour) but you can always configure those accordingly when you set the `integration` type to `lambda`.

## Request templates

**Note:** The request configuration can only be used when the integration type is set to `lambda`.

### Default request templates

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

### Using custom request templates

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
          request:
            template:
              application/json: '{ "foo" : "$input.params(''bar'')" }'
```

**Note:** Notice when using single-quoted strings, any single quote `'` inside its contents must be doubled (`''`) to escape it.
You can then access the query string `https://example.com/dev/whatever?bar=123` by `event.foo` in the lambda function.
If you want to spread a string into multiple lines, you can use the `>` or `|` syntax, but the following strings have to be all indented with the same amount, [read more about `>` syntax](http://stackoverflow.com/questions/3790454/in-yaml-how-do-i-break-a-string-over-multiple-lines).


### Pass Through Behavior
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

## Responses

**Note:** The response configuration can only be used when the integration type is set to `lambda`.

Serverless lets you setup custom headers and a response template for your `http` event.

### Using custom response headers

Here's an example which shows you how you can setup a custom response header:

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          method: get
          path: whatever
          response:
            headers:
              Content-Type: integration.response.header.Content-Type
              Cache-Control: "'max-age=120'"
```

**Note:** You're able to use the [integration response variables](http://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html#mapping-response-parameters)
for your header values. Headers are passed to API Gateway exactly like you define them. Passing the `Cache-Control` header
as `"'max-age=120'"` means API Gateway will receive the value as `'max-age=120'` (enclosed with single quotes).

### Using a custom response template

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
          response:
            headers:
              Content-Type: "'text/html'"
            template: $input.path('$')
```

**Note:** The template is defined as plain text here. However you can also reference an external file with the help of
the `${file(templatefile)}` syntax.

### Status codes

Serverless ships with default status codes you can use to e.g. signal that a resource could not be found (404) or that
the user is not authorized to perform the action (401). Those status codes are regex definitions that will be added to your API Gateway configuration.

#### Overview of available status codes

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

#### Using status codes

To return a given status code you simply need to add square brackets with the status code of your choice to your
returned message like this: `[401] You are not authorized to access this resource!`.

Here's an example which shows you how you can raise a 404 HTTP status from within your lambda function.

```javascript
module.exports.hello = (event, context, cb) => {
  cb(new Error('[404] Not found'));
}
```

#### Custom status codes

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

### Catching exceptions in your Lambda function

In case an exception is thrown in your lambda function AWS will send an error message with `Process exited before completing request`. This will be caught by the regular expression for the 500 HTTP status and the 500 status will be returned.

### Http setup with custom authorizer

You can enable custom authorizers for your HTTP endpoint by setting the authorizer in your http event to another function
in the same service, as shown in the following example

```yml
# serverless.yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer: authorizerFunc
  authorizerFunc:
    handler: handlers.authorizerFunc
```
Or, if you want to configure the authorizer with more options, you can turn the `authorizer` property into an object as
shown in the following example:

```yml
# serverless.yml
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
  authorizerFunc:
    handler: handlers.authorizerFunc
```

### Http setup with custom authorizer (via ARN)
If the authorizer function does not exist in your service but exists in AWS, you can provide the ARN of the Lambda
function instead of the function name, as shown in the following example:

```yml
# serverless.yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          authorizer: xxx:xxx:Lambda-Name
```

Or, if you want to configure the authorizer with more options, you can turn the `authorizer` property into an object as
shown in the following example:

```yml
# serverless.yml
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

## Setting API keys for your Rest API
You can specify a list of API keys to be used by your service Rest API by adding an `apiKeys` array property to the
`provider` object in `serverless.yml`. You'll also need to explicitly specify which endpoints are `private` and require
one of the api keys to be included in the request by adding a `private` boolean property to the `http` event object you
want to set as private.

Here's an example configuration for setting API keys for your service Rest API:

```yml
service: my-service
provider:
  name: aws
  apiKeys:
    - myFirstKey
    - ${env:MY_API_KEY} # you can hide it in a serverless variable
functions:
  hello:
  events:
    - http:
        path: user/create
        method: get
        private: true
```

Please note that those are the API keys names, not the actual values. Once you deploy your service, the value of those API keys will be auto generated by AWS and printed on the screen for you to use.

Clients connecting to this Rest API will then need to set any of these API keys values in the `x-api-key` header of their request. This is only necessary for functions where the `private` property is set to true.

## Enabling CORS for your endpoints
To set CORS configurations for your HTTP endpoints, simply modify your event configurations as follows:

```yml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: user/create
          method: get
          cors: true
```

You can equally set your own attributes:

```yml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: user/create
          method: get
          cors:
            origins:
              - '*'
            headers:
              - Content-Type
              - X-Amz-Date
              - Authorization
              - X-Api-Key
              - X-Amz-Security-Token
```

This example is the default setting and is exactly the same as the previous example. The `Access-Control-Allow-Methods` header is set automatically, based on the endpoints specified in your service configuration with CORS enabled.

**Note:** If you are using the default lambda proxy integration, remember to include `Access-Control-Allow-Origin` in your returned headers object otherwise CORS will fail.

```
module.exports.hello = (event, context, cb) => {
  return cb(null, {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    body: 'Hello World!'
  });
}
```

## Setting an HTTP proxy on API Gateway

To set up an HTTP proxy, you'll need two CloudFormation templates, one for the endpoint (known as resource in CF), and
one for method. These two templates will work together to construct your proxy. So if you want to set `your-app.com/serverless` as a proxy for `serverless.com`, you'll need the following two templates in your `serverless.yml`:

```yml
# serverless.yml
service: service-name
provider: aws
functions:
  …

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
        HttpMethod: GET # the method of your proxy. Is it GET or POST or … ?
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
