<!--
title: AppSync Delta Sync and Conflict Resolution
description: 'Set conflict detection and resolution for AppSync resolvers on versioned DynamoDB data sources: optimistic concurrency, automerge or Lambda.'
short_title: AppSync Delta Sync
keywords:
  [
    'Serverless Framework',
    'AppSync Delta Sync',
    'AppSync conflict detection',
    'AppSync conflict resolution',
    'AppSync versioned data source',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/syncConfig)

<!-- DOCS-SITE-LINK:END -->

# AppSync Delta Sync and conflict resolution

The `sync` key of an AppSync resolver or pipeline function sets how AppSync detects and resolves conflicting writes to a [versioned DynamoDB data source](https://docs.aws.amazon.com/appsync/latest/devguide/conflict-detection-and-sync.html). Use it for offline-capable clients that sync with Delta Sync and can send writes based on stale data. AppSync resolves conflicts with optimistic concurrency (rejects the write), automerge, or a Lambda function you provide.

This configuration versions a DynamoDB data source and resolves conflicts on `Mutation.updatePost` with automerge:

```yaml
appSync:
  name: blog-api
  dataSources:
    postsTable:
      type: AMAZON_DYNAMODB
      config:
        tableName: !Ref PostsTable
        versioned: true
        deltaSyncConfig:
          deltaSyncTableName: blog-api-posts-delta
  resolvers:
    Mutation.updatePost:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/updatePost.js
      sync:
        conflictDetection: VERSION
        conflictHandler: AUTOMERGE
```

The data source needs both `versioned: true` and `deltaSyncConfig`; the Delta Sync table settings are on the [AppSync data sources](./dataSources.md#dynamodb-data-source) page. The data source's default IAM statements cover only the base table and its indexes; to let AppSync write the Delta Sync table, list both tables in the data source's [`iamRoleStatements`](./dataSources.md#data-source-iam-roles).

## Sync keys

The `sync` key is available on resolvers (`appSync.resolvers.<resolver>.sync`) and pipeline functions (`appSync.pipelineFunctions.<function>.sync`):

| Key                 | Type                                              | Default                  | Description                                                                                                                                                                |
| ------------------- | ------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conflictDetection` | `VERSION` or `NONE`                               | `VERSION`                | `VERSION` compares the item's version with the version the client sends. `NONE` turns detection off.                                                                       |
| `conflictHandler`   | `OPTIMISTIC_CONCURRENCY`, `AUTOMERGE` or `LAMBDA` | `OPTIMISTIC_CONCURRENCY` | What AppSync does with a conflict: reject the write, merge the items, or call a Lambda function. Ignored when `conflictDetection` is `NONE`. Set it in every `sync` block. |
| `function`          | object                                            | None                     | With `LAMBDA`: a function definition, with the same keys as an entry under `functions`.                                                                                    |
| `functionName`      | string                                            | None                     | With `LAMBDA`: the key of a function defined under `functions`.                                                                                                            |
| `functionAlias`     | string                                            | None                     | With `LAMBDA`: an alias of the `functionName` function.                                                                                                                    |
| `functionArn`       | string                                            | None                     | With `LAMBDA`: the ARN of an existing function.                                                                                                                            |

Set `conflictHandler` in every `sync` block, also with `conflictDetection: NONE`. When a `sync` block leaves `conflictHandler` out, the Framework deploys it with `OPTIMISTIC_CONCURRENCY`, and configuration validation reports `must specify functionName, functionArn or function (all exclusives)` for that block: a warning by default, and an error that stops the command with `configValidationMode: error`.

## Resolve conflicts with a Lambda function

With `conflictHandler: LAMBDA`, set exactly one of `function`, `functionName` or `functionArn`. This resolver defines the conflict handler inline:

```yaml
provider:
  name: aws
  runtime: nodejs24.x

appSync:
  name: blog-api
  resolvers:
    Mutation.updatePost:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/updatePost.js
      sync:
        conflictHandler: LAMBDA
        function:
          handler: functions/resolveConflict.handler
```

The Framework adds an inline conflict handler to `functions` as `<Type>_<field>_Sync` for a resolver (`Mutation_updatePost_Sync` here) or `<function name>_Sync` for a pipeline function. The function's input and the responses it can return are described in the AWS guide to [conflict detection and resolution](https://docs.aws.amazon.com/appsync/latest/devguide/conflict-detection-and-resolution.html).

## Related pages

- [AppSync data sources](./dataSources.md)
- [AppSync resolvers](./resolvers.md)
- [AppSync pipeline functions](./pipeline-functions.md)
