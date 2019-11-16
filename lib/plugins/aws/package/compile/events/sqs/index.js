'use strict';

const _ = require('lodash');

class AwsCompileSQSEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileSQSEvents.bind(this),
    };
  }

  compileSQSEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        const sqsStatement = {
          Effect: 'Allow',
          Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Resource: [],
        };

        functionObj.events.forEach(event => {
          if (event.sqs) {
            let EventSourceArn;
            let BatchSize = 10;
            let Enabled = 'True';

            // TODO validate arn syntax
            if (typeof event.sqs === 'object') {
              if (!event.sqs.arn) {
                const errorMessage = [
                  `Missing "arn" property for sqs event in function "${functionName}"`,
                  ' The correct syntax is: sqs: <QueueArn>',
                  ' OR an object with an "arn" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes.Error(errorMessage);
              }
              if (typeof event.sqs.arn !== 'string') {
                // for dynamic arns (GetAtt/ImportValue)
                if (
                  Object.keys(event.sqs.arn).length !== 1 ||
                  !(
                    _.has(event.sqs.arn, 'Fn::ImportValue') ||
                    _.has(event.sqs.arn, 'Fn::GetAtt') ||
                    _.has(event.sqs.arn, 'Fn::Join')
                  )
                ) {
                  const errorMessage = [
                    `Bad dynamic ARN property on sqs event in function "${functionName}"`,
                    ' If you use a dynamic "arn" (such as with Fn::GetAtt or Fn::ImportValue)',
                    ' there must only be one key (either Fn::GetAtt or Fn::ImportValue) in the arn',
                    ' object. Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes.Error(errorMessage);
                }
              }
              EventSourceArn = event.sqs.arn;
              BatchSize = event.sqs.batchSize || BatchSize;
              if (typeof event.sqs.enabled !== 'undefined') {
                Enabled = event.sqs.enabled ? 'True' : 'False';
              }
            } else if (typeof event.sqs === 'string') {
              EventSourceArn = event.sqs;
            } else {
              const errorMessage = [
                `SQS event of function "${functionName}" is not an object nor a string`,
                ' The correct syntax is: sqs: <QueueArn>',
                ' OR an object with an "arn" property.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }

            const queueName = (function() {
              if (EventSourceArn['Fn::GetAtt']) {
                return EventSourceArn['Fn::GetAtt'][0];
              } else if (EventSourceArn['Fn::ImportValue']) {
                return EventSourceArn['Fn::ImportValue'];
              } else if (EventSourceArn['Fn::Join']) {
                // [0] is the used delimiter, [1] is the array with values
                return EventSourceArn['Fn::Join'][1].slice(-1).pop();
              }
              return EventSourceArn.split(':').pop();
            })();

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const queueLogicalId = this.provider.naming.getQueueLogicalId(functionName, queueName);

            const funcRole = functionObj.role || this.serverless.service.provider.role;
            let dependsOn = '"IamRoleLambdaExecution"';
            if (funcRole) {
              if (
                // check whether the custom role is an ARN
                typeof funcRole === 'string' &&
                funcRole.indexOf(':') !== -1
              ) {
                dependsOn = '[]';
              } else if (
                // otherwise, check if we have an in-service reference to a role ARN
                typeof funcRole === 'object' &&
                'Fn::GetAtt' in funcRole &&
                Array.isArray(funcRole['Fn::GetAtt']) &&
                funcRole['Fn::GetAtt'].length === 2 &&
                typeof funcRole['Fn::GetAtt'][0] === 'string' &&
                typeof funcRole['Fn::GetAtt'][1] === 'string' &&
                funcRole['Fn::GetAtt'][1] === 'Arn'
              ) {
                dependsOn = `"${funcRole['Fn::GetAtt'][0]}"`;
              } else if (
                // otherwise, check if we have an import
                typeof funcRole === 'object' &&
                'Fn::ImportValue' in funcRole
              ) {
                dependsOn = '[]';
              } else if (typeof funcRole === 'string') {
                dependsOn = `"${funcRole}"`;
              }
            }
            const sqsTemplate = `
              {
                "Type": "AWS::Lambda::EventSourceMapping",
                "DependsOn": ${dependsOn},
                "Properties": {
                  "BatchSize": ${BatchSize},
                  "EventSourceArn": ${JSON.stringify(EventSourceArn)},
                  "FunctionName": {
                    "Fn::GetAtt": [
                      "${lambdaLogicalId}",
                      "Arn"
                    ]
                  },
                  "Enabled": "${Enabled}"
                }
              }
            `;

            // add event source ARNs to PolicyDocument statements
            sqsStatement.Resource.push(EventSourceArn);

            const newSQSObject = {
              [queueLogicalId]: JSON.parse(sqsTemplate),
            };

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newSQSObject
            );
          }
        });

        // update the PolicyDocument statements (if default policy is used)
        if (
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .IamRoleLambdaExecution
        ) {
          const statement = this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement;
          if (sqsStatement.Resource.length) {
            statement.push(sqsStatement);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileSQSEvents;
