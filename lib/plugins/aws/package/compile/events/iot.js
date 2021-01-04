'use strict';

const _ = require('lodash');

class AwsCompileIoTEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileIoTEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'iot', {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
        },
        sqlVersion: {
          type: 'string',
          enum: ['2015-10-08', '2016-03-23', 'beta'],
        },
        name: {
          type: 'string',
        },
        enabled: {
          type: 'boolean',
        },
        description: {
          type: 'string',
        },
      },
      required: ['sql'],
      additionalProperties: false,
    });
  }

  compileIoTEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let iotNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.iot) {
            iotNumberInFunction++;

            const ruleName = event.iot.name ? event.iot.name.replace(/\r?\n/g, '') : null;
            const awsIotSqlVersion = event.iot.sqlVersion
              ? event.iot.sqlVersion.replace(/\r?\n/g, '')
              : null;
            const description = event.iot.description
              ? event.iot.description.replace(/\r?\n/g, '')
              : null;
            const sql = event.iot.sql.replace(/\r?\n/g, '');
            const ruleDisabled = event.iot.enabled === false;

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const iotLogicalId = this.provider.naming.getIotLogicalId(
              functionName,
              iotNumberInFunction
            );
            const lambdaPermissionLogicalId = this.provider.naming.getLambdaIotPermissionLogicalId(
              functionName,
              iotNumberInFunction
            );

            const topicRuleResource = {
              Type: 'AWS::IoT::TopicRule',
              Properties: {
                TopicRulePayload: {
                  RuleDisabled: ruleDisabled,
                  Sql: sql,
                  Actions: [
                    {
                      Lambda: {
                        FunctionArn: {
                          'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                        },
                      },
                    },
                  ],
                },
              },
            };

            if (ruleName) {
              topicRuleResource.Properties.RuleName = ruleName;
            }

            if (description) {
              topicRuleResource.Properties.TopicRulePayload.Description = description;
            }

            if (awsIotSqlVersion) {
              topicRuleResource.Properties.TopicRulePayload.AwsIotSqlVersion = awsIotSqlVersion;
            }

            const permissionResource = {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: {
                  'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                },
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
            };

            const newIotObject = {
              [iotLogicalId]: topicRuleResource,
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: permissionResource,
            };

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newIotObject,
              newPermissionObject
            );
          }
        });
      }
    });
  }
}
module.exports = AwsCompileIoTEvents;
