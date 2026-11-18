<!--
title: AppSync Resolvers
description: 'Attach AppSync resolvers to GraphQL fields in serverless.yml: unit and pipeline resolvers in JavaScript, VTL or direct Lambda, with caching.'
short_title: AppSync Resolvers
keywords:
  [
    'Serverless Framework',
    'AppSync resolver',
    'AppSync JavaScript resolver',
    'APPSYNC_JS',
    'AppSync pipeline resolver',
    'AppSync direct Lambda resolver',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/resolvers)

<!-- DOCS-SITE-LINK:END -->

# AppSync resolvers

The `appSync.resolvers` map attaches a resolver to each GraphQL field that needs one: the code that turns the field's arguments into a request to a [data source](./dataSources.md) and the response into the field's value. A `UNIT` resolver calls one data source; a `PIPELINE` resolver, the default kind, runs a list of [pipeline functions](./pipeline-functions.md) in sequence. Resolver code is JavaScript for the `APPSYNC_JS` runtime, VTL mapping templates, or nothing at all for a direct Lambda resolver.

This unit resolver resolves `Query.getPost` with a JavaScript file and a DynamoDB data source:

```yaml
appSync:
  name: blog-api
  dataSources:
    postsTable:
      type: AMAZON_DYNAMODB
      config:
        tableName: !Ref PostsTable
  resolvers:
    Query.getPost:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/getPost.js
```

The `code` path is relative to the service directory. `resolvers/getPost.js` exports a `request` and a `response` function:

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

Without `kind: UNIT`, a resolver is a pipeline resolver and requires `functions` instead of `dataSource`.

## Resolver keys

Each key of `appSync.resolvers` is either `Type.field` (`Query.getPost`), or any name with the type and field set as `type` and `field`:

```yaml
appSync:
  name: blog-api
  resolvers:
    getPostResolver:
      type: Query
      field: getPost
      kind: UNIT
      dataSource: postsTable
      code: resolvers/getPost.js
```

Each resolver accepts these keys:

