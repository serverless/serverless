# DataSources

All the DataSources in your AppSync API can be found in serverless.yml under the `appSync.dataSources` property. DataSources are defined as key-value objects, the key being the name of the DataSource.

## DynamoDB

### Quick start

```yaml
appSync:
  dataSources:
    myTableDs:
      type: AMAZON_DYNAMODB
      description: 'My table'
      config:
        tableName: my-table
```

### config

- `tableName`: the name of the DynamoDB table
- `region`: the region of the table. Defaults to the stack's region
- `useCallerCredentials`: Set to `true` to use AWS Identity and Access Management with this data source
- `serviceRoleArn`: The service role ARN for this DataSource. If not provided, a new one will be created.
- `iamRoleStatements`: Statements to use for the generated IAM Role. If not provided, default statements will be used.
- `versioned`: Set to `true` to use Conflict Detection and Resolution with this data source.
- `deltaSyncConfig`:
  - `deltaSyncTableName`: The Delta Sync table name.
  - `baseTableTTL`: The number of minutes that an Item is stored in the data source. Defaults to `43200`
  - `deltaSyncTableTTL`: The number of minutes that a Delta Sync log entry is stored in the Delta Sync table. Defaults to `1440`

## AWS Lambda

### Quick start

```yaml
appSync:
  dataSources:
    myFunction:
      type: 'AWS_LAMBDA'
      config:
        function:
          timeout: 30
          handler: 'functions/myFunction.handler'
```

### config

- `serviceRoleArn`: The service role ARN for this DataSource. If not provided, a new one will be created.
- `iamRoleStatements`: Statements to use for the generated IAM Role. If not provided, default statements will be used.
- `function`: A Lambda function definition as you would define it under the `functions` section of your `serverless.yml` file.
- `functionName`: The name of the function as defined under the `functions` section of the `serverless.yml` file
- `functionAlias`: A specific function alias to use
- `functionArn`: The function ARN to use for this DataSource.

## OpenSearch (ElasticSearch)

### Quick start

```yaml
appSync:
  dataSources:
    search:
      type: 'AMAZON_OPENSEARCH_SERVICE'
      config:
        endpoint: https://abcdefgh.us-east-1.es.amazonaws.com
```

### config

- `endpoint`: The endpoint url to the OpenSearch domain
- `region`: The region of the OpenSearch domain. Defaults to the stack's region.
- `serviceRoleArn`: The service role ARN for this DataSource. If not provided, a new one will be created.
- `iamRoleStatements`: Statements to use for the generated IAM Role. If not provided, default statements will be used.

## HTTP

### Quick start

```yaml
appSync:
  dataSources:
    api:
      type: 'HTTP'
      config:
        endpoint: https://api.example.com
```

### config

- `endpoint`: The url of the HTTP endpoint.
- `serviceRoleArn`: The service role ARN for this DataSource. If not provided, a new one will be created.
- `iamRoleStatements`: Statements to use for the generated IAM Role. If not provided, default statements will be used.
- `authorizationConfig`:
  - `authorizationType`: The authorization type that the HTTP endpoint requires.
    - `AWS_IAM`: The authorization type is Signature Version 4 (SigV4).
  - `awsIamConfig`:
    - `signingRegion`: The signing Region for AWS Identity and Access Management authorization. Defaults to the region of the stack.
    - `signingServiceName`: The signing service name for AWS Identity and Access Management authorization.

## Relational Database

### Quick start

```yaml
appSync:
  dataSources:
    myDatabase:
      type: 'RELATIONAL_DATABASE'
      config:
        databaseName: myDatabase
        dbClusterIdentifier: Ref: RDSCluster
        awsSecretStoreArn: Ref: RDSClusterSecret
        serviceRoleArn: !GetAtt RelationalDbServiceRole.Arn
```

### config

- `databaseName`: The name of the database
- `region`: The region of the RDS HTTP endpoint. Defaults to the region of the stack.
- `awsSecretStoreArn`: The ARN for database credentials stored in AWS Secrets Manager.
- `dbClusterIdentifier`: Amazon RDS cluster Amazon Resource Name (ARN).
- `schema`: Logical schema name.
- `serviceRoleArn`: The service role ARN for this DataSource. If not provided, a new one will be created.
- `iamRoleStatements`: Statements to use for the generated IAM Role. If not provided, default statements will be used.

## EventBridge

```yaml
appSync:
  dataSources:
    myEventBus:
      type: 'AMAZON_EVENTBRIDGE'
      config:
        eventBusArn: !GetAtt MyEventBus.Arn
```

### config

- `eventBusArn`: The ARN of the event bus

## NONE

```yaml
appSync:
  dataSources:
    api:
      type: 'NONE'
```

# Organize your data sources

You can define your data sources into several files for organizational reasons. You can pass each file into the `dataSources` attribute as an array.

```yaml
dataSources:
  - ${file(appsync/dataSources/users.yml)}
  - ${file(appsync/dataSources/posts.yml)}
```
