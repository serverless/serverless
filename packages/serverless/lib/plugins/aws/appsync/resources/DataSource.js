import _ from 'lodash'
const { merge } = _

export class DataSource {
  constructor(api, config) {
    this.api = api
    this.config = config
  }

  compile() {
    const resource = {
      Type: 'AWS::AppSync::DataSource',
      Properties: {
        ApiId: this.api.getApiId(),
        Name: this.config.name,
        Description: this.config.description,
        Type: this.config.type,
      },
    }

    if (this.config.type === 'AWS_LAMBDA') {
      resource.Properties.LambdaConfig = {
        LambdaFunctionArn: this.api.getLambdaArn(
          this.config.config,
          this.api.naming.getDataSourceEmbeddedLambdaResolverName(this.config),
        ),
      }
    } else if (this.config.type === 'AMAZON_DYNAMODB') {
      resource.Properties.DynamoDBConfig = this.getDynamoDbConfig(this.config)
    } else if (this.config.type === 'AMAZON_OPENSEARCH_SERVICE') {
      resource.Properties.OpenSearchServiceConfig = this.getOpenSearchConfig(
        this.config,
      )
    } else if (this.config.type === 'RELATIONAL_DATABASE') {
      resource.Properties.RelationalDatabaseConfig = this.getRelationalDbConfig(
        this.config,
      )
    } else if (this.config.type === 'HTTP') {
      resource.Properties.HttpConfig = this.getHttpConfig(this.config)
    } else if (this.config.type === 'AMAZON_EVENTBRIDGE') {
      resource.Properties.EventBridgeConfig = this.getEventBridgeConfig(
        this.config,
      )
    }

    const logicalId = this.api.naming.getDataSourceLogicalId(this.config.name)

    const resources = {
      [logicalId]: resource,
    }

    if ('config' in this.config && this.config.config.serviceRoleArn) {
      resource.Properties.ServiceRoleArn = this.config.config.serviceRoleArn
    } else {
      const role = this.compileDataSourceIamRole()
      if (role) {
        const roleLogicalId = this.api.naming.getDataSourceRoleLogicalId(
          this.config.name,
        )
        resource.Properties.ServiceRoleArn = {
          'Fn::GetAtt': [roleLogicalId, 'Arn'],
        }
        merge(resources, role)
      }
    }

    return resources
  }

  getDynamoDbConfig(config) {
    return {
      AwsRegion: config.config.region || { Ref: 'AWS::Region' },
      TableName: config.config.tableName,
      UseCallerCredentials: !!config.config.useCallerCredentials,
      ...this.getDeltaSyncConfig(config),
    }
  }

  getDeltaSyncConfig(config) {
    if (config.config.versioned && config.config.deltaSyncConfig) {
      return {
        Versioned: true,
        DeltaSyncConfig: {
          BaseTableTTL: config.config.deltaSyncConfig.baseTableTTL || 43200,
          DeltaSyncTableName: config.config.deltaSyncConfig.deltaSyncTableName,
          DeltaSyncTableTTL:
            config.config.deltaSyncConfig.deltaSyncTableTTL || 1440,
        },
      }
    }
  }

  getEventBridgeConfig(config) {
    return {
      EventBusArn: config.config.eventBusArn,
    }
  }

  getOpenSearchConfig(config) {
    const endpoint =
      config.config.endpoint ||
      (config.config.domain && {
        'Fn::Join': [
          '',
          [
            'https://',
            { 'Fn::GetAtt': [config.config.domain, 'DomainEndpoint'] },
          ],
        ],
      })
    // FIXME: can we validate this and make TS infer mutually eclusive types?
    if (!endpoint) {
      throw new Error('Specify either endpoint or domain')
    }
    return {
      AwsRegion: config.config.region || { Ref: 'AWS::Region' },
      Endpoint: endpoint,
    }
  }

  getRelationalDbConfig(config) {
    return {
      RdsHttpEndpointConfig: {
        AwsRegion: config.config.region || { Ref: 'AWS::Region' },
        DbClusterIdentifier: {
          'Fn::Join': [
            ':',
            [
              'arn',
              'aws',
              'rds',
              config.config.region || { Ref: 'AWS::Region' },
              { Ref: 'AWS::AccountId' },
              'cluster',
              config.config.dbClusterIdentifier,
            ],
          ],
        },
        DatabaseName: config.config.databaseName,
        Schema: config.config.schema,
        AwsSecretStoreArn: config.config.awsSecretStoreArn,
      },
      RelationalDatabaseSourceType:
        config.config.relationalDatabaseSourceType || 'RDS_HTTP_ENDPOINT',
    }
  }

  getHttpConfig(config) {
    return {
      Endpoint: config.config.endpoint,
      ...this.getHttpAuthorizationConfig(config),
    }
  }

  getHttpAuthorizationConfig(config) {
    const authConfig = config.config.authorizationConfig
    if (authConfig) {
      return {
        AuthorizationConfig: {
          AuthorizationType: authConfig.authorizationType,
          AwsIamConfig: {
            SigningRegion: authConfig.awsIamConfig.signingRegion || {
              Ref: 'AWS::Region',
            },
            SigningServiceName: authConfig.awsIamConfig.signingServiceName,
          },
        },
      }
    }
  }

