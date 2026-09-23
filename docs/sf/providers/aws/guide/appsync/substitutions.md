<!--
title: Serverless Framework - AppSync - Substitutions
description: How to substitute dynamic values into AWS AppSync mapping templates and JS resolvers with the Serverless Framework.
short_title: AppSync - Substitutions
keywords:
  [
    'Serverless Framework',
    'AppSync',
    'Substitutions',
    'Mapping Templates',
    'GraphQL',
    'AWS',
  ]
-->

> ⚠️ Substitutions are deprecated. Use [environment variables](general-config.md) instead.

# Substitutions

Substitutions replace variables in your VTL mapping templates or JS resolvers with dynamic values.

They are useful for injecting resource names or ARNs from your infrastructure, such as a DynamoDB table name, or values like the stage or region.

## Usage

Substitutions are defined as key-value pairs under `appSync.substitutions`, `appSync.resolvers.[resolverName].substitutions` or `appSync.pipelineFunctions.[functionName].substitutions`.

Global substitutions are available to all mapping templates. Resolver and pipeline function substitutions are only available where they are defined, and take precedence over global substitutions with the same name.

In VTL mapping templates, reference a substitution as `${name}`. In JS resolvers, reference it as a string wrapped in `#`, such as `'#name#'`. At deployment time, each reference is replaced with its value.

```yaml
appSync:
  name: my-api
  substitutions: # global substitutions
    postsTable: !Ref Posts
    region: !Ref AWS::Region
    foo: bar

  resolvers:
    Query.user:
      dataSource: my-table
      substitutions: # resolver substitutions
        someVariable: someValue
```

VTL mapping template:

```vtl
{
    "version" : "2018-05-29",
    "operation" : "BatchPutItem",
    "tables" : {
        "${postsTable}": [...]
    }
}
```

JS resolver:

```js
const tableName = '#postsTable#'
return {
  operation: 'BatchGetItem',
  tables: {
    [tableName]: { keys },
  },
}
```
