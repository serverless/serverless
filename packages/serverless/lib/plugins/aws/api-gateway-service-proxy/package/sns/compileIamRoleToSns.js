import _ from 'lodash'

const SERVICE_NAME = 'sns'

const exported = {
  compileIamRoleToSns() {
    if (!this.shouldCreateDefaultRole(SERVICE_NAME)) {
      return
    }

    const topicNames = this.getAllServiceProxies()
      .filter(
        (serviceProxy) => this.getServiceName(serviceProxy) === SERVICE_NAME,
      )
      .map((serviceProxy) => {
        const serviceName = this.getServiceName(serviceProxy)
        const { topicName } = serviceProxy[serviceName]
        return topicName
      })

    const policyResource = topicNames.map((topicName) => ({
      'Fn::Sub': [
        'arn:${AWS::Partition}:sns:${AWS::Region}:${AWS::AccountId}:${topicName}',
        { topicName },
      ],
    }))

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
            PolicyName: 'apigatewaytosns',
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
                {
                  Effect: 'Allow',
                  Action: ['sns:Publish'],
                  Resource: policyResource,
                },
              ],
            },
          },
        ],
      },
    }

    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      {
        ApigatewayToSnsRole: template,
      },
    )
  },
}

export default exported
