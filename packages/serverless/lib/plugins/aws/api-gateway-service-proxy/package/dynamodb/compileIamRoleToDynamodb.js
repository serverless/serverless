import _ from 'lodash'

const exported = {
  async compileIamRoleToDynamodb() {
    const tableNameActions = _.flatMap(
      this.getAllServiceProxies(),
      (serviceProxy) => {
        return _.flatMap(Object.keys(serviceProxy), (serviceName) => {
          if (serviceName !== 'dynamodb') {
            return []
          }

          return {
            tableName: serviceProxy.dynamodb.tableName,
            action: serviceProxy.dynamodb.action,
          }
        })
      },
    )

    if (tableNameActions.length <= 0) {
      return
    }

    const permissions = tableNameActions.map(({ tableName, action }) => {
      return {
        Effect: 'Allow',
        Action: `dynamodb:${action}`,
        Resource: {
          'Fn::Sub': [
            'arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${tableName}',
            { tableName },
          ],
        },
      }
    })

    const template = {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: 'apigateway.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        Policies: [
          {
            PolicyName: 'apigatewaytodynamodb',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: [
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:PutLogEvents',
                  ],
                  Resource: '*',
                },
                ...permissions,
              ],
            },
          },
        ],
      },
    }

    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      {
        ApigatewayToDynamodbRole: template,
      },
    )
  },
}

export default exported
