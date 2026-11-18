<!--
title: AppSync API Configuration
description: 'Configure the API-wide appSync keys: schema files, logging, X-Ray, visibility, query limits, environment variables, tags and esbuild.'
short_title: AppSync General Configuration
keywords:
  [
    'Serverless Framework',
    'AWS AppSync configuration',
    'AppSync schema',
    'AppSync logging',
    'AppSync environment variables',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/general-config)

<!-- DOCS-SITE-LINK:END -->

# AppSync API configuration

The top-level `appSync` block in `serverless.yml` holds one AppSync GraphQL API per service. This page covers the keys that apply to the whole API: its name, schema files, logging, tracing, visibility, query limits, environment variables, tags and the esbuild options for JavaScript resolvers. Data sources, resolvers, authentication and the other features have their own pages, linked from the [AppSync overview](./README.md).

The following `appSync` block sets the API-wide keys alongside the required `name` and `authentication`:

```yaml
appSync:
  name: blog-api
  schema: schema.graphql
  authentication:
    type: API_KEY
  xrayEnabled: true
  introspection: false
  queryDepthLimit: 10
  resolverCountLimit: 500
  logging:
    level: ERROR
    retentionInDays: 14
  environment:
    POSTS_TABLE: !Ref PostsTable
  tags:
    team: blog
```

## AppSync API-wide keys

All keys sit directly under `appSync`. Keys not listed on this page or the linked pages are rejected with `invalid (unknown) property`.

