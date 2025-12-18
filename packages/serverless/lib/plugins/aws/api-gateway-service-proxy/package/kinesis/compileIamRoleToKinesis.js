import _ from 'lodash'

const SERVICE_NAME = 'kinesis'

const exported = {
  compileIamRoleToKinesis() {
    if (!this.shouldCreateDefaultRole(SERVICE_NAME)) {
      return
    }

    const kinesisStreamNames = this.getAllServiceProxies()
      .filter(
        (serviceProxy) => this.getServiceName(serviceProxy) === SERVICE_NAME,
      )
      .map((serviceProxy) => {
        const serviceName = this.getServiceName(serviceProxy)
        const { streamName } = serviceProxy[serviceName]
        return streamName
      })

    const policyResource = kinesisStreamNames.map((streamName) => ({
      'Fn::Sub': [
        'arn:${AWS::Partition}:kinesis:${AWS::Region}:${AWS::AccountId}:stream/${streamName}',
        { streamName },
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
            PolicyName: 'apigatewaytokinesis',
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
                  Action: ['kinesis:PutRecord', 'kinesis:PutRecords'],
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
        ApigatewayToKinesisRole: template,
      },
    )
  },
}

export default exported
