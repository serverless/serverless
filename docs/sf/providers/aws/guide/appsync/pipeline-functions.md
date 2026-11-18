<!--
title: AppSync Pipeline Functions
description: Define the AppSync pipeline functions that pipeline resolvers run in sequence, in JavaScript, VTL or as direct Lambda calls.
short_title: AppSync Pipeline Functions
keywords:
  [
    'Serverless Framework',
    'AppSync pipeline function',
    'AppSync pipeline resolver',
    'AppSync function configuration',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/pipeline-functions)

<!-- DOCS-SITE-LINK:END -->

# AppSync pipeline functions

The `appSync.pipelineFunctions` map defines AppSync pipeline functions: reusable steps, each calling one [data source](./dataSources.md), that [pipeline resolvers](./resolvers.md#pipeline-resolvers) run in sequence. Use them when one GraphQL field needs several data source calls, such as an authorization check before a read, or when several resolvers share a step.

This configuration defines two functions and a resolver that runs them in order:

```yaml
appSync:
  name: blog-api
  pipelineFunctions:
    authorizePost:
      dataSource: postsTable
      code: functions/authorizePost.js
    getPost:
      dataSource: postsTable
      code: functions/getPost.js
  resolvers:
    Query.getPost:
      functions:
        - authorizePost
        - getPost
```

Each function's `code` file exports `request(ctx)` and `response(ctx)`, like a resolver; `ctx.prev.result` holds the previous function's result. `functions/getPost.js`:

```javascript
import { util } from '@aws-appsync/utils'

export function request(ctx) {
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ id: ctx.args.id }),
  }
}

export function response(ctx) {
  return ctx.result
}
```

## Pipeline function keys

Each key of `appSync.pipelineFunctions` is the function's name, which resolvers list in `functions`. AppSync accepts names that match `[_A-Za-z][_0-9A-Za-z]*`. Each function accepts these keys:

| Key             | Type             | Default  | Description                                                                                                                 |
| --------------- | ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dataSource`    | string or object | Required | The name of a data source in `appSync.dataSources`, or an [inline data source](#inline-data-sources-in-pipeline-functions). |
| `description`   | string           | None     | A description shown in the AppSync console.                                                                                 |
| `code`          | string           | None     | Path to a JavaScript or TypeScript file, relative to the service directory.                                                 |
| `request`       | string           | None     | Path to a VTL request mapping template, relative to the service directory.                                                  |
| `response`      | string           | None     | Path to a VTL response mapping template, relative to the service directory.                                                 |
| `maxBatchSize`  | number, 1–2000   | None     | For Lambda data sources: the maximum number of requests AppSync sends to the function in one batch invocation.              |
| `sync`          | object           | None     | Conflict detection and resolution. See [Delta Sync](./syncConfig.md).                                                       |
| `substitutions` | map              | None     | See [AppSync substitutions](./substitutions.md).                                                                            |

## Pipeline function runtimes

The keys a pipeline function sets decide its runtime:

- With `code`, the function runs JavaScript on the `APPSYNC_JS` runtime. The Framework bundles the file with esbuild, as it does for [resolvers](./resolvers.md#resolver-bundling).
- With `request` and/or `response` and no `code`, the function runs VTL mapping templates.
- With none of them, the function invokes its Lambda data source directly, as a [direct Lambda](https://docs.aws.amazon.com/appsync/latest/devguide/direct-lambda-reference.html) call. Use this only with a Lambda data source.

## Inline data sources in pipeline functions

A function's `dataSource` can be a full data source definition, for a data source only this function uses. The inline data source, and an inline Lambda function under it, take the pipeline function's name (`getPostFromLambda` in this example):

```yaml
provider:
  name: aws
  runtime: nodejs24.x

appSync:
  name: blog-api
  pipelineFunctions:
    getPostFromLambda:
      dataSource:
        type: AWS_LAMBDA
        config:
          function:
            handler: functions/getPost.handler
```

A function that only one resolver uses can also be defined inside that resolver's `functions` list; see [inline pipeline functions](./resolvers.md#inline-pipeline-functions).

## Split pipeline functions across files

`appSync.pipelineFunctions` also accepts a list of maps, which the Framework merges into one, so each map can come from its own file:

```yaml
appSync:
  name: blog-api
  pipelineFunctions:
    - ${file(appsync/functions/users.yml)}
    - ${file(appsync/functions/posts.yml)}
```

## Related pages

- [AppSync resolvers](./resolvers.md)
- [AppSync data sources](./dataSources.md)
- [Pipeline resolvers in AWS AppSync](https://docs.aws.amazon.com/appsync/latest/devguide/pipeline-resolvers.html)