| Key                         | Type                      | Default                         | Description                                                                                                                                                                                                      |
| --------------------------- | ------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                      | string                    | Required                        | The name of the AppSync API.                                                                                                                                                                                     |
| `authentication`            | object                    | Required                        | The default authorization mode. See [AppSync authentication](./authentication.md).                                                                                                                               |
| `schema`                    | string or list of strings | `schema.graphql`                | Schema file paths or glob patterns, relative to the service directory. See [GraphQL schema files](#graphql-schema-files).                                                                                        |
| `xrayEnabled`               | boolean                   | `false`                         | Enables AWS X-Ray tracing for the API.                                                                                                                                                                           |
| `visibility`                | `GLOBAL` or `PRIVATE`     | `GLOBAL` (AppSync default)      | `PRIVATE` makes the API reachable only from a VPC endpoint. AppSync sets visibility when it creates the API, so changing this value on a deployed API replaces the API, with a new API ID and new endpoint URLs. |
| `introspection`             | boolean                   | `true`                          | Set to `false` to reject GraphQL introspection queries.                                                                                                                                                          |
| `queryDepthLimit`           | integer, 1–75             | No limit                        | The maximum number of nested levels in a query.                                                                                                                                                                  |
| `resolverCountLimit`        | integer, 1–1000           | AppSync default (10000)         | The maximum number of resolvers one request can invoke.                                                                                                                                                          |
| `environment`               | map of strings            | None                            | Environment variables for resolvers and functions. See [AppSync environment variables](#appsync-environment-variables).                                                                                          |
| `tags`                      | map of strings            | None                            | Tags for the API. The same tags apply to the WAF web ACL the Framework creates.                                                                                                                                  |
| `logging`                   | object                    | No logging                      | Field-level logging to CloudWatch Logs. See [AppSync logging](#appsync-logging).                                                                                                                                 |
| `esbuild`                   | object or `false`         | esbuild with the defaults below | Options for bundling JavaScript and TypeScript resolvers. See [esbuild options for JavaScript resolvers](#esbuild-options-for-javascript-resolvers).                                                             |
| `additionalAuthentications` | list                      | None                            | Additional authorization modes. See [AppSync authentication](./authentication.md).                                                                                                                               |
| `apiKeys`                   | list                      | None                            | See [AppSync API keys](./API-keys.md).                                                                                                                                                                           |
| `dataSources`               | map, or list of maps      | None                            | See [AppSync data sources](./dataSources.md).                                                                                                                                                                    |
| `resolvers`                 | map, or list of maps      | None                            | See [AppSync resolvers](./resolvers.md).                                                                                                                                                                         |
| `pipelineFunctions`         | map, or list of maps      | None                            | See [AppSync pipeline functions](./pipeline-functions.md).                                                                                                                                                       |
| `substitutions`             | map                       | None                            | See [AppSync substitutions](./substitutions.md).                                                                                                                                                                 |
| `caching`                   | object                    | No cache                        | See [AppSync caching](./caching.md).                                                                                                                                                                             |
| `domain`                    | object                    | None                            | See [AppSync custom domain](./custom-domain.md).                                                                                                                                                                 |
| `waf`                       | object                    | None                            | See [AppSync WAF](./WAF.md).                                                                                                                                                                                     |

The Framework checks the `appSync` block against its schema before packaging. With the default `configValidationMode: warn`, an invalid block prints `Invalid AppSync Configuration` followed by each problem as a warning and the command continues; with `configValidationMode: error`, the command stops; with `off`, nothing is printed.

## GraphQL schema files

The `appSync.schema` key names the GraphQL schema file, relative to the service directory (the directory that holds `serverless.yml`). Without it, the Framework reads `schema.graphql`:

```yaml
appSync:
  name: blog-api
  schema: api/schema.graphql
```

To split the schema across files, list them, or use glob patterns:

```yaml
appSync:
  name: blog-api
  schema:
    - schemas/base.graphql
    - schemas/users/*.graphql
```

Before deploying, the Framework validates the schema, with the AppSync directives and scalars (such as `@aws_iam`, `@aws_subscribe` and `AWSDateTime`) predefined. To run the same check without deploying, use [`serverless appsync validate-schema`](./commands.md#validate-the-schema).

### Merging schema files

With several schema files, the Framework merges them into one schema before sending it to AppSync. Declare `Query` and `Mutation` once, then add fields to them with [object extensions](https://spec.graphql.org/October2021/#sec-Object-Extensions) in the other files:

```graphql
# schemas/base.graphql
type Query
type Mutation
```

```graphql
# schemas/users.graphql
extend type Query {
  getUser(id: ID!): User
}

extend type Mutation {
  createUser(name: String!): User
}

type User {
  id: ID!
  name: String!
}
```

The merged schema that AppSync receives has a single `Query` type with `getUser` and a single `Mutation` type with `createUser`.

The merge keeps descriptions written with three double quotes (`"""`) and `&` between implemented interfaces, drops `#` comments, and sorts the type definitions alphabetically. A schema from a single file is sent unchanged, so to keep `#` comments, put the whole schema in one file.

## AppSync logging

The `appSync.logging` block sends AppSync field-level logs to CloudWatch Logs:

```yaml
appSync:
  name: blog-api
  logging:
    level: ERROR
    retentionInDays: 14
```

| Key                     | Type                                      | Default                       | Description                                                                                                                                                                |
| ----------------------- | ----------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`                 | `NONE`, `ERROR`, `INFO`, `DEBUG` or `ALL` | Required                      | The field log level. `INFO` includes messages your resolvers write with `console.log`, `DEBUG` also includes `console.debug` messages, and `ALL` adds field-level tracing. |
| `enabled`               | boolean                                   | `true`                        | Set to `false` to keep the block but turn logging off.                                                                                                                     |
| `excludeVerboseContent` | boolean                                   | `false`                       | Leaves headers, context and evaluated mapping templates out of the logs, at any level.                                                                                     |
| `retentionInDays`       | integer                                   | `provider.logRetentionInDays` | Days to keep the logs. When neither is set, the logs never expire.                                                                                                         |
| `roleArn`               | string or intrinsic                       | A role the Framework creates  | The IAM role AppSync assumes to write the logs.                                                                                                                            |

With logging enabled, the Framework creates the log group `/aws/appsync/apis/<api id>` with the retention above. Without `roleArn`, it also creates an IAM role that AppSync assumes, allowed `logs:CreateLogGroup`, `logs:CreateLogStream` and `logs:PutLogEvents` on that log group only. With `enabled: false`, the Framework creates no log group, no role and no log configuration. [`serverless appsync logs`](./commands.md#print-the-api-logs) prints the log group's events.

## AppSync environment variables

The `appSync.environment` map sets [AppSync environment variables](https://docs.aws.amazon.com/appsync/latest/devguide/environment-variables.html), which JavaScript resolvers read from `ctx.env` and VTL templates from `$ctx.env`. Values are strings or CloudFormation intrinsic functions:

```yaml
appSync:
  name: blog-api
  environment:
    POSTS_TABLE: !Ref PostsTable
    STAGE: ${sls:stage}
```

A JavaScript resolver then reads `ctx.env.POSTS_TABLE`. AppSync allows up to 50 variables per API; keys start with a letter, are at least two characters long and contain only letters, numbers and `_`; values are up to 512 characters and are always strings. For secrets, read them at run time from AWS Secrets Manager or Parameter Store instead.

## esbuild options for JavaScript resolvers

The Framework bundles every JavaScript or TypeScript resolver and pipeline function `code` file with esbuild into one ESM file, as AppSync requires. The `appSync.esbuild` block passes extra options to esbuild:

```yaml
appSync:
  name: blog-api
  esbuild:
    target: es2020
    sourcemap: false
```

Without the block, the Framework uses `target: esnext`, `sourcemap: inline`, `sourcesContent: false` and `treeShaking: true`. It always sets `platform: node`, `format: esm`, `bundle: true`, `write: false`, the entry point and `external: ['@aws-appsync/utils']`, and ignores those keys in `appSync.esbuild`. Some esbuild options produce code the `APPSYNC_JS` runtime rejects; see the AWS guidance on [bundling, TypeScript and source maps](https://docs.aws.amazon.com/appsync/latest/devguide/additional-utilities.html).

To send each file to AppSync unchanged, set `esbuild: false`. Each `code` file must then be a single JavaScript ESM file whose only imports are `@aws-appsync/*` modules.

## Related pages

- [AppSync overview](./README.md)
- [AppSync resolvers](./resolvers.md)
- [AppSync CLI commands](./commands.md)
- [Serverless.yml reference](../serverless.yml.md)
