'use strict';

const _ = require('lodash');

class AwsCompileStreamEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileStreamEvents.bind(this),
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
              if (typeof event.stream.arn !== 'string') {
                // for dynamic arns (GetAtt/ImportValue)
                if (!event.stream.type) {
                  const errorMessage = [
                    `Missing "type" property for stream event in function "${functionName}"`,
                    ' If the "arn" property on a stream is a complex type (such as Fn::GetAtt)',
                    ' then a "type" must be provided for the stream, either "kinesis" or,',
                    ' "dynamodb". Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
                    .Error(errorMessage);
                }
                if (Object.keys(event.stream.arn).length !== 1
                    || !(_.has(event.stream.arn, 'Fn::ImportValue')
                          || _.has(event.stream.arn, 'Fn::GetAtt'))) {
                  const errorMessage = [
                    `Bad dynamic ARN property on stream event in function "${functionName}"`,
                    ' If you use a dynamic "arn" (such as with Fn::GetAtt or Fn::ImportValue)',
                    ' there must only be one key (either Fn::GetAtt or Fn::ImportValue) in the arn',
                    ' object. Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
                    .Error(errorMessage);
                }
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

            const streamType = event.stream.type || EventSourceArn.split(':')[2];
            const streamName = (function () {
              if (EventSourceArn['Fn::GetAtt']) {
                return EventSourceArn['Fn::GetAtt'][0];
              } else if (EventSourceArn['Fn::ImportValue']) {
                return EventSourceArn['Fn::ImportValue'];
              }
              return EventSourceArn.split('/')[1];
            }());

            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);
            const streamLogicalId = this.provider.naming
              .getStreamLogicalId(functionName, streamType, streamName);

            const funcRole = functionObj.role || this.serverless.service.provider.role;
            let dependsOn = '"IamRoleLambdaExecution"';
            if (funcRole) {
              if ( // check whether the custom role is an ARN
                typeof funcRole === 'string' &&
                funcRole.indexOf(':') !== -1
              ) {
                dependsOn = '[]';
              } else if ( // otherwise, check if we have an in-service reference to a role ARN
                typeof funcRole === 'object' &&
                'Fn::GetAtt' in funcRole &&
                Array.isArray(funcRole['Fn::GetAtt']) &&
                funcRole['Fn::GetAtt'].length === 2 &&
                typeof funcRole['Fn::GetAtt'][0] === 'string' &&
                typeof funcRole['Fn::GetAtt'][1] === 'string' &&
                funcRole['Fn::GetAtt'][1] === 'Arn'
              ) {
                dependsOn = `"${funcRole['Fn::GetAtt'][0]}"`;
              } else if ( // otherwise, check if we have an import
                typeof funcRole === 'object' &&
                'Fn::ImportValue' in funcRole
              ) {
                dependsOn = '[]';
              } else if (typeof funcRole === 'string') {
                dependsOn = `"${funcRole}"`;
              }
            }
            const streamTemplate = `
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
                  "StartingPosition": "${StartingPosition}",
                  "Enabled": "${Enabled}"
                }
              }
            `;

            // add event source ARNs to PolicyDocument statements
            if (streamType === 'dynamodb') {
              dynamodbStreamStatement.Resource.push(EventSourceArn);
            } else if (streamType === 'kinesis') {
              kinesisStreamStatement.Resource.push(EventSourceArn);
            } else {
              const errorMessage = [
                `Stream event of function '${functionName}' had unsupported stream type of`,
                ` '${streamType}'. Valid stream event source types include 'dynamodb' and`,
                ' \'kinesis\'. Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Properties
                .Policies[0]
                .PolicyDocument
                .Error(errorMessage);
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
          .Resources.IamRoleLambdaExecution) {
          const statement = this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources
            .IamRoleLambdaExecution
            .Properties
            .Policies[0]
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