| Key             | Type                 | Default                                     | Description                                                                                                                           |
| --------------- | -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `type`          | string               | From the `Type.field` key                   | The GraphQL type. Required when the key isn't `Type.field`.                                                                           |
| `field`         | string               | From the `Type.field` key                   | The GraphQL field. Required when the key isn't `Type.field`.                                                                          |
| `kind`          | `UNIT` or `PIPELINE` | `PIPELINE`                                  | The resolver kind.                                                                                                                    |
| `dataSource`    | string or object     | Required for `UNIT`                         | The name of a data source in `appSync.dataSources`, or an [inline data source](#inline-data-sources).                                 |
| `functions`     | list                 | Required for `PIPELINE`                     | The [pipeline functions](./pipeline-functions.md) to run in order: names, or [inline definitions](#inline-pipeline-functions).        |
| `code`          | string               | See [Resolver runtimes](#resolver-runtimes) | Path to a JavaScript or TypeScript file, relative to the service directory.                                                           |
| `request`       | string               | None                                        | Path to a VTL request mapping template, relative to the service directory.                                                            |
| `response`      | string               | None                                        | Path to a VTL response mapping template, relative to the service directory.                                                           |
| `maxBatchSize`  | number, 1–2000       | None                                        | For `UNIT` resolvers with a Lambda data source: the maximum number of requests AppSync sends to the function in one batch invocation. |
| `caching`       | boolean or object    | None                                        | See [Resolver caching](#resolver-caching).                                                                                            |
| `sync`          | object               | None                                        | Conflict detection and resolution. See [Delta Sync](./syncConfig.md).                                                                 |
| `substitutions` | map                  | None                                        | See [AppSync substitutions](./substitutions.md).                                                                                      |

## Resolver runtimes

The keys a resolver sets decide its runtime:

| Keys set                                    | Runtime                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `code`                                      | JavaScript (`APPSYNC_JS` 1.0.0).                                                                 |
| `request` and/or `response`, without `code` | VTL mapping templates.                                                                           |
| None of them, `kind: UNIT`                  | A direct Lambda resolver. Use it only with a Lambda data source.                                 |
| None of them, `kind: PIPELINE`              | JavaScript with a default `request` and `response` that pass the last function's result through. |

### JavaScript resolvers

A JavaScript resolver's `code` file exports `request(ctx)`, which returns the request for the data source, and `response(ctx)`, which returns the field's value. The Framework bundles the file with esbuild before deploying, so it can import other files and npm packages; see [Resolver bundling](#resolver-bundling).

### VTL resolvers

A VTL resolver sets `request` and `response` to mapping template files:

```yaml
appSync:
  name: blog-api
  resolvers:
    Query.getPost:
      kind: UNIT
      dataSource: postsTable
      request: mapping-templates/getPost.request.vtl
      response: mapping-templates/getPost.response.vtl
```

The request template in `mapping-templates/getPost.request.vtl`:

```text
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
  }
}
```

The response template in `mapping-templates/getPost.response.vtl`:

```text
$util.toJson($ctx.result)
```

### Direct Lambda resolvers

A [direct Lambda resolver](https://docs.aws.amazon.com/appsync/latest/devguide/direct-lambda-reference.html) has `kind: UNIT`, a Lambda data source and no `code`, `request` or `response`. AppSync sends the function the full context (`arguments`, `identity`, `source`, `info` and more) and uses the function's return value as the field's value:

```yaml
provider:
  name: aws
  runtime: nodejs24.x

appSync:
  name: blog-api
  dataSources:
    postsFunction:
      type: AWS_LAMBDA
      config:
        function:
          handler: functions/posts.handler
  resolvers:
    Query.getPost:
      kind: UNIT
      dataSource: postsFunction
```

The handler in `functions/posts.mjs`:

```javascript
export const handler = async (event) => {
  const { id } = event.arguments
  return { id, title: `Post ${id}` }
}
```

## Pipeline resolvers

A pipeline resolver runs its `functions` in order. Each function's `code` file exports `request` and `response`, like a unit resolver's, and can read the previous function's result from `ctx.prev.result`. The resolver's own `code` (or `request` and `response` templates) runs before the first function and after the last:

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

Without `code`, `request` or `response`, the Framework gives a pipeline resolver this JavaScript code, which passes the last function's result through:

```javascript
export function request() {
  return {}
}

export function response(ctx) {
  return ctx.prev.result
}
```

## Resolver bundling

AppSync accepts one JavaScript file per resolver or function. The Framework bundles each `code` file with [esbuild](https://esbuild.github.io/), using the file as the entry point, so the code can import local modules and npm packages. `@aws-appsync/utils` stays external because the `APPSYNC_JS` runtime provides it. This resolver imports helpers from another file:

```javascript
import { util } from '@aws-appsync/utils'
import { buildUpdate } from '../lib/helpers.js'

export function request(ctx) {
  const { id, ...values } = ctx.args.input
  return {
    operation: 'UpdateItem',
    key: util.dynamodb.toMapValues({ id }),
    update: buildUpdate(values),
    condition: {
      expression: 'attribute_exists(#id)',
      expressionNames: { '#id': 'id' },
    },
  }
}

export function response(ctx) {
  return ctx.result
}
```

Imported code must also run in the `APPSYNC_JS` runtime, which supports a subset of JavaScript. To change the esbuild options, or to send files unbundled, see [esbuild options for JavaScript resolvers](./general-config.md#esbuild-options-for-javascript-resolvers).

## TypeScript resolvers

A `code` path ending in `.ts` is transpiled to JavaScript while bundling, with no extra configuration:

```yaml
appSync:
  name: blog-api
  resolvers:
    Query.getPost:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/getPost.ts
```

The resolver in `resolvers/getPost.ts` can use the types from `@aws-appsync/utils` (install it as a dev dependency for the types):

```typescript
import { Context, util } from '@aws-appsync/utils'

export function request(ctx: Context) {
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ id: ctx.args.id }),
  }
}

export function response(ctx: Context) {
  return ctx.result
}
```

esbuild removes the types without checking them; run `tsc --noEmit` to type-check.

## Inline data sources

A `UNIT` resolver's `dataSource` can be a full data source definition instead of a name, for a data source that only this resolver uses. With a Lambda data source, the function can be defined inline too:

```yaml
provider:
  name: aws
  runtime: nodejs24.x

appSync:
  name: blog-api
  resolvers:
    Query.getPost:
      kind: UNIT
      dataSource:
        type: AWS_LAMBDA
        config:
          function:
            handler: functions/getPost.handler
```

The Framework names an inline data source after the resolver key, with its first character that isn't a letter or `_` replaced by `_`: `Query.getPost` becomes the data source and function name `Query_getPost`.

## Inline pipeline functions

A pipeline resolver's `functions` list can hold full [pipeline function](./pipeline-functions.md) definitions instead of names, for functions that only this resolver uses:

```yaml
appSync:
  name: blog-api
  resolvers:
    Query.getPost:
      functions:
        - dataSource: postsTable
          code: functions/getPost.js
```

The Framework names inline functions after the resolver key and their position in the list: `Query_getPost_0`, `Query_getPost_1`.

## Resolver caching

The `caching` key of a resolver caches its results in the API's server-side cache, which [`appSync.caching`](./caching.md) creates. With `behavior: PER_RESOLVER_CACHING`, AppSync caches only the resolvers that set `caching`:

```yaml
appSync:
  name: blog-api
  caching:
    behavior: PER_RESOLVER_CACHING
    type: SMALL
  resolvers:
    Query.getPost:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/getPost.js
      caching:
        ttl: 60
        keys:
          - '$context.arguments.id'
```

| Key    | Type            | Default                                                                           | Description                                                                                            |
| ------ | --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ttl`  | integer, 1–3600 | `appSync.caching.ttl`, else `3600`                                                | Seconds to keep a cached result.                                                                       |
| `keys` | list of strings | `$context.arguments`, `$context.source` and `$context.identity` (AppSync default) | The values that make up the cache key: entries from those three maps, such as `$context.arguments.id`. |

`caching: true` caches the resolver with the API-wide TTL and AppSync's default caching keys, as when `keys` is omitted.

Set `appSync.caching.type`: without it, the Framework creates a legacy `T2_SMALL` cache instance. The instance types and hourly billing are in [AppSync caching](./caching.md).

## Split resolvers across files

`appSync.resolvers` also accepts a list of maps, which the Framework merges into one. Combined with the `${file()}` variable, each file holds some of the resolvers:

```yaml
appSync:
  name: blog-api
  resolvers:
    - ${file(appsync/resolvers/users.yml)}
    - ${file(appsync/resolvers/posts.yml)}
```

Each file is a map of resolver keys to definitions, without the `appSync` and `resolvers` parent keys.

## Related pages

- [AppSync pipeline functions](./pipeline-functions.md)
- [AppSync data sources](./dataSources.md)
- [AWS AppSync JavaScript resolver reference](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-reference-overview-js.html)
- [AWS AppSync VTL resolver reference](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference.html)
