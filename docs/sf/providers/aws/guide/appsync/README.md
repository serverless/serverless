<!--
title: AppSync GraphQL APIs
description: 'Deploy an AWS AppSync GraphQL API from serverless.yml with the built-in appSync block: schema, data sources, resolvers and auth.'
short_title: AppSync
keywords:
  [
    'Serverless Framework',
    'AWS AppSync',
    'GraphQL API',
    'AppSync resolvers',
    'AppSync data sources',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync)

<!-- DOCS-SITE-LINK:END -->

# AppSync GraphQL APIs

The top-level `appSync` block in `serverless.yml` deploys an AWS AppSync GraphQL API with your service: the schema, data sources, resolvers, authentication, API keys and optional caching, WAF and custom domain. The integration is built into Serverless Framework v4, so there is no plugin to install; it loads whenever `serverless.yml` has an `appSync` block, and `serverless deploy` creates the API in the same CloudFormation stack as your functions.

## Quick start: a GraphQL API backed by DynamoDB

This service creates a DynamoDB table, a GraphQL API with API key authentication, and two JavaScript (`APPSYNC_JS`) resolvers that read and write the table:

```yaml
# serverless.yml
service: blog-api

provider:
  name: aws
  region: us-east-1

appSync:
  name: blog-api
  authentication:
    type: API_KEY
  apiKeys:
    - name: defaultKey
      expiresAfter: 30d
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
    Mutation.createPost:
      kind: UNIT
      dataSource: postsTable
      code: resolvers/createPost.js

resources:
  Resources:
    PostsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
```

