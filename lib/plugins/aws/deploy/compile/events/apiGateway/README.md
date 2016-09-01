# Compile Api Gateway Events

This plugins compiles the functions HTTP endpoint definitions to valid API Gateway CloudFormation resources.

## How it works

`Compile Api Gateway Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yml`. For each function that has a `http` event
defined, an API Gateway REST API will be created.

Furthermore a lambda permission for the current function is created which makes is possible to invoke the function when
the endpoint is accessed.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup HTTP events.

Those resources are then merged into the compiled CloudFormation template.

## Universal JSON request template

The API Gateway plugin implements a request template which provides `{body, method, principalId, stage, headers, query, path, identity,
stageVariables} = event` as JavaScript objects. This way you don't have to define the template on your own but can use
this default template to access the necessary variables in your code.

## Event syntax examples

### Simple http setup

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

### Http setup with extended event options

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

### Request templates

#### Default request templates

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

#### Using custom request templates

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
              text/xhtml: { "stage" : "$context.stage" }
              application/json: { "httpMethod" : "$context.httpMethod" }
```

**Note:** The templates are defined as plain text here. However you can also reference an external file with the help of
the `${file(templatefile)}` syntax.


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

#### Using custom response headers

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

#### Using a custom response template

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

Serverless ships with default status codes you can use to e.g. signal that a resouce could not be found (404) or that
the user is not authorized to perform this action (401).

#### Overview of available status codes

|Status Code|Meaning|
|-|-|
|400|Bad Request|
|401|Unauthorized|
|403|Forbidden|
|404|Not Found|
|422|Unprocessable Entity|
|500|Internal Server Error|
|502|Bad Gateway|
|504|Gateway Timeout|

#### Using status codes

Here's an example which shows you how you can raise a 400 HTTP status from within your lambda function.

```javascript
module.exports.hello = (event, context, callback) => {
  var response = {
    status: 400,
    errors: [
      {
        code: "1",
        source: "/users/create",
        message: "Invalid E-Mail",
        detail: "The E-Mail address you've entered was invalid."
      },
      {
        code: "2",
        source: "/users/create",
        message: "Invalid Password",
        detail: "The provided password is too short."
      },
    ]
  }

  context.fail(JSON.stringify(response));
};
```

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

### Setting API keys for your Rest API
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
    - ${mySecondSecretKey} # you can hide it in a serverless variable
functions:
  hello:
  events:
    - http:
        path: user/create
        method: get
        private: true
```

Clients connecting to this Rest API will then need to set any of these API keys in the `x-api-key` header of their request.
That wouldn't be required if you hadn't set the `private` property to `true`.

### Setting an HTTP proxy on API Gateway
Setting an API Gateway proxy can easily be done by adding two custom CloudFormation resource templates to your
`serverless.yml` file. Check [this guide](https://github.com/serverless/serverless/blob/v1.0/docs/guide/custom-provider-resources.md)
for more info on how to set up a proxy using custom CloudFormation resources in `serverless.yml`.

### Enabling CORS for your endpoints
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
