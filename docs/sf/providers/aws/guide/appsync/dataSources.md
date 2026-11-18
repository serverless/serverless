<!--
title: AppSync Data Sources
description: Connect AppSync resolvers to DynamoDB, Lambda, OpenSearch, HTTP, Aurora, EventBridge or NONE data sources, and control their IAM roles.
short_title: AppSync Data Sources
keywords:
  [
    'Serverless Framework',
    'AppSync data source',
    'AppSync DynamoDB',
    'AppSync Lambda data source',
    'AppSync HTTP data source',
    'AppSync EventBridge',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/dataSources)

<!-- DOCS-SITE-LINK:END -->

# AppSync data sources

The `appSync.dataSources` map defines the AppSync data sources, the backends that [resolvers](./resolvers.md) and [pipeline functions](./pipeline-functions.md) read from and write to. Each key is the data source's name, which resolvers use to reference it, and each value sets its `type` and `config`. The Framework connects data sources to backends (a table, function, domain, endpoint, cluster or event bus) and creates only the Lambda functions you define inline; define the other backends under `resources`, or reference ones that exist.

This data source connects to a DynamoDB table defined under `resources`:

```yaml
appSync:
  name: blog-api
  dataSources:
    postsTable:
      type: AMAZON_DYNAMODB
      description: Blog posts
      config:
        tableName: !Ref PostsTable
```

Every data source has these keys:

| Key           | Type   | Default                     | Description                                                                                                                  |
| ------------- | ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `type`        | string | Required                    | `AMAZON_DYNAMODB`, `AWS_LAMBDA`, `AMAZON_OPENSEARCH_SERVICE`, `HTTP`, `RELATIONAL_DATABASE`, `AMAZON_EVENTBRIDGE` or `NONE`. |
| `description` | string | None                        | A description shown in the AppSync console.                                                                                  |
| `config`      | object | Required, except for `NONE` | The settings for the type, described in the sections that follow.                                                            |

AppSync accepts data source names that match `[_A-Za-z][_0-9A-Za-z]*`: letters, digits and underscores, not starting with a digit. A name such as `posts-table` passes the Framework's checks but AppSync rejects it at deploy time, so use `postsTable` or `posts_table`.

## Data source IAM roles

AppSync assumes an IAM role to reach most data sources. For each data source, the Framework chooses the role this way:

1. With `config.serviceRoleArn`, AppSync uses that role, and the Framework creates none.
2. With `config.iamRoleStatements`, the Framework creates a role that `appsync.amazonaws.com` can assume, with exactly those statements.
3. Otherwise, the Framework creates a role with the default statements for the type, listed in each section that follows. `HTTP` and `NONE` data sources have no default statements and get no role.

`iamRoleStatements` takes a list of statements with `Effect`, `Action` (a list) and `Resource` (a string, intrinsic function or list):

```yaml
appSync:
  name: blog-api
  dataSources:
    postsTable:
      type: AMAZON_DYNAMODB
      config:
        tableName: !Ref PostsTable
        iamRoleStatements:
          - Effect: Allow
            Action:
              - dynamodb:GetItem
              - dynamodb:Query
            Resource:
              - !GetAtt PostsTable.Arn
              - !Join ['/', [!GetAtt PostsTable.Arn, 'index', '*']]
```

## DynamoDB data source

The `AMAZON_DYNAMODB` type connects to a DynamoDB table:

```yaml
appSync:
  name: blog-api
  dataSources:
    postsTable:
      type: AMAZON_DYNAMODB
      config:
        tableName: !Ref PostsTable
```

| Key                                  | Type                | Default                       | Description                                                                                                                      |
| ------------------------------------ | ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tableName`                          | string or intrinsic | Required                      | The table name.                                                                                                                  |
| `region`                             | string or intrinsic | The service's Region          | The table's Region.                                                                                                              |
| `useCallerCredentials`               | boolean             | `false`                       | Calls DynamoDB with the caller's IAM credentials instead of the data source role. For APIs with `AWS_IAM` authorization.         |
| `versioned`                          | boolean             | `false`                       | Turns on conflict detection and resolution for [Delta Sync](./syncConfig.md). Takes effect only together with `deltaSyncConfig`. |
| `deltaSyncConfig.deltaSyncTableName` | string              | Required in `deltaSyncConfig` | The Delta Sync table name.                                                                                                       |
| `deltaSyncConfig.baseTableTTL`       | integer             | `43200`                       | Minutes an item is kept in the base table.                                                                                       |
| `deltaSyncConfig.deltaSyncTableTTL`  | integer             | `1440`                        | Minutes a change log entry is kept in the Delta Sync table.                                                                      |
| `serviceRoleArn`                     | string or intrinsic | A role the Framework creates  | See [Data source IAM roles](#data-source-iam-roles).                                                                             |
| `iamRoleStatements`                  | list                | The default statements        | See [Data source IAM roles](#data-source-iam-roles).                                                                             |

The default statements allow `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan`, `BatchGetItem`, `BatchWriteItem` and `ConditionCheckItem` on the table and its indexes.

## Lambda data source

The `AWS_LAMBDA` type invokes a Lambda function. This data source defines the function inline:

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
          timeout: 10
```