  compileDataSourceIamRole() {
    if ('config' in this.config && this.config.config.serviceRoleArn) {
      return
    }

    let statements

    if (
      this.config.type === 'HTTP' &&
      this.config.config &&
      this.config.config.authorizationConfig &&
      this.config.config.authorizationConfig.authorizationType === 'AWS_IAM' &&
      !this.config.config.iamRoleStatements
    ) {
      throw new Error(
        `${this.config.name}: When using AWS_IAM signature, you must also specify the required iamRoleStatements`,
      )
    }

    if ('config' in this.config && this.config.config.iamRoleStatements) {
      statements = this.config.config.iamRoleStatements
    } else {
      // Try to generate default statements for the given this.config.
      statements = this.getDefaultDataSourcePolicyStatements()
    }

    if (!statements || statements.length === 0) {
      return
    }

    const logicalId = this.api.naming.getDataSourceRoleLogicalId(
      this.config.name,
    )

    return {
      [logicalId]: {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: ['appsync.amazonaws.com'],
                },
                Action: ['sts:AssumeRole'],
              },
            ],
          },
          Policies: [
            {
              PolicyName: `AppSync-Datasource-${this.config.name}`,
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: statements,
              },
            },
          ],
        },
      },
    }
  }

  getDefaultDataSourcePolicyStatements() {
    switch (this.config.type) {
      case 'AWS_LAMBDA': {
        const lambdaArn = this.api.getLambdaArn(
          this.config.config,
          this.api.naming.getDataSourceEmbeddedLambdaResolverName(this.config),
        )

        // Allow "invoke" for the Datasource's function and its aliases/versions
        const defaultLambdaStatement = {
          Action: ['lambda:invokeFunction'],
          Effect: 'Allow',
          Resource: [lambdaArn, { 'Fn::Join': [':', [lambdaArn, '*']] }],
        }

        return [defaultLambdaStatement]
      }
      case 'AMAZON_DYNAMODB': {
        const dynamoDbResourceArn = {
          'Fn::Join': [
            ':',
            [
              'arn',
              'aws',
              'dynamodb',
              this.config.config.region || { Ref: 'AWS::Region' },
              { Ref: 'AWS::AccountId' },
              `table`,
            ],
          ],
        }

        // Allow any action on the Datasource's table
        const defaultDynamoDBStatement = {
          Action: [
            'dynamodb:DeleteItem',
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:UpdateItem',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:ConditionCheckItem',
          ],
          Effect: 'Allow',
          Resource: [
            {
              'Fn::Join': [
                '/',
                [dynamoDbResourceArn, this.config.config.tableName],
              ],
            },
            {
              'Fn::Join': [
                '/',
                [dynamoDbResourceArn, this.config.config.tableName, '*'],
              ],
            },
          ],
        }

        return [defaultDynamoDBStatement]
      }
      case 'RELATIONAL_DATABASE': {
        const dDbResourceArn = {
          'Fn::Join': [
            ':',
            [
              'arn',
              'aws',
              'rds',
              this.config.config.region || { Ref: 'AWS::Region' },
              { Ref: 'AWS::AccountId' },
              'cluster',
              this.config.config.dbClusterIdentifier,
            ],
          ],
        }
        const dbStatement = {
          Effect: 'Allow',
          Action: [
            'rds-data:DeleteItems',
            'rds-data:ExecuteSql',
            'rds-data:ExecuteStatement',
            'rds-data:GetItems',
            'rds-data:InsertItems',
            'rds-data:UpdateItems',
          ],
          Resource: [
            dDbResourceArn,
            { 'Fn::Join': [':', [dDbResourceArn, '*']] },
          ],
        }

        const secretManagerStatement = {
          Effect: 'Allow',
          Action: ['secretsmanager:GetSecretValue'],
          Resource: [
            this.config.config.awsSecretStoreArn,
            { 'Fn::Join': [':', [this.config.config.awsSecretStoreArn, '*']] },
          ],
        }

        return [dbStatement, secretManagerStatement]
      }
      case 'AMAZON_OPENSEARCH_SERVICE': {
        let arn
        if (
          this.config.config.endpoint &&
          typeof this.config.config.endpoint === 'string'
        ) {
          // FIXME: Do new domains have a different API? (opensearch)
          const rx =
            /^https:\/\/([a-z0-9-]+\.(\w{2}-[a-z]+-\d)\.es\.amazonaws\.com)$/
          const result = rx.exec(this.config.config.endpoint)
          if (!result) {
            throw new Error(
              `Invalid AWS OpenSearch endpoint: '${this.config.config.endpoint}`,
            )
          }
          arn = {
            'Fn::Join': [
              ':',
              [
                'arn',
                'aws',
                'es',
                result[2],
                { Ref: 'AWS::AccountId' },
                `domain/${result[1]}/*`,
              ],
            ],
          }
        } else if (this.config.config.domain) {
          arn = {
            'Fn::Join': [
              '/',
              [{ 'Fn::GetAtt': [this.config.config.domain, 'Arn'] }, '*'],
            ],
          }
        } else {
          throw new Error(
            `Could not determine the Arn for dataSource '${this.config.name}`,
          )
        }

        // Allow any action on the Datasource's ES endpoint
        const defaultESStatement = {
          Action: [
            'es:ESHttpDelete',
            'es:ESHttpGet',
            'es:ESHttpHead',
            'es:ESHttpPost',
            'es:ESHttpPut',
            'es:ESHttpPatch',
          ],
          Effect: 'Allow',
          Resource: [arn],
        }

        return [defaultESStatement]
      }
      case 'AMAZON_EVENTBRIDGE': {
        // Allow PutEvents on the EventBridge bus
        const defaultEventBridgeStatement = {
          Action: ['events:PutEvents'],
          Effect: 'Allow',
          Resource: [this.config.config.eventBusArn],
        }

        return [defaultEventBridgeStatement]
      }
    }
  }
}
