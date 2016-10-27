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

            // get the type (DynamoDB or Kinesis) of the stream
            const streamType = EventSourceArn.split(':')[2];
            const normalizedStreamType = streamType[0].toUpperCase() + streamType.substr(1);

            // get the name of the stream (and remove any non-alphanumerics in it)
            const streamName = EventSourceArn.split('/')[1];
            const normalizedStreamName = streamName[0].toUpperCase()
              + streamName.substr(1).replace(/[^A-Za-z0-9]/g, '');

            // create type specific PolicyDocument statements
            let streamStatement = {};
            if (streamType === 'dynamodb') {
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

            const newStreamObject = {
              [`${normalizedFunctionName}EventSourceMapping${
                normalizedStreamType}${normalizedStreamName}`]: JSON.parse(streamTemplate),
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