With a [direct Lambda resolver](./resolvers.md#direct-lambda-resolvers), the function in `functions/posts.mjs` receives the GraphQL arguments in `event.arguments` and returns the field's value:

```javascript
export const handler = async (event) => {
  const { id } = event.arguments
  return { id, title: `Post ${id}` }
}
```

| Key                 | Type                | Default                      | Description                                                                                                                                                                  |
| ------------------- | ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `function`          | object              | None                         | A function definition, with the same keys as an entry under `functions`. The Framework adds it to `functions` under the data source's name (`postsFunction` in the example). |
| `functionName`      | string              | None                         | The key of a function defined under `functions` in the same `serverless.yml`.                                                                                                |
| `functionAlias`     | string              | None                         | An alias of the `functionName` function to invoke.                                                                                                                           |
| `functionArn`       | string or intrinsic | None                         | The ARN of an existing function.                                                                                                                                             |
| `serviceRoleArn`    | string or intrinsic | A role the Framework creates | See [Data source IAM roles](#data-source-iam-roles).                                                                                                                         |
| `iamRoleStatements` | list                | The default statements       | See [Data source IAM roles](#data-source-iam-roles).                                                                                                                         |

Set exactly one of `function`, `functionName` or `functionArn`. The default statements allow `lambda:invokeFunction` on the function and on its versions and aliases. To reuse a function from `functions`, reference it by name:

```yaml
functions:
  posts:
    handler: functions/posts.handler

appSync:
  name: blog-api
  dataSources:
    postsFunction:
      type: AWS_LAMBDA
      config:
        functionName: posts
```

## OpenSearch data source

The `AMAZON_OPENSEARCH_SERVICE` type sends requests to an Amazon OpenSearch Service domain, by endpoint or by the logical ID of a domain under `resources`:

```yaml
appSync:
  name: blog-api
  dataSources:
    search:
      type: AMAZON_OPENSEARCH_SERVICE
      config:
        domain: SearchDomain
```

| Key                 | Type                | Default                      | Description                                                                                                                 |
| ------------------- | ------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`          | string or intrinsic | None                         | The domain endpoint, such as `https://search-my-domain-abc123.us-east-1.es.amazonaws.com`.                                  |
| `domain`            | string              | None                         | The logical ID of an `AWS::OpenSearchService::Domain` resource under `resources`; the Framework reads its endpoint and ARN. |
| `region`            | string or intrinsic | The service's Region         | The domain's Region.                                                                                                        |
| `serviceRoleArn`    | string or intrinsic | A role the Framework creates | See [Data source IAM roles](#data-source-iam-roles).                                                                        |
| `iamRoleStatements` | list                | The default statements       | See [Data source IAM roles](#data-source-iam-roles).                                                                        |

Set exactly one of `endpoint` or `domain`. The default statements allow `es:ESHttpDelete`, `ESHttpGet`, `ESHttpHead`, `ESHttpPost`, `ESHttpPut` and `ESHttpPatch`, on a resource that depends on the key you set:

- With `domain`, the resource is the domain's ARN followed by `/*`, so the statements cover the domain.
- With a string `endpoint`, the Framework puts the whole hostname in the ARN (`https://search-my-domain-abc123.us-east-1.es.amazonaws.com` gives `arn:aws:es:us-east-1:123456789012:domain/search-my-domain-abc123.us-east-1.es.amazonaws.com/*`), not the domain name the domain's ARN uses (`domain/my-domain`). For a domain reached by `endpoint`, set `iamRoleStatements` on the domain's ARN, or a `serviceRoleArn`; for a domain under `resources`, use `domain`.

Without `iamRoleStatements` or `serviceRoleArn`, a string `endpoint` needs the form `https://<name>.<region>.es.amazonaws.com`; any other value stops the deploy with `Invalid AWS OpenSearch endpoint`, and an intrinsic `endpoint` stops it with `Could not determine the Arn for dataSource`.

## HTTP data source

The `HTTP` type sends requests to an HTTP endpoint:

```yaml
appSync:
  name: blog-api
  dataSources:
    commentsApi:
      type: HTTP
      config:
        endpoint: https://api.example.com
```

To call an AWS service API, sign the requests with AWS Signature Version 4 and give the data source a role with the permissions the call needs. This data source publishes to an SNS topic:

```yaml
appSync:
  name: blog-api
  dataSources:
    notifications:
      type: HTTP
      config:
        endpoint: https://sns.us-east-1.amazonaws.com
        authorizationConfig:
          authorizationType: AWS_IAM
          awsIamConfig:
            signingRegion: us-east-1
            signingServiceName: sns
        iamRoleStatements:
          - Effect: Allow
            Action:
              - sns:Publish
            Resource: !Ref NotificationsTopic
```

| Key                                                   | Type                | Default                    | Description                                                       |
| ----------------------------------------------------- | ------------------- | -------------------------- | ----------------------------------------------------------------- |
| `endpoint`                                            | string or intrinsic | Required                   | The base URL of the endpoint.                                     |
| `authorizationConfig.authorizationType`               | `AWS_IAM`           | None                       | Signs requests with Signature Version 4. Requires `awsIamConfig`. |
| `authorizationConfig.awsIamConfig.signingRegion`      | string or intrinsic | Required in `awsIamConfig` | The Region to sign for.                                           |
| `authorizationConfig.awsIamConfig.signingServiceName` | string or intrinsic | None                       | The service to sign for, such as `sns` or `states`.               |
| `serviceRoleArn`                                      | string or intrinsic | None                       | See [Data source IAM roles](#data-source-iam-roles).              |
| `iamRoleStatements`                                   | list                | None                       | See [Data source IAM roles](#data-source-iam-roles).              |

HTTP data sources have no default statements. With `authorizationType: AWS_IAM`, set `iamRoleStatements` or `serviceRoleArn`; without either, the deploy stops with `<name>: When using AWS_IAM signature, you must also specify the required iamRoleStatements`.

## Aurora (RDS Data API) data source

The `RELATIONAL_DATABASE` type runs SQL against an Aurora cluster through the RDS Data API, with credentials from AWS Secrets Manager:

```yaml
appSync:
  name: blog-api
  dataSources:
    blogDatabase:
      type: RELATIONAL_DATABASE
      config:
        databaseName: blog
        dbClusterIdentifier: !Ref BlogCluster
        awsSecretStoreArn: !Ref BlogClusterSecret
```

| Key                            | Type                | Default                      | Description                                                                                                                                                   |
| ------------------------------ | ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dbClusterIdentifier`          | string or intrinsic | Required                     | The cluster identifier, not its ARN; `!Ref` on an `AWS::RDS::DBCluster` returns it. The Framework builds the cluster ARN from it, the Region and the account. |
| `awsSecretStoreArn`            | string or intrinsic | Required                     | The ARN of the Secrets Manager secret with the database credentials.                                                                                          |
| `databaseName`                 | string or intrinsic | None                         | The database name.                                                                                                                                            |
| `schema`                       | string              | None                         | The logical schema name.                                                                                                                                      |
| `region`                       | string or intrinsic | The service's Region         | The cluster's Region.                                                                                                                                         |
| `relationalDatabaseSourceType` | `RDS_HTTP_ENDPOINT` | `RDS_HTTP_ENDPOINT`          | The only value AppSync accepts.                                                                                                                               |
| `serviceRoleArn`               | string or intrinsic | A role the Framework creates | See [Data source IAM roles](#data-source-iam-roles).                                                                                                          |
| `iamRoleStatements`            | list                | The default statements       | See [Data source IAM roles](#data-source-iam-roles).                                                                                                          |

The default statements allow `rds-data:DeleteItems`, `ExecuteSql`, `ExecuteStatement`, `GetItems`, `InsertItems` and `UpdateItems` on the cluster, and `secretsmanager:GetSecretValue` on the secret.

## EventBridge data source

The `AMAZON_EVENTBRIDGE` type puts events on an EventBridge event bus:

```yaml
appSync:
  name: blog-api
  dataSources:
    blogEvents:
      type: AMAZON_EVENTBRIDGE
      config:
        eventBusArn: !GetAtt BlogEventBus.Arn
```

| Key                 | Type                | Default                      | Description                                          |
| ------------------- | ------------------- | ---------------------------- | ---------------------------------------------------- |
| `eventBusArn`       | string or intrinsic | Required                     | The ARN of the event bus.                            |
| `serviceRoleArn`    | string or intrinsic | A role the Framework creates | See [Data source IAM roles](#data-source-iam-roles). |
| `iamRoleStatements` | list                | The default statements       | See [Data source IAM roles](#data-source-iam-roles). |

The default statements allow `events:PutEvents` on the event bus.

## NONE data source

The `NONE` type connects to no backend. Resolvers that use it return data computed in the resolver code, for example local publish-only mutations for subscriptions:

```yaml
appSync:
  name: blog-api
  dataSources:
    local:
      type: NONE
```

## Split data sources across files

To keep large APIs readable, `appSync.dataSources` also accepts a list of maps, which the Framework merges into one. Combined with the `${file()}` variable, each file holds some of the data sources:

```yaml
appSync:
  name: blog-api
  dataSources:
    - ${file(appsync/dataSources/users.yml)}
    - ${file(appsync/dataSources/posts.yml)}
```

Each file is a map of data source names to definitions, without the `appSync` and `dataSources` parent keys.

A data source used by only one resolver or pipeline function can also be defined inline in that resolver; see [inline data sources](./resolvers.md#inline-data-sources).

## Related pages

- [AppSync resolvers](./resolvers.md)
- [AppSync pipeline functions](./pipeline-functions.md)
- [Attaching a data source in AWS AppSync](https://docs.aws.amazon.com/appsync/latest/devguide/attaching-a-data-source.html)
