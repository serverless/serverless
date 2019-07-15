'use strict';

const _ = require('lodash');

class AwsCompileIoTEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileIoTEvents.bind(this),
    };
  }

  compileIoTEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let iotNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.iot) {
            iotNumberInFunction++;
            let RuleName;
            let AwsIotSqlVersion;
            let Description;
            let RuleDisabled;
            let Sql;

            if (typeof event.iot === 'object') {
              RuleName = event.iot.name;
              AwsIotSqlVersion = event.iot.sqlVersion;
              Description = event.iot.description;
              RuleDisabled = false;
              if (event.iot.enabled === false) {
                RuleDisabled = true;
              }
              Sql = event.iot.sql;
            } else {
              const errorMessage = [
                `IoT event of function "${functionName}" is not an object`,
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const iotLogicalId = this.provider.naming.getIotLogicalId(
              functionName,
              iotNumberInFunction
            );
            const lambdaPermissionLogicalId = this.provider.naming.getLambdaIotPermissionLogicalId(
              functionName,
              iotNumberInFunction
            );
            const iotTemplate = `
              {
                "Type": "AWS::IoT::TopicRule",
                "Properties": {
                  ${RuleName ? `"RuleName": "${RuleName.replace(/\r?\n/g, '')}",` : ''}
                  "TopicRulePayload": {
                    ${
                      AwsIotSqlVersion
                        ? `"AwsIotSqlVersion":
                      "${AwsIotSqlVersion.replace(/\r?\n/g, '')}",`
                        : ''
                    }
                    ${Description ? `"Description": "${Description.replace(/\r?\n/g, '')}",` : ''}
                    "RuleDisabled": "${RuleDisabled}",
                    "Sql": "${Sql.replace(/\r?\n/g, '')}",
                    "Actions": [
                      {
                        "Lambda": {
                          "FunctionArn": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] }
                        }
                      }
                    ]
                  }
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "iot.amazonaws.com",
                  "SourceArn": { "Fn::Join": ["",
                    [
                      "arn:",
                      { "Ref": "AWS::Partition" },
                      ":iot:",
                      { "Ref": "AWS::Region" },
                      ":",
                      { "Ref": "AWS::AccountId" },
                      ":rule/",
                      { "Ref": "${iotLogicalId}"}
                    ]
                  ] }
                }
              }
            `;

            const newIotObject = {
              [iotLogicalId]: JSON.parse(iotTemplate),
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: JSON.parse(permissionTemplate),
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
