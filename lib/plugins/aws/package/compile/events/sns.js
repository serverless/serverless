'use strict';

const ServerlessError = require('../../../../../serverless-error');
const resolveLambdaTarget = require('../../../utils/resolve-lambda-target');

class AwsCompileSNSEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    this.options = options;
    this.hooks = {
      'package:compileEvents': this.compileSNSEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'sns', {
      anyOf: [
        { type: 'string', maxLength: 256, pattern: '^[\\w-]+$' },
        { $ref: '#/definitions/awsArnString' },
        {
          type: 'object',
          properties: {
            arn: { $ref: '#/definitions/awsArn' },
            topicName: { type: 'string', maxLength: 256, pattern: '^[\\w-]+$' },
            displayName: { type: 'string', minLength: 1 },
            filterPolicy: { type: 'object' },
            redrivePolicy: {
              type: 'object',
              properties: {
                deadLetterTargetArn: { $ref: '#/definitions/awsArnString' },
                deadLetterTargetRef: { type: 'string', minLength: 1 },
                deadLetterTargetImport: {
                  type: 'object',
                  properties: {
                    arn: { $ref: '#/definitions/awsArnString' },
                    url: { type: 'string', minLength: 1 },
                  },
                  required: ['arn', 'url'],
                  additionalProperties: false,
                },
              },
              oneOf: [
                { required: ['deadLetterTargetArn'] },
                { required: ['deadLetterTargetRef'] },
                { required: ['deadLetterTargetImport'] },
              ],
              additionalProperties: false,
            },
          },
          anyOf: [{ required: ['arn'] }, { required: ['topicName'] }],
          additionalProperties: false,
        },
      ],
    });
  }

  compileSNSEvents() {
    const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (!event.sns) {
            return;
          }

          let topicArn;
          let topicName;
          let region;

          if (typeof event.sns === 'object') {
            if (event.sns.arn) {
              topicArn = event.sns.arn;
              if (typeof topicArn === 'string') {
                const splitArn = topicArn.split(/(?<!:):(?!:)/);
                topicName = splitArn[splitArn.length - 1];
                if (splitArn[3] !== this.options.region) {
                  region = splitArn[3];
                }
              }
              topicName = event.sns.topicName || topicName;
              // Only true when providing CFN intrinsic function (not string) to arn property without topicName property
              if (!topicName) {
                throw new ServerlessError(
                  'Missing "sns.topicName" setting (it needs to be provided if "sns.arn" is not provided as plain ARN string)',
                  'SNS_MISSING_TOPIC_NAME'
                );
              }
            } else {
              topicName = event.sns.topicName;
            }
          } else if (event.sns.indexOf('arn:') === 0) {
            topicArn = event.sns;
            const splitArn = topicArn.split(':');
            topicName = splitArn[splitArn.length - 1];
          } else {
            topicName = event.sns;
          }

          const endpoint = resolveLambdaTarget(functionName, functionObj);
          const subscriptionLogicalId = this.provider.naming.getLambdaSnsSubscriptionLogicalId(
            functionName,
            topicName
          );

          const dependsOn = [];
          const functionIamRoleResourceName =
            this.provider.resolveFunctionIamRoleResourceName(functionObj);
          if (functionIamRoleResourceName) {
            dependsOn.push(functionIamRoleResourceName);
          }
          const { targetAlias } = this.serverless.service.functions[functionName];
          if (targetAlias) {
            dependsOn.push(targetAlias.logicalId);
          }

          const snsSubscriptionResourceTemplate = {
            Type: 'AWS::SNS::Subscription',
            Properties: {
              Protocol: 'lambda',
              Endpoint: endpoint,
              Region: region,
            },
            DependsOn: dependsOn,
          };

          if (!topicArn) {
            const topicLogicalId = this.provider.naming.getTopicLogicalId(topicName);
            const snsTopicResourceTemplate = {
              Type: 'AWS::SNS::Topic',
              Properties: { TopicName: topicName },
            };

            if (event.sns.displayName) {
              snsTopicResourceTemplate.Properties.DisplayName = event.sns.displayName;
            }

            snsSubscriptionResourceTemplate.Properties.TopicArn = {
              Ref: topicLogicalId,
            };
            snsSubscriptionResourceTemplate.DependsOn.push(topicLogicalId);

            cfTemplate.Resources[topicLogicalId] = snsTopicResourceTemplate;
          } else {
            snsSubscriptionResourceTemplate.Properties.TopicArn = topicArn;
          }

          if (event.sns.filterPolicy) {
            snsSubscriptionResourceTemplate.Properties.FilterPolicy = event.sns.filterPolicy;
          }

          if (event.sns.redrivePolicy) {
            const { deadLetterTargetArn, deadLetterTargetRef, deadLetterTargetImport } =
              event.sns.redrivePolicy;
            let targetArn;
            let targetUrl;

            if (deadLetterTargetArn) {
              targetArn = deadLetterTargetArn;
              // arn:aws:sqs:us-east-1:11111111111:myDLQ
              const [deQueueName, deAccount, deRegion] = deadLetterTargetArn.split(':').reverse();
              targetUrl = {
                'Fn::Join': [
                  '',
                  [
                    `https://sqs.${deRegion}.`,
                    { Ref: 'AWS::URLSuffix' },
                    `/${deAccount}/${deQueueName}`,
                  ],
                ],
              };
            } else if (deadLetterTargetRef) {
              targetArn = {
                'Fn::GetAtt': [deadLetterTargetRef, 'Arn'],
              };
              targetUrl = {
                Ref: deadLetterTargetRef,
              };
            } else {
              targetArn = {
                'Fn::ImportValue': deadLetterTargetImport.arn,
              };
              targetUrl = {
                'Fn::ImportValue': deadLetterTargetImport.url,
              };
            }

            snsSubscriptionResourceTemplate.Properties.RedrivePolicy = {
              deadLetterTargetArn: targetArn,
            };

            const queuePolicyLogicalId = this.provider.naming.getTopicDLQPolicyLogicalId(
              functionName,
              topicName
            );
            const queuePolicyResourceTemplate = {
              Type: 'AWS::SQS::QueuePolicy',
              Properties: {
                PolicyDocument: {
                  Version: '2012-10-17',
                  Id: queuePolicyLogicalId,
                  Statement: [
                    {
                      Effect: 'Allow',
                      Principal: {
                        Service: 'sns.amazonaws.com',
                      },
                      Action: 'sqs:SendMessage',
                      Resource: targetArn,
                      Condition: {
                        ArnEquals: {
                          'aws:SourceArn': topicArn,
                        },
                      },
                    },
                  ],
                },
                Queues: [targetUrl],
              },
            };

            cfTemplate.Resources[queuePolicyLogicalId] = queuePolicyResourceTemplate;
          }

          const lambdaPermissionLogicalId = this.provider.naming.getLambdaSnsPermissionLogicalId(
            functionName,
            topicName
          );
          const lambdaPermissionResourceTemplate = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: endpoint,
              Action: 'lambda:InvokeFunction',
              Principal: 'sns.amazonaws.com',
              SourceArn: topicArn,
            },
          };

          if (targetAlias) {
            lambdaPermissionResourceTemplate.DependsOn = targetAlias.logicalId;
          }

          cfTemplate.Resources[lambdaPermissionLogicalId] = lambdaPermissionResourceTemplate;
          cfTemplate.Resources[subscriptionLogicalId] = snsSubscriptionResourceTemplate;
        });
      }
    });
  }
}

module.exports = AwsCompileSNSEvents;
