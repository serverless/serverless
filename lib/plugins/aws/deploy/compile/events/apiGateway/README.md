# Compile Api Gateway Events

This plugins compiles the functions HTTP endpoint definitions to valid API Gateway CloudFormation resources.

## How it works

`Compile Api Gateway Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yaml`. For each function that has a `http` event
defined, an API Gateway REST API will be created.

Furthermore a lambda permission for the current function is created which makes is possible to invoke the function when
the endpoint is accessed.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup HTTP events.

Those resources are then merged into the `serverless.service.resources.Resources` section.

## Universal JSON request template

The API Gateway plugin implements a request template which provides `{body, method, headers, query, path, identity,
stageVariables} = event` as JavaScript objects. This way you don't have to define the template on your own but can use
this default template to access the necessary variables in your code.

## Event syntax examples

### Simple http setup

This setup specifies that the `index` function should be run when someone accesses the API gateway at `users/index` via
a `GET` request.

```yaml
# serverless.yaml
functions:
    index:
        handler: users.index
        events:
            - http: GET users/index
```

### Http setup with extended event options

Here we've defined an POST endpoint for the path `posts/create`.

```yaml
# serverless.yaml
functions:
    create:
        handler: posts.create
        events:
            - http:
                path: posts/create
                method: post
```

### Http setup with custom authorizer
You can enable custom authorizers for your HTTP endpoint by setting the authorizer in your http event to another function in the same service, as shown in the following example

```yml
# serverless.yaml
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
Or, if you want to configure the authorizer with more options, you can turn the `authorizer` property into an object as shown in the following example:

```yml
# serverless.yaml
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
If the authorizer function does not exist in your service but exists in AWS, you can provide the ARN of the Lambda function instead of the function name, as shown in the following example:

```yml
# serverless.yaml
functions:
    create:
        handler: posts.create
        events:
            - http:
                path: posts/create
                method: post
                authorizer: xxx:xxx:Lambda-Name
```
Or, if you want to configure the authorizer with more options, you can turn the `authorizer` property into an object as shown in the following example:
```yml
# serverless.yaml
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

### Setting an HTTP proxy on API Gateway
Setting an API Gateway proxy can easily be done by adding two custom CloudFormation resource templates to your `serverless.yaml` file. [Check this guide for more info on how to set up a proxy using custom CloudFormation resources in `serverless.yaml`](https://github.com/serverless/serverless/blob/v1.0/docs/guide/custom-provider-resources.md).