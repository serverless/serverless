import _ from 'lodash'
import resolveLambdaTarget from '../../../utils/resolve-lambda-target.js'

class AwsCompileIoTEvents {
  constructor(serverless) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      'package:compileEvents': async () => this.compileIoTEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'iot', {
      description: `AWS IoT event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/iot
@example
iot:
  sql: "SELECT * FROM 'my/topic'"`,
      type: 'object',
      properties: {
        sql: {
          description: `SQL statement for the rule query.
@example "SELECT * FROM 'my/topic'"`,
          type: 'string',
        },
        sqlVersion: {
          description: `SQL version (e.g., '2016-03-23').`,
          type: 'string',
          enum: ['2015-10-08', '2016-03-23', 'beta'],
        },
        name: {
          description: `IoT rule name.`,
          type: 'string',
        },
        enabled: {
          description: `Enable/disable the rule.`,
          type: 'boolean',
        },
        description: {
          description: `Rule description.`,
          type: 'string',
        },
      },
      required: ['sql'],
      additionalProperties: false,
    })
  }

  compileIoTEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      let iotNumberInFunction = 0

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.iot) {
            iotNumberInFunction++

            const ruleName = event.iot.name
              ? event.iot.name.replace(/\r?\n/g, '')
              : null
            const awsIotSqlVersion = event.iot.sqlVersion
              ? event.iot.sqlVersion.replace(/\r?\n/g, '')
              : null
            const description = event.iot.description
              ? event.iot.description.replace(/\r?\n/g, '')
              : null
            const sql = event.iot.sql.replace(/\r?\n/g, '')
            const ruleDisabled = event.iot.enabled === false

            const iotLogicalId = this.provider.naming.getIotLogicalId(
              functionName,
              iotNumberInFunction,
            )
            const lambdaPermissionLogicalId =
              this.provider.naming.getLambdaIotPermissionLogicalId(
                functionName,
                iotNumberInFunction,
              )

            const topicRuleResource = {
              Type: 'AWS::IoT::TopicRule',
              DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
              Properties: {
                TopicRulePayload: {
                  RuleDisabled: ruleDisabled,
                  Sql: sql,
                  Actions: [
                    {
                      Lambda: {
                        FunctionArn: resolveLambdaTarget(
                          functionName,
                          functionObj,
                        ),
                      },
                    },
                  ],
                },
              },
            }

            if (ruleName) {
              topicRuleResource.Properties.RuleName = ruleName
            }

            if (description) {
              topicRuleResource.Properties.TopicRulePayload.Description =
                description
            }

            if (awsIotSqlVersion) {
              topicRuleResource.Properties.TopicRulePayload.AwsIotSqlVersion =
                awsIotSqlVersion
            }

            const permissionResource = {
              Type: 'AWS::Lambda::Permission',
              DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
              Properties: {
                FunctionName: resolveLambdaTarget(functionName, functionObj),
                Action: 'lambda:InvokeFunction',
                Principal: 'iot.amazonaws.com',
                SourceArn: {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':iot:',
                      { Ref: 'AWS::Region' },
                      ':',
                      { Ref: 'AWS::AccountId' },
                      ':rule/',
                      { Ref: iotLogicalId },
                    ],
                  ],
                },
              },
            }

            const newIotObject = {
              [iotLogicalId]: topicRuleResource,
            }

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: permissionResource,
            }

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate
                .Resources,
              newIotObject,
              newPermissionObject,
            )
          }
        })
      }
    })
  }
}
export default AwsCompileIoTEvents
