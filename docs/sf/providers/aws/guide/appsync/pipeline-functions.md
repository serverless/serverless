# Pipeline functions

When you use `PIPELINE` [resolvers](resolvers.md), you will also need to define the used pipeline functions. You can do so under the `appSync.pipelineFunctions` attribute.

It's a key-value pair object whose key is the name of the function and the value is its configuration.

## Quick start

```yaml
appSync:
  pipelineFunctions:
    myFunction:
      dataSource: myDataSource
      code: myFunction.js
```

## Configuration

- `dataSource`: The name of the dataSource to use.
- `description`: An optional description for this pipeline function.
- `code`: The path to the JS resolver handler file, relative to `serverless.yml`.
- `request`: The path to the VTL request mapping template file, relative to `serverless.yml`.
- `response`: The path to the VTL response mapping template file, relative to `serverless.yml`.
- `maxBatchSize`: The maximum [batch size](https://aws.amazon.com/blogs/mobile/introducing-configurable-batching-size-for-aws-appsync-lambda-resolvers/) to use (only available for AWS Lambda DataSources)
- `substitutions`: See [Variable Substitutions](substitutions.md)
- `sync`: [See SyncConfig](syncConfig.md)

## JavaScript vs VTL vs Direct Lambda

When `code` is specified, the JavaScript runtime is used. When `request` and/or `response` are specified, the VTL runtime is used.

To use [direct lambda](https://docs.aws.amazon.com/appsync/latest/devguide/direct-lambda-reference.html), don't specify anything (only works with Lambda function data sources).

## Inline DataSources

Just like with `UNIT` resolvers, you can [define the dataSource inline](resolvers.md#inline-datasources) in pipeline functions.

```yaml
appSync:
  pipelineFunctions:
    myFunction:
      dataSource:
        type: 'AWS_LAMBDA'
        config:
          function:
            timeout: 30
            handler: 'functions/myFunction.handler'
```
