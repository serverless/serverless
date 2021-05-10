'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../serverless-error');

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
    const template = this.serverless.service.provider.compiledCloudFormationTemplate;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.sns) {
            let topicArn;
            let topicName;
            let region;
            let redrivePolicy;
            if (typeof event.sns === 'object') {
              if (event.sns.arn) {
                topicArn = event.sns.arn;
                if (typeof topicArn === 'string') {
                  // NOTE: we need to process the topic ARN that way due to lacking
                  // support of regex lookbehind in Node.js 6.
                  // Once Node.js 6 support is dropped we can change this to:
                  // `const splitArn = topicArn.split(/(?<!:):(?!:)/);`
                  const splitArn = topicArn
                    .replace(/::/g, '@@')
                    .split(':')
                    .map((s) => s.replace(/@@/g, '::'));
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

              redrivePolicy = {
                deadLetterTargetArn: targetArn,
              };

              const queuePolicyLogicalId = this.provider.naming.getTopicDLQPolicyLogicalId(
                functionName,
                topicName
              );

              Object.assign(template.Resources, {
                [queuePolicyLogicalId]: {
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
                },
              });
            }

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);

            const endpoint = {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            };

            const subscriptionLogicalId = this.provider.naming.getLambdaSnsSubscriptionLogicalId(
              functionName,
              topicName
            );

            if (topicArn) {
              _.merge(template.Resources, {
                [subscriptionLogicalId]: {
                  Type: 'AWS::SNS::Subscription',
                  Properties: {
                    TopicArn: topicArn,
                    Protocol: 'lambda',
                    Endpoint: endpoint,
                    FilterPolicy: event.sns.filterPolicy,
                    RedrivePolicy: redrivePolicy,
                    Region: region,
                  },
                },
              });
            } else {
              topicArn = {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':sns:',
                    { Ref: 'AWS::Region' },
                    ':',
                    { Ref: 'AWS::AccountId' },
                    ':',
                    topicName,
                  ],
                ],
              };

              const topicLogicalId = this.provider.naming.getTopicLogicalId(topicName);

              const subscription = {
                Endpoint: endpoint,
                Protocol: 'lambda',
              };

              if (!(topicLogicalId in template.Resources)) {
                const topicResourceProperties = { TopicName: topicName };
                if (event.sns.displayName) {
                  topicResourceProperties.DisplayName = event.sns.displayName;
                }
                _.merge(template.Resources, {
                  [topicLogicalId]: {
                    Type: 'AWS::SNS::Topic',
                    Properties: topicResourceProperties,
                  },
                });
              }

              if (event.sns.filterPolicy || redrivePolicy) {
                _.merge(template.Resources, {
                  [subscriptionLogicalId]: {
                    Type: 'AWS::SNS::Subscription',
                    Properties: _.merge(subscription, {
                      TopicArn: {
                        Ref: topicLogicalId,
                      },
                      FilterPolicy: event.sns.filterPolicy,
                      RedrivePolicy: redrivePolicy,
                    }),
                  },
                });
              } else {
                if (!template.Resources[topicLogicalId].Properties.Subscription) {
                  template.Resources[topicLogicalId].Properties.Subscription = [];
                }
                template.Resources[topicLogicalId].Properties.Subscription.push(subscription);
              }
            }

            const lambdaPermissionLogicalId = this.provider.naming.getLambdaSnsPermissionLogicalId(
              functionName,
              topicName
            );

            _.merge(template.Resources, {
              [lambdaPermissionLogicalId]: {
                Type: 'AWS::Lambda::Permission',
                Properties: {
                  FunctionName: endpoint,
                  Action: 'lambda:InvokeFunction',
                  Principal: 'sns.amazonaws.com',
                  SourceArn: topicArn,
                },
              },
            });
          }
        });
      }
    });
  }
}

module.exports = AwsCompileSNSEvents;
