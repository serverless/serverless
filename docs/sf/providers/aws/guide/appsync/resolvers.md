<!--
title: Serverless Framework - AppSync - Resolvers
description: How to configure UNIT and PIPELINE resolvers for AWS AppSync with the Serverless Framework.
short_title: AppSync - Resolvers
keywords:
  [
    'Serverless Framework',
    'AppSync',
    'Resolvers',
    'UNIT',
    'PIPELINE',
    'GraphQL',
    'AWS',
  ]
-->

# Resolvers

All the Resolvers in your AppSync API can be found in serverless.yml under the `appSync.resolvers` property.

Resolvers are defined using key-value pairs where the key can either be an arbitrary name for the resolver or the `type` and `field` in the schema it is attached to separated with a dot (`.`), and the value is the configuration of the resolver.

## Quick start

```yaml
appSync:
  resolvers:
    Query.user:
      dataSource: myDataSource

    getPosts:
      type: Query
      field: getPosts
      dataSource: myDataSource
```

## Configuration

- `type`: The Type in the schema this resolver is attached to. Optional if specified in the configuration key.
- `field`: The Field in the schema this resolver is attached to. Optional if specified in the configuration key.
- `kind`: The kind of resolver. Can be `UNIT` or `PIPELINE` ([see below](#PIPELINE-resolvers)). Defaults to `PIPELINE`
- `dataSource`: The name of the [dataSource](dataSources.md) this resolver uses.
- `functions`: For pipeline resolvers ([see below](#PIPELINE-resolvers)) the array of functions to run in sequence
- `maxBatchSize`: The maximum [batch size](https://aws.amazon.com/blogs/mobile/introducing-configurable-batching-size-for-aws-appsync-lambda-resolvers/) to use (only available for AWS Lambda DataSources)
- `code`: The path of the JavaScript resolver handler file, relative to `serverless.yml`. If not specified, a [minimalistic default](#javascript-vs-vtl) is used.
- `request`: The path to the VTL request mapping template file, relative to `serverless.yml`.
- `response`: The path to the VTL response mapping template file, relative to `serverless.yml`.
- `substitutions`: See [Variable Substitutions](substitutions.md). Deprecated: Use [environment variables](./general-config.md) instead.
- `caching`: [See below](#Caching)
- `sync`: [See SyncConfig](syncConfig.md)

## JavaScript, VTL, or Direct Lambda

When `code` is specified, the JavaScript runtime is used.

When `request` and/or `response` are specified, the VTL runtime is used.

For [direct lambda](https://docs.aws.amazon.com/appsync/latest/devguide/direct-lambda-reference.html), set `kind` to `UNIT` and don't specify `request`, `response` or `code`. This only works with Lambda function data sources.

If nothing is specified, by default, the resolver is a PIPELINE JavaScript resolver, and the following minimalistic code is used for the `before` and `after` handlers.

```js
export function request() {
  return {}
}

export function response(ctx) {
  return ctx.prev.result
}
```

Example of a UNIT JavaScript resolver.

```yaml
appSync:
  resolvers:
    Query.user:
      kind: UNIT
      dataSource: myDataSource
      code: getUser.js
```

## Bundling

AppSync requires resolvers to be bundled in one single file. By default, the Framework bundles your code with [esbuild](https://esbuild.github.io/), using the given path as the entry point.

This means that you can import external libraries and utilities. e.g.

```js
import { Context, util } from '@aws-appsync/utils';
import { generateUpdateExpressions, updateItem } from '../lib/helpers';

export function request(ctx) {
  const { id, ...post } = ctx.args.post;

  const item = updateItem(post);

  return {
    operation: 'UpdateItem',
    key: {
      id: util.dynamodb.toDynamoDB(id),
    },
    update: generateUpdateExpressions(item),
    condition: {
      expression: 'attribute_exists(#id)',
      expressionNames: {
        '#id': 'id',
      },
    },
  };
}

export function response(ctx: Context) {
  return ctx.result;
}
```

For more information, also see the [esbuild option](./general-config.md#Esbuild).

## TypeScript support

You can write JS resolver in TypeScript. Resolver files with the `.ts` extension are automatically transpiled and bundled using esbuild.

```yaml
resolvers:
  Query.user:
    kind: UNIT
    dataSource: 'users'
    code: 'getUser.ts'
```

```ts
// getUser.ts
import { Context, util } from '@aws-appsync/utils'

export function request(ctx: Context) {
  const {
    args: { id },
  } = ctx
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ id }),
  }
}

export function response(ctx: Context) {
  return ctx.result
}
```

For more information, also see the [esbuild option](./general-config.md#Esbuild).

## PIPELINE resolvers

When `kind` is `PIPELINE`, you can specify the [pipeline function](pipeline-functions.md) names to use:

```yaml
appSync:
  pipelineFunctions:
    function1:
      dataSource: myDataSource
    function2:
      dataSource: myDataSource

  resolvers:
    Query.user:
      functions:
        - function1
        - function2
```

## Inline DataSources

If a [DataSource](dataSources.md) is only used in one single resolver, you can also define it inline in the resolver configuration. This is often the case for Lambda resolvers.

You can even also define the Lambda function definition inline under the dataSource definition. This helps keep everything in one single place!

```yaml
appSync:
  resolvers:
    Query.user:
      kind: UNIT
      dataSource:
        type: 'AWS_LAMBDA'
        config:
          function:
            timeout: 30
            handler: 'functions/getUser.handler'
```

## Inline function definitions

If a [Pipeline function](pipeline-functions.md) is only used in a single resolver, you can also define it inline in the resolver configuration.

```yaml
appSync:
  resolvers:
    Query.user:
      functions:
        - dataSource: 'users'
          code: 'getUser.js'
```

## Caching

```yaml
Query.user:
  dataSource: myDataSource
  caching:
    ttl: 60
    keys:
      - '$context.arguments.id'
```

You can either pass `true` which will use the global TTL (See the [global caching configuration](caching.md)) and no `keys`.

You can also customize each resolver using the following config:

- `ttl`: The TTL of the cache for this resolver in seconds
- `keys`: An array of keys to use for the cache.

# Organize your resolvers

You can define your data sources into several files for organizational reasons. You can pass each file into the `dataSources` attribute as an array.

```yaml
resolvers:
  - ${file(appsync/resolvers/users.yml)}
  - ${file(appsync/resolvers/posts.yml)}
```
