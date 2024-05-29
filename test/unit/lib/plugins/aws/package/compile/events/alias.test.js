'use strict'

const runServerless = require('../../../../../../../utils/run-serverless')
const { use: chaiUse, expect } = require('chai')
const chaiAsPromised = require('chai-as-promised')
const naming = require('../../../../../../../../lib/plugins/aws/lib/naming')

chaiUse(chaiAsPromised)
describe('test/unit/lib/plugins/aws/package/compile/events/alias.test.js', () => {
  let lambdaResourceCount = 0

  before(async () => {
    const events = (index) => {
      return [
        {
          activemq: {
            queue: 'TestingQueue',
            arn: 'arn:aws:mq:us-east-1:0000:broker:ExampleMQBroker:b-xxx-xxx',
            basicAuthArn:
              'arn:aws:secretsmanager:us-east-1:01234567890:secret:MyBrokerSecretName',
          },
        },
        {
          rabbitmq: {
            queue: 'TestingQueue',
            arn: 'arn:aws:mq:us-east-1:0000:broker:ExampleMQBroker:b-xxx-xxx',
            basicAuthArn:
              'arn:aws:secretsmanager:us-east-1:01234567890:secret:MyBrokerSecretName',
          },
        },
        {
          alb: {
            listenerArn:
              'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
            priority: index,
            conditions: { path: '/' },
          },
        },
        { httpApi: { path: `/httpApi/noAuth/${index}`, method: 'POST' } },
        {
          httpApi: {
            path: `/httpApi/provisionedAuth/${index}`,
            method: 'POST',
            authorizer: { name: 'ProvisionedFnAuthorizer' },
          },
        },
        {
          httpApi: {
            path: `/httpApi/snapStartAuth/${index}`,
            method: 'POST',
            authorizer: { name: 'SnapStartFnAuthorizer' },
          },
        },
        {
          httpApi: {
            path: `/httpApi/noAliasAuth/${index}`,
            method: 'POST',
            authorizer: { name: 'NoAliasFnAuthorizer' },
          },
        },
        { http: { path: `/http/noAuth/${index}`, method: 'POST' } },
        {
          http: {
            path: `/http/provisionedAuth/${index}`,
            method: 'POST',
            authorizer: { name: 'ProvisionedFn' },
          },
        },
        {
          http: {
            path: `/http/snapStartAuth/${index}`,
            method: 'POST',
            authorizer: { name: 'SnapStartFn' },
          },
        },
        {
          http: {
            path: `/http/noAliasAuth/${index}`,
            method: 'POST',
            authorizer: { name: 'NoAliasFn' },
          },
        },

        { schedule: { rate: 'rate(10 minutes)' } },
        { sns: `Topic${index}` },
        {
          msk: {
            topic: 'TestingTopic',
            arn: 'arn:aws:kafka:us-east-1:111111111111:cluster/ClusterName/a1a1a1a1a1a1a1a1a',
          },
        },
        {
          iotFleetProvisioning: {
            templateBody: {},
            provisioningRoleArn:
              'arn:aws:iam::123456789:role/provisioning-role',
          },
        },
        { iot: { sql: 'SELECT * FROM topic_1' } },
        { s3: `first-function-bucket-${index}` },
        { alexaSkill: 'amzn1.ask.skill.xx-xx-xx-xx' },
        { alexaSmartHome: { appId: 'amzn1.ask.skill.xx-xx-xx-xx' } },
        {
          cloudFront: {
            eventType: 'viewer-request',
            origin: 's3://bucketname.s3.amazonaws.com/files',
            pathPattern: `/files/${index}/*`,
          },
        },
        { sqs: 'arn:aws:sqs:region:account:MyQueue' },
        {
          cloudwatchEvent: {
            event: {
              source: ['aws.ec2'],
              'detail-type': ['EC2 Instance State-change Notification'],
              detail: { state: ['pending'] },
            },
          },
        },
        { cloudwatchLog: { logGroup: `/aws/lambda/hello${index}` } },
        {
          cognitoUserPool: {
            pool: `Test${index}`,
            trigger: 'CustomSMSSender',
            kmsKeyId:
              'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
          },
        },
        { websocket: { route: '$connect', authorizer: 'ProvisionedFn' } },
        { websocket: { route: '$disconnect', authorizer: 'SnapStartFn' } },
        { websocket: { route: '$default', authorizer: 'NoAliasFn' } },
        { stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1' },
        {
          kafka: {
            topic: 'TestingTopic',
            bootstrapServers: ['abc.xyz:9092'],
            accessConfigurations: {
              saslScram256Auth:
                'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslScram256Auth',
            },
          },
        },
        {
          eventBridge: {
            eventBus: 'arn:aws:events:us-east-1:12345:event-bus/default',
            schedule: 'rate(10 minutes)',
          },
        },
      ]
    }
    const { cfTemplate } = await runServerless({
      fixture: 'function',
      configExt: {
        provider: {
          name: 'aws',
          httpApi: {
            authorizers: {
              ProvisionedFnAuthorizer: {
                type: 'request',
                functionName: 'ProvisionedFn',
              },
              SnapStartFnAuthorizer: {
                type: 'request',
                functionName: 'SnapStartFn',
              },
              NoAliasFnAuthorizer: {
                type: 'request',
                functionName: 'NoAliasFn',
              },
            },
          },
        },
        functions: {
          ProvisionedFn: {
            handler: 'index.handler',
            provisionedConcurrency: 1,
            events: events(1),
          },
          SnapStartFn: {
            handler: 'index.handler',
            snapStart: true,
            events: events(2),
          },
          NoAliasFn: {
            handler: 'index.handler',
            events: events(3),
          },
        },
      },
      command: 'package',
    })

    const resources = cfTemplate.Resources

    const unwrapApiGateway = (uri) => {
      if (
        uri['Fn::Join'] &&
        uri['Fn::Join'][0] === '' &&
        uri['Fn::Join'][1][2] === ':apigateway:'
      ) {
        const base = uri['Fn::Join'][1][5]
        // Support both embedded Fn::Join format and expanded
        if (base['Fn::GetAtt'] && uri['Fn::Join'][1][6] === ':') {
          return {
            'Fn::Join': [':', [base, uri['Fn::Join'][1][7]]],
          }
        }
        return base
      }
      return uri
    }

    const resourceTypeToLambdaLookup = {
      'AWS::Lambda::Version': false,
      'AWS::Lambda::Alias': false,
      'AWS::Lambda::Permission': (r) => r.Properties.FunctionName,
      'AWS::Lambda::EventSourceMapping': (r) => r.Properties.FunctionName,
      'AWS::Events::Rule': (r) => r.Properties.Targets[0].Arn,
      'AWS::ApiGatewayV2::Integration': (r) =>
        unwrapApiGateway(r.Properties.IntegrationUri),
      'AWS::ApiGatewayV2::Authorizer': (r) =>
        r.Properties.AuthorizerUri['Fn::Join'][1][5],
      'AWS::ElasticLoadBalancingV2::TargetGroup': (r) =>
        r.Properties.Targets[0].Id,
      'AWS::IoT::ProvisioningTemplate': (r) =>
        r.Properties.PreProvisioningHook.TargetArn,
      'AWS::Logs::SubscriptionFilter': (r) => r.Properties.DestinationArn,
      'AWS::S3::Bucket': (r) =>
        r.Properties.NotificationConfiguration.LambdaConfigurations[0].Function,
      'AWS::SNS::Topic': (r) => r.Properties.Subscription[0].Endpoint,
      'AWS::Cognito::UserPool': (r) =>
        r.Properties.LambdaConfig.CustomSMSSender.LambdaArn,
      'AWS::ApiGateway::Method': (r) =>
        unwrapApiGateway(r.Properties.Integration.Uri),
      'AWS::IoT::TopicRule': (r) =>
        r.Properties.TopicRulePayload.Actions[0].Lambda.FunctionArn,
      'AWS::ApiGateway::Authorizer': (r) =>
        unwrapApiGateway(r.Properties.AuthorizerUri),
    }

    const functionsToCheck = [
      {
        functionName: 'ProvisionedFn',
        aliasName: 'provisioned',
        aliasLogicalId:
          naming.getLambdaProvisionedConcurrencyAliasLogicalId('ProvisionedFn'),
      },
      {
        functionName: 'SnapStartFn',
        aliasName: 'snapstart',
        aliasLogicalId: naming.getLambdaSnapStartAliasLogicalId('SnapStartFn'),
      },
      { functionName: 'NoAliasFn', aliasName: null, aliasLogicalId: null },
    ]

    functionsToCheck.forEach((check) => {
      const lambdaLogicalId = naming.getLambdaLogicalId(check.functionName)
      describe(`test/unit/lib/plugins/aws/package/compile/events/alias.test.js - ${check.functionName}`, () => {
        Object.keys(resources).forEach((r) => {
          const resource = resources[r]
          const lookup = resourceTypeToLambdaLookup[resource.Type]
          if (
            JSON.stringify(resource).includes(
              naming.getLambdaLogicalId(check.functionName),
            )
          ) {
            lambdaResourceCount++
            if (lookup == null) {
              it(`${r} - should be a known type`, () => {
                expect(Object.keys(resourceTypeToLambdaLookup)).to.include(
                  resource.Type,
                )
              })
            } else if (lookup) {
              const lambdaReference = lookup(resource)
              if (check.aliasName) {
                it(`${r} - should reference lambda alias '${check.aliasName}'`, () => {
                  expect(lambdaReference).to.deep.equal({
                    'Fn::Join': [
                      ':',
                      [
                        {
                          'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                        },
                        check.aliasName,
                      ],
                    ],
                  })
                })
                it(`${r} - should depend on lambda alias '${check.aliasName}'`, () => {
                  expect(resource.DependsOn).to.include(check.aliasLogicalId)
                })
              } else {
                it(`${r} - should not reference lambda alias`, () => {
                  expect(lambdaReference).to.deep.equal({
                    'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                  })
                })
              }
            }
          }
        })
      })
    })
  })
  it('Check resource count', () => {
    expect(lambdaResourceCount).to.gte(1)
  })
})
