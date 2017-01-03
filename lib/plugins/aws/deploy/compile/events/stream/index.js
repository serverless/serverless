'use strict';

const _ = require('lodash');

class AwsCompileStreamEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'deploy:compileEvents': this.compileStreamEvents.bind(this),
    };
  }

  compileStreamEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        const dynamodbStreamStatement = {
          Effect: 'Allow',
          Action: [
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:DescribeStream',
            'dynamodb:ListStreams',
          ],
          Resource: [],
        };
        const kinesisStreamStatement = {
          Effect: 'Allow',
          Action: [
            'kinesis:GetRecords',
            'kinesis:GetShardIterator',
            'kinesis:DescribeStream',
            'kinesis:ListStreams',
          ],
          Resource: [],
        };

        functionObj.events.forEach(event => {
          if (event.stream) {
            let EventSourceArn;
            let BatchSize = 10;
            let StartingPosition = 'TRIM_HORIZON';
            let Enabled = 'True';

            // TODO validate arn syntax
            if (typeof event.stream === 'object') {
              if (!event.stream.arn) {
                const errorMessage = [
                  `Missing "arn" property for stream event in function "${functionName}"`,
                  ' The correct syntax is: stream: <StreamArn>',
                  ' OR an object with an "arn" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              EventSourceArn = event.stream.arn;
              BatchSize = event.stream.batchSize
                || BatchSize;
              StartingPosition = event.stream.startingPosition
                || StartingPosition;
              if (typeof event.stream.enabled !== 'undefined') {
                Enabled = event.stream.enabled ? 'True' : 'False';
              }
            } else if (typeof event.stream === 'string') {
              EventSourceArn = event.stream;
            } else {
              const errorMessage = [
                `Stream event of function "${functionName}" is not an object nor a string`,
                ' The correct syntax is: stream: <StreamArn>',
                ' OR an object with an "arn" property.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const streamType = EventSourceArn.split(':')[2];
            const streamName = EventSourceArn.split('/')[1];

            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);
            const streamLogicalId = this.provider.naming
              .getStreamLogicalId(functionName, streamType, streamName);

            const funcRole = functionObj.role || this.serverless.service.provider.role;
            let dependsOn = '"IamPolicyLambdaExecution"';
            // check whether we have custom IAM role in format arn:aws:iam::account:role/foo
            if (typeof funcRole === 'string' && funcRole.indexOf(':') !== -1) {
              dependsOn = '[]';
            }

            const streamTemplate = `
              {
                "Type": "AWS::Lambda::EventSourceMapping",
                "DependsOn": ${dependsOn},
                "Properties": {
                  "BatchSize": ${BatchSize},
                  "EventSourceArn": "${EventSourceArn}",
                  "FunctionName": {
                    "Fn::GetAtt": [
                      "${lambdaLogicalId}",
                      "Arn"
                    ]
                  },
                  "StartingPosition": "${StartingPosition}",
                  "Enabled": "${Enabled}"
                }
              }
            `;

            // add event source ARNs to PolicyDocument statements
            if (streamType === 'dynamodb') {
              dynamodbStreamStatement.Resource.push(EventSourceArn);
            } else {
              kinesisStreamStatement.Resource.push(EventSourceArn);
            }

            const newStreamObject = {
              [streamLogicalId]: JSON.parse(streamTemplate),
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newStreamObject);
          }
        });

        // update the PolicyDocument statements (if default policy is used)
        if (this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution) {
          const statement = this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources
            .IamPolicyLambdaExecution
            .Properties
            .PolicyDocument
            .Statement;
          if (dynamodbStreamStatement.Resource.length) {
            statement.push(dynamodbStreamStatement);
          }
          if (kinesisStreamStatement.Resource.length) {
            statement.push(kinesisStreamStatement);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileStreamEvents;