By default, the Framework reads the GraphQL schema from `schema.graphql` in the service directory (the directory that holds `serverless.yml`); to use other files, see [GraphQL schema files](./general-config.md#graphql-schema-files):

```graphql
type Post {
  id: ID!
  title: String!
}

type Query {
  getPost(id: ID!): Post
}

type Mutation {
  createPost(title: String!): Post
}
```

Each resolver's `code` path is relative to the service directory. `resolvers/getPost.js` reads one item:

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

`resolvers/createPost.js` writes one item with a generated ID:

```javascript
import { util } from '@aws-appsync/utils'

export function request(ctx) {
  return {
    operation: 'PutItem',
    key: util.dynamodb.toMapValues({ id: util.autoId() }),
    attributeValues: util.dynamodb.toMapValues({ title: ctx.args.title }),
  }
}

export function response(ctx) {
  return ctx.result
}
```

`@aws-appsync/utils` is provided by the AppSync runtime; the Framework bundles each resolver with esbuild and leaves that import external, so you don't need to install it (install it as a dev dependency only for editor types).

Deploy the service:

```bash
serverless deploy
```

The deploy output lists the API endpoints and API keys:

```text
appsync endpoints:
  graphql: https://abcdefghijklmnopqrstuvwxyz.appsync-api.us-east-1.amazonaws.com/graphql
  realtime: wss://abcdefghijklmnopqrstuvwxyz.appsync-realtime-api.us-east-1.amazonaws.com/graphql
appsync api keys:
  da2-abcdefghijklmnopqrstuvwxyz (defaultKey)
```

To test the API, send a mutation with the API key in the `x-api-key` header, replacing `GRAPHQL_URL` and `API_KEY` with the values from the deploy output:

```bash
curl -s GRAPHQL_URL \
  -H 'content-type: application/json' \
  -H 'x-api-key: API_KEY' \
  -d '{"query":"mutation { createPost(title: \"Hello\") { id title } }"}'
```

`serverless info` prints the endpoints and keys again (add `--conceal` to hide the keys), and `serverless remove` deletes the API, the table and the rest of the stack.

## Require Cognito sign-in and keep one query public

To require Amazon Cognito user pool tokens for the API and still let clients with an API key call one query, make Cognito user pools the default authorization mode and add `API_KEY` as an additional mode:

```yaml
appSync:
  name: blog-api
  authentication:
    type: AMAZON_COGNITO_USER_POOLS
    config:
      userPoolId: us-east-1_aBcDeFgHi
  additionalAuthentications:
    - type: API_KEY
  apiKeys:
    - name: publicKey
```

`userPoolId` also accepts `!Ref` to an `AWS::Cognito::UserPool` resource under `resources`. With additional modes, AppSync applies the default mode to every field and type without an authorization directive. Mark the public query and the type it returns with `@aws_api_key` in `schema.graphql`, and list `@aws_cognito_user_pools` next to it so signed-in users keep access:

```graphql
type Post @aws_cognito_user_pools @aws_api_key {
  id: ID!
  title: String!
}

type Query {
  getPost(id: ID!): Post @aws_cognito_user_pools @aws_api_key
}

type Mutation {
  createPost(title: String!): Post
}
```

`Mutation.createPost` has no directive, so it accepts only Cognito user pool tokens. The rules for each mode and for combining them are in [AppSync authentication](./authentication.md).

## AppSync configuration pages

- [General configuration](./general-config.md): the `appSync` keys that apply to the whole API: schema files, logging, X-Ray, visibility, query limits, environment variables, tags and esbuild options.
- [Authentication](./authentication.md): the default and additional authorization modes (API key, IAM, Cognito user pools, OpenID Connect, Lambda authorizer).
- [API keys](./API-keys.md): API keys and their expiry.
- [Data sources](./dataSources.md): DynamoDB, Lambda, OpenSearch, HTTP, Aurora (RDS Data API), EventBridge and `NONE` data sources, and the IAM roles the Framework creates for them.
- [Resolvers](./resolvers.md): unit and pipeline resolvers with JavaScript, VTL or direct Lambda, bundling, TypeScript and per-resolver caching.
- [Pipeline functions](./pipeline-functions.md): the functions that pipeline resolvers run in sequence.
- [Substitutions](./substitutions.md): placeholders in resolver code and VTL templates that the Framework replaces at deploy time.
- [Caching](./caching.md): the AppSync server-side cache for the API.
- [Delta Sync](./syncConfig.md): conflict detection and resolution for versioned DynamoDB data sources.
- [Custom domain](./custom-domain.md): a custom domain name for the API, managed by CloudFormation or by CLI commands.
- [WAF](./WAF.md): an AWS WAF web ACL with throttling, introspection blocking, custom rules and per-API-key rules.
- [AppSync CLI commands](./commands.md): `serverless appsync` commands for schema validation, introspection, cache flushing, logs and domain management.

## AppSync variables

The `${appsync:…}` variables reference the deployed API elsewhere in `serverless.yml`:

| Variable                 | Value                                                      |
| ------------------------ | ---------------------------------------------------------- |
| `${appsync:id}`          | The API ID                                                 |
| `${appsync:url}`         | The GraphQL endpoint URL                                   |
| `${appsync:arn}`         | The API ARN                                                |
| `${appsync:apiKey.NAME}` | The value of the API key named `NAME` in `appSync.apiKeys` |

These variables resolve to CloudFormation `Fn::GetAtt` references, so they work only in values that end up in the CloudFormation template, such as `provider.environment`, function `environment` or `resources`. To pass the API URL and an API key to your Lambda functions:

```yaml
provider:
  name: aws
  environment:
    APPSYNC_URL: ${appsync:url}
    APPSYNC_API_KEY: ${appsync:apiKey.defaultKey}

appSync:
  name: blog-api
  authentication:
    type: API_KEY
  apiKeys:
    - name: defaultKey
```

## Migrate from serverless-appsync-plugin

The built-in integration derives from the community [`serverless-appsync-plugin`](https://github.com/sid88in/serverless-appsync-plugin) and reads the same `appSync` configuration. To switch to it, remove `serverless-appsync-plugin` from the `plugins` list in `serverless.yml` and from your `package.json` dependencies, and keep your `appSync` block. While `serverless-appsync-plugin` is listed under `plugins`, the Framework loads that installed plugin instead of the built-in integration.

## Related pages

- [AWS AppSync Developer Guide](https://docs.aws.amazon.com/appsync/latest/devguide/what-is-appsync.html)
- [Functions](../functions.md): Lambda functions that AppSync Lambda data sources and authorizers invoke
- [AWS CloudFormation resources](../resources.md): the `resources` block used for the DynamoDB table in the quick start
