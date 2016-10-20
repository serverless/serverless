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
      let streamTypeIterator;
      let dynamoNumberInFunction = 0;
      let kinesisNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          let streamType = null;
          if (event.dynamodb) streamType = 'dynamodb';
          if (event.kinesis) streamType = 'kinesis';
          if (event.stream) streamType = 'stream';

          if (streamType) {
            let EventSourceArn;
            let BatchSize = 10;
            let StartingPosition = 'TRIM_HORIZON';
            let Enabled = 'True';

            if (typeof event[streamType] === 'object') {
              if (!event[streamType].arn) {
                const errorMessage = [
                  `Missing "arn" property for stream event in function "${functionName}"`,
                  ' The correct syntax is: stream: <StreamArn>',
                  ' OR an object with an "arn" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              EventSourceArn = event[streamType].arn;
              BatchSize = event[streamType].batchSize
                || BatchSize;
              StartingPosition = event[streamType].startingPosition
                || StartingPosition;
              if (typeof event[streamType].enabled !== 'undefined') {
                Enabled = event[streamType].enabled ? 'True' : 'False';
              }
            } else if (typeof event[streamType] === 'string') {
              EventSourceArn = event[streamType];
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

            const normalizedFunctionName = functionName[0].toUpperCase() + functionName.substr(1);

            const streamTemplate = `
              {
                "Type": "AWS::Lambda::EventSourceMapping",
                "DependsOn": "IamPolicyLambdaExecution",
                "Properties": {
                  "BatchSize": ${BatchSize},
                  "EventSourceArn": "${EventSourceArn}",
                  "FunctionName": {
                    "Fn::GetAtt": [
                      "${normalizedFunctionName}LambdaFunction",
                      "Arn"
                    ]
                  },
                  "StartingPosition": "${StartingPosition}",
                  "Enabled": "${Enabled}"
                }
              }
            `;

            if (streamType === 'stream') streamType = EventSourceArn.split(':')[2];

            // create type specific PolicyDocument statements
            let streamStatement = {};
            if (streamType === 'dynamodb') {
              dynamoNumberInFunction++;
              streamTypeIterator = dynamoNumberInFunction;
              streamStatement = {
                Effect: 'Allow',
                Action: [
                  'dynamodb:GetRecords',
                  'dynamodb:GetShardIterator',
                  'dynamodb:DescribeStream',
                  'dynamodb:ListStreams',
                ],
                Resource: EventSourceArn,
              };
            } else {
              kinesisNumberInFunction++;
              streamTypeIterator = kinesisNumberInFunction;
              streamStatement = {
                Effect: 'Allow',
                Action: [
                  'kinesis:GetRecords',
                  'kinesis:GetShardIterator',
                  'kinesis:DescribeStream',
                  'kinesis:ListStreams',
                ],
                Resource: EventSourceArn,
              };
            }

            // update the PolicyDocument statements
            const statement = this.serverless.service.provider.compiledCloudFormationTemplate
              .Resources
              .IamPolicyLambdaExecution
              .Properties
              .PolicyDocument
              .Statement;

            this.serverless.service.provider.compiledCloudFormationTemplate
              .Resources
              .IamPolicyLambdaExecution
              .Properties
              .PolicyDocument
              .Statement = statement.concat([streamStatement]);

            // normalize
            streamType = streamType[0].toUpperCase() + streamType.substr(1);

            const streamTemplateObj = JSON.parse(streamTemplate);

            if (typeof EventSourceArn === 'object') {
              streamTemplateObj.Properties.EventSourceArn = EventSourceArn;
            }

            const newStreamObject = {
              [`${normalizedFunctionName}EventSourceMapping${
                streamType}${streamTypeIterator}`]: streamTemplateObj,
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newStreamObject);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileStreamEvents;
