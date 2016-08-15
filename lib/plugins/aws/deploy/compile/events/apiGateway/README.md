# Compile Api Gateway Events

This plugins compiles the functions HTTP endpoint definitions to valid API Gateway CloudFormation resources.

## How it works

`Compile Api Gateway Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yml`. For each function that has a `http` event
defined, an API Gateway REST API will be created.

Furthermore a lambda permission for the current function is created which makes is possible to invoke the function when
the endpoint is accessed.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup HTTP events.

Those resources are then merged into the `serverless.service.resources.Resources` section.

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
            identitySource: method.request.header.Auth
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
            identitySource: method.request.header.Auth
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
