<!--
title: AppSync Substitutions
description: Replace placeholders in AppSync JavaScript resolvers and VTL templates with values from serverless.yml at deploy time.
short_title: AppSync Substitutions
keywords:
  [
    'Serverless Framework',
    'AppSync substitutions',
    'AppSync mapping template variables',
    'AppSync resolver table name',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/substitutions)

<!-- DOCS-SITE-LINK:END -->

# AppSync substitutions

Substitutions replace placeholders in AppSync resolver and pipeline function code with values from `serverless.yml` when you deploy, such as a DynamoDB table name, an ARN, the stage or the Region. Substitutions are deprecated: use [AppSync environment variables](./general-config.md#appsync-environment-variables) instead, which resolvers read from `ctx.env` at run time without rewriting the code.

This configuration defines a global substitution with the table name and uses it in a JavaScript resolver:

```yaml
appSync:
  name: blog-api
  substitutions:
    postsTable: !Ref PostsTable
  resolvers:
    Query.getPosts:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/getPosts.js
```

In JavaScript, a placeholder is the substitution's name between `#` characters, inside a string. `resolvers/getPosts.js` reads several posts by ID:

```javascript
import { util } from '@aws-appsync/utils'

export function request(ctx) {
  return {
    operation: 'BatchGetItem',
    tables: {
      '#postsTable#': {
        keys: ctx.args.ids.map((id) => util.dynamodb.toMapValues({ id })),
      },
    },
  }
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type)
  }
  return ctx.result.data['#postsTable#']
}
```

When DynamoDB processes only part of the batch, AppSync sets `ctx.error` and returns `null` for each unprocessed key; the response handler raises that error, so clients don't mistake an unread post for a missing one.

## Where substitutions are defined

Substitutions are maps of names to values at three levels:

- `appSync.substitutions`: available to every resolver and pipeline function.
- `appSync.resolvers.<resolver>.substitutions`: available to that resolver only.
- `appSync.pipelineFunctions.<function>.substitutions`: available to that pipeline function only.

When a resolver or pipeline function defines a name that is also global, its own value wins. Names contain letters, digits, `_` and `-`. Values are strings or CloudFormation intrinsic functions such as `!Ref` and `!GetAtt`; CloudFormation resolves intrinsic values during the deploy.

## Placeholder syntax

The placeholder syntax depends on the runtime of the file:

| File                                 | Placeholder | Example           |
| ------------------------------------ | ----------- | ----------------- |
| JavaScript or TypeScript `code`      | `#name#`    | `'#postsTable#'`  |
| VTL `request` or `response` template | `${name}`   | `"${postsTable}"` |

The Framework replaces only placeholders whose name is defined at one of the three levels; other text, including VTL references such as `${ctx.args.id}`, stays unchanged. In JavaScript files, the replacement runs on the bundled code, after esbuild.

This VTL request template uses the same `postsTable` substitution:

```text
#set($keys = [])
#foreach($id in $ctx.args.ids)
  $util.qr($keys.add({ "id": $util.dynamodb.toDynamoDB($id) }))
#end
{
  "version": "2018-05-29",
  "operation": "BatchGetItem",
  "tables": {
    "${postsTable}": {
      "keys": $util.toJson($keys)
    }
  }
}
```

## Related pages

- [AppSync environment variables](./general-config.md#appsync-environment-variables)
- [AppSync resolvers](./resolvers.md)
- [AppSync pipeline functions](./pipeline-functions.md)
