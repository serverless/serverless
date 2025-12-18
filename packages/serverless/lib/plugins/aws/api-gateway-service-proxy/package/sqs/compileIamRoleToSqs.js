import _ from 'lodash'

const SERVICE_NAME = 'sqs'

const exported = {
  compileIamRoleToSqs() {
    if (!this.shouldCreateDefaultRole(SERVICE_NAME)) {
      return
    }

    const sqsQueueNames = this.getAllServiceProxies()
      .filter(
        (serviceProxy) => this.getServiceName(serviceProxy) === SERVICE_NAME,
      )
      .map((serviceProxy) => {
        const serviceName = this.getServiceName(serviceProxy)
        const { queueName } = serviceProxy[serviceName]
        return queueName
      })

    const policyResource = sqsQueueNames.map((queueName) => ({
      'Fn::Sub': [
        'arn:${AWS::Partition}:sqs:${AWS::Region}:${AWS::AccountId}:${queueName}',
        { queueName },
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
            PolicyName: 'apigatewaytosqs',
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
                  Action: ['sqs:SendMessage'],
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
        ApigatewayToSqsRole: template,
      },
    )
  },
}

export default exported
