# Compile Api Gateway Events

This plugins compiles the functions HTTP endpoint definitions to valid API Gateway CloudFormation resources.

## How it works

`Compile Api Gateway Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) hook.

It loops over all functions which are defined in `serverless.yaml`. For each function that has a `http_endpoints` event
defined, an API Gateway REST API will be created.

Furthermore a lambda permission for the current function is created which makes is possible to invoke the function when
the endpoint is accessed.

Those resources are then merged into the `serverless.service.resources.Resources` section.

## Universal JSON request template

The API Gateway plugin implements a request template which provides `{body, method, headers, query, path, identity,
stageVariables} = event` as JavaScript objects. This way you don't have to define the template on your own but can use
this default template to access the necessary variables in your code.

## Event syntax

To define a HTTP endpoint you need to add a `http_endpoints` event source to the `events` section of the `serverless.yaml`
file:

```yaml
functions:
  create:
    handler: posts.create
    events:
      aws:
        http_endpoints:
          post: posts/create
```
