import _ from 'lodash'

const SERVICE_NAME = 'eventbridge'

const exported = {
  compileIamRoleToEventBridge() {
    if (!this.shouldCreateDefaultRole(SERVICE_NAME)) {
      return
    }

    const eventBusNames = this.getAllServiceProxies()
      .filter(
        (serviceProxy) => this.getServiceName(serviceProxy) === SERVICE_NAME,
      )
      .map((serviceProxy) => {
        const serviceName = this.getServiceName(serviceProxy)
        const { eventBusName } = serviceProxy[serviceName]
        return eventBusName
      })

    const policyResource = eventBusNames.map((eventBusName) => ({
      'Fn::Sub': [
        'arn:${AWS::Partition}:events:${AWS::Region}:${AWS::AccountId}:event-bus/${eventBusName}',
        { eventBusName },
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
            PolicyName: 'apigatewaytoeventbridge',
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
                  Action: ['events:PutEvents'],
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
        ApigatewayToEventBridgeRole: template,
      },
    )
  },
}

export default exported
