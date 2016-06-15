# awsCompileApigEvents

This plugins compiles the functions HTTP endpoint definitions to valid API Gateway CloudFormation resources.

## How it works

`awsCompileApigEvents` hooks into the [`deploy:compileEvents`](/docs/plugins/core/deploy.md) hook.

It loops over all functions which are defined in `serverless.yaml`. For each function that has a `http_endpoints` event
defined, an API Gateway REST API will be created.

Furthermore a lambda permission for the current function is created which makes is possible to invoke the function when
the endpoint is accessed.

Those two resources are then merged into the `serverless.service.resources.aws.Resources` section.

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
