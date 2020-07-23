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

  isValidStackImport(variable) {
    if (Object.keys(variable).length !== 1) {
      return false;
    }
    if (
      variable['Fn::ImportValue'] &&
      (variable['Fn::ImportValue']['Fn::GetAtt'] || variable['Fn::ImportValue'].Ref)
    ) {
      return false;
    }
    const intrinsicFunctions = ['Fn::ImportValue', 'Ref', 'Fn::GetAtt', 'Fn::Sub', 'Fn::Join'];
    return intrinsicFunctions.some(cfInstructionName => variable[cfInstructionName]);
  }

  resolveInvalidDestinationPropertyErrorMessage(functionName, property) {
    return [
      `Missing or invalid ${property} property for on failure destination`,
      ` in function "${functionName}"`,
      'The correct syntax is: ',
      'destinations: ',
      '  onFailure: ',
      '    arn: resource-arn',
      '    type: (sns/sqs)',
      'OR an object with arn and type',
      'Please check the docs for more info.',
    ].join('\n');
  }

  compileStreamEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
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
        const kinesisStreamWithConsumerStatement = {
          Effect: 'Allow',
          Action: [
            'kinesis:GetRecords',
            'kinesis:GetShardIterator',
            'kinesis:DescribeStreamSummary',
            'kinesis:ListShards',
          ],
          Resource: [],
        };
        const kinesisConsumerStatement = {
          Effect: 'Allow',
          Action: ['kinesis:SubscribeToShard'],
          Resource: [],
        };
        const onFailureSnsStatement = {
          Effect: 'Allow',
          Action: ['sns:Publish'],
          Resource: [],
        };
        const onFailureSqsStatement = {
          Effect: 'Allow',
          Action: ['sqs:ListQueues', 'sqs:SendMessage'],
          Resource: [],
        };

        functionObj.events.forEach(event => {
          if (event.stream) {
            let EventSourceArn;
            let BatchSize = 10;
            let ParallelizationFactor;
            let StartingPosition = 'TRIM_HORIZON';
            let Enabled = true;

            // TODO validate arn syntax
            if (typeof event.stream === 'object') {
              if (!event.stream.arn) {
                const errorMessage = [
                  `Missing "arn" property for stream event in function "${functionName}"`,
                  ' The correct syntax is: stream: <StreamArn>',
                  ' OR an object with an "arn" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes.Error(errorMessage);
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
                  throw new this.serverless.classes.Error(errorMessage);
                }
                if (
                  Object.keys(event.stream.arn).length !== 1 ||
                  !(
                    event.stream.arn['Fn::ImportValue'] ||
                    event.stream.arn['Fn::GetAtt'] ||
                    (event.stream.arn.Ref &&
                      this.serverless.service.resources.Parameters[event.stream.arn.Ref]) ||
                    event.stream.arn['Fn::Join']
                  )
                ) {
                  const errorMessage = [
                    `Bad dynamic ARN property on stream event in function "${functionName}"`,
                    ' If you use a dynamic "arn" (such as with Fn::GetAtt, Fn::Join, Ref',
                    ' or Fn::ImportValue) there must only be one key (either Fn::GetAtt, Fn::Join, Ref',
                    ' or Fn::ImportValue) in the arn object. Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes.Error(errorMessage);
                }
              }
              EventSourceArn = event.stream.arn;
              BatchSize = event.stream.batchSize || BatchSize;
              if (event.stream.parallelizationFactor) {
                ParallelizationFactor = event.stream.parallelizationFactor;
              }
              StartingPosition = event.stream.startingPosition || StartingPosition;
              if (typeof event.stream.enabled !== 'undefined') {
                Enabled = event.stream.enabled;
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
              throw new this.serverless.classes.Error(errorMessage);
            }

            const streamType = event.stream.type || EventSourceArn.split(':')[2];
            const streamName = (function() {
              if (EventSourceArn['Fn::GetAtt']) {
                return EventSourceArn['Fn::GetAtt'][0];
              } else if (EventSourceArn['Fn::ImportValue']) {
                return EventSourceArn['Fn::ImportValue'];
              } else if (EventSourceArn.Ref) {
                return EventSourceArn.Ref;
              } else if (EventSourceArn['Fn::Join']) {
                // [0] is the used delimiter, [1] is the array with values
                const name = EventSourceArn['Fn::Join'][1].slice(-1).pop();
                if (name.split('/').length) {
                  return name.split('/').pop();
                }
                return name;
              }
              return EventSourceArn.split('/')[1];
            })();

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const streamLogicalId = this.provider.naming.getStreamLogicalId(
              functionName,
              streamType,
              streamName
            );

            const funcRole = functionObj.role || this.serverless.service.provider.role;
            let dependsOn = 'IamRoleLambdaExecution';
            if (funcRole) {
              if (
                // check whether the custom role is an ARN
                typeof funcRole === 'string' &&
                funcRole.indexOf(':') !== -1
              ) {
                dependsOn = [];
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
                dependsOn = funcRole['Fn::GetAtt'][0];
              } else if (
                // otherwise, check if we have an import or parameters ref
                typeof funcRole === 'object' &&
                ('Fn::ImportValue' in funcRole || 'Ref' in funcRole)
              ) {
                dependsOn = [];
              } else if (typeof funcRole === 'string') {
                dependsOn = funcRole;
              }
            }
            const streamResource = {
              Type: 'AWS::Lambda::EventSourceMapping',
              DependsOn: dependsOn,
              Properties: {
                BatchSize,
                ParallelizationFactor,
                EventSourceArn,
                FunctionName: {
                  'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                },
                StartingPosition,
                Enabled,
              },
            };

            // add event source ARNs to PolicyDocument statements
            if (streamType === 'dynamodb') {
              dynamodbStreamStatement.Resource.push(EventSourceArn);
            } else if (streamType === 'kinesis') {
              if (event.stream.consumer) {
                kinesisStreamWithConsumerStatement.Resource.push(EventSourceArn);
              } else {
                kinesisStreamStatement.Resource.push(EventSourceArn);
              }
            } else {
              const errorMessage = [
                `Stream event of function '${functionName}' had unsupported stream type of`,
                ` '${streamType}'. Valid stream event source types include 'dynamodb' and`,
                " 'kinesis'. Please check the docs for more info.",
              ].join('');
              throw new this.serverless.classes.Properties.Policies[0].PolicyDocument.Error(
                errorMessage
              );
            }

            if (event.stream.batchWindow) {
              streamResource.Properties.MaximumBatchingWindowInSeconds = event.stream.batchWindow;
            }

            if (event.stream.maximumRetryAttempts != null) {
              streamResource.Properties.MaximumRetryAttempts = event.stream.maximumRetryAttempts;
            }

            if (event.stream.bisectBatchOnFunctionError != null) {
              streamResource.Properties.BisectBatchOnFunctionError =
                event.stream.bisectBatchOnFunctionError;
            }

            if (event.stream.maximumRecordAgeInSeconds) {
              streamResource.Properties.MaximumRecordAgeInSeconds =
                event.stream.maximumRecordAgeInSeconds;
            }

            if (event.stream.destinations) {
              if (event.stream.destinations.onFailure) {
                let OnFailureDestinationArn;

                if (typeof event.stream.destinations.onFailure === 'object') {
                  if (!event.stream.destinations.onFailure.arn) {
                    throw new this.serverless.classes.Error(
                      this.resolveInvalidDestinationPropertyErrorMessage(functionName, 'arn')
                    );
                  }
                  if (typeof event.stream.destinations.onFailure.arn !== 'string') {
                    if (!event.stream.destinations.onFailure.type) {
                      const errorMessage = [
                        `Missing "type" property for on failure destination in function "${functionName}"`,
                        ' If the "arn" property on a destination is a complex type (such as Fn::GetAtt)',
                        ' then a "type" must be provided for the destination, either "sns" or,',
                        ' "sqs". Please check the docs for more info.',
                      ].join('');
                      throw new this.serverless.classes.Error(errorMessage);
                    }
                    if (!this.isValidStackImport(event.stream.destinations.onFailure.arn)) {
                      throw new this.serverless.classes.Error(
                        this.resolveInvalidDestinationPropertyErrorMessage(functionName, 'arn')
                      );
                    }
                  }
                  if (
                    typeof event.stream.destinations.onFailure.arn === 'string' &&
                    !event.stream.destinations.onFailure.arn.startsWith('arn:')
                  ) {
                    throw new this.serverless.classes.Error(
                      this.resolveInvalidDestinationPropertyErrorMessage(functionName, 'arn')
                    );
                  }
                  OnFailureDestinationArn = event.stream.destinations.onFailure.arn;
                } else if (typeof event.stream.destinations.onFailure === 'string') {
                  if (!event.stream.destinations.onFailure.startsWith('arn:')) {
                    throw new this.serverless.classes.Error(
                      this.resolveInvalidDestinationPropertyErrorMessage(functionName, 'arn')
                    );
                  }
                  OnFailureDestinationArn = event.stream.destinations.onFailure;
                } else {
                  throw new this.serverless.classes.Error(
                    this.resolveInvalidDestinationPropertyErrorMessage(functionName, 'arn')
                  );
                }

                const destinationType =
                  event.stream.destinations.onFailure.type || OnFailureDestinationArn.split(':')[2];
                // add on failure destination ARNs to PolicyDocument statements
                if (destinationType === 'sns') {
                  onFailureSnsStatement.Resource.push(OnFailureDestinationArn);
                } else if (destinationType === 'sqs') {
                  onFailureSqsStatement.Resource.push(OnFailureDestinationArn);
                } else {
                  const errorMessage = [
                    `Stream event of function '${functionName}' had unsupported destination type of`,
                    ` '${streamType}'. Valid stream event source types include 'sns' and`,
                    " 'sqs'. Please check the docs for more info.",
                  ].join('');
                  throw new this.serverless.classes.Properties.Policies[0].PolicyDocument.Error(
                    errorMessage
                  );
                }

                streamResource.Properties.DestinationConfig = {
                  OnFailure: {
                    Destination: OnFailureDestinationArn,
                  },
                };
              } else {
                throw new this.serverless.classes.Error(
                  this.resolveInvalidDestinationPropertyErrorMessage(functionName, 'onFailure')
                );
              }
            }

            const newStreamObject = {
              [streamLogicalId]: streamResource,
            };

            if (event.stream.consumer && streamType === 'kinesis') {
              if (event.stream.consumer === true) {
                const consumerName = this.provider.naming.getStreamConsumerName(
                  functionName,
                  streamName
                );
                const consumerResource = {
                  Type: 'AWS::Kinesis::StreamConsumer',
                  Properties: {
                    StreamARN: EventSourceArn,
                    ConsumerName: consumerName,
                  },
                };
                const consumerLogicalId = this.provider.naming.getStreamConsumerLogicalId(
                  consumerName
                );
                newStreamObject[consumerLogicalId] = consumerResource;
                if (Array.isArray(streamResource.DependsOn)) {
                  streamResource.DependsOn.push(consumerLogicalId);
                } else {
                  streamResource.DependsOn = [streamResource.DependsOn, consumerLogicalId];
                }
                const consumerArnRef = {
                  Ref: consumerLogicalId,
                };
                streamResource.Properties.EventSourceArn = consumerArnRef;
                kinesisConsumerStatement.Resource.push(consumerArnRef);
              } else {
                const consumerArn = event.stream.consumer;
                streamResource.Properties.EventSourceArn = consumerArn;
                kinesisConsumerStatement.Resource.push(consumerArn);
              }
            }

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newStreamObject
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
          if (dynamodbStreamStatement.Resource.length) {
            statement.push(dynamodbStreamStatement);
          }
          if (kinesisStreamStatement.Resource.length) {
            statement.push(kinesisStreamStatement);
          }
          if (kinesisStreamWithConsumerStatement.Resource.length) {
            statement.push(kinesisStreamWithConsumerStatement);
          }
          if (kinesisConsumerStatement.Resource.length) {
            statement.push(kinesisConsumerStatement);
          }
          if (onFailureSnsStatement.Resource.length) {
            statement.push(onFailureSnsStatement);
          }
          if (onFailureSqsStatement.Resource.length) {
            statement.push(onFailureSqsStatement);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileStreamEvents;
