import _ from 'lodash'
import ServerlessError from '../../../../../serverless-error.js'
import resolveLambdaTarget from '../../../utils/resolve-lambda-target.js'

class AwsCompileSNSEvents {
  constructor(serverless, options) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')
    this.options = options
    this.hooks = {
      'package:compileEvents': async () => this.compileSNSEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'sns', {
      description: `SNS event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/sns
@example
events:
  - sns:
      arn: arn:aws:sns:region:account:topic
      filterPolicy:
        type:
          - order`,
      anyOf: [
        { type: 'string', maxLength: 256, pattern: '^[\\w-]+$' },
        { $ref: '#/definitions/awsArnString' },
        {
          type: 'object',
          properties: {
            arn: {
              description: `ARN of existing SNS topic.`,
              $ref: '#/definitions/awsArn',
            },
            topicName: {
              description: `Name for new SNS topic.
@example 'my-topic'`,
              type: 'string',
              maxLength: 256,
              pattern: '^[\\w-]+$',
            },
            displayName: {
              description: `Display name for the topic.`,
              type: 'string',
              minLength: 1,
            },
            filterPolicy: {
              description: `Message attribute filter policy.
@see https://docs.aws.amazon.com/sns/latest/dg/sns-subscription-filter-policies.html
@example
filterPolicy:
  type:
    - order`,
              type: 'object',
            },
            filterPolicyScope: {
              description: `Scope for evaluating filter policy.
@example 'MessageAttributes'`,
              type: 'string',
            },
            redrivePolicy: {
              description: `SNS redrive (dead letter queue) policy.
@see https://www.serverless.com/framework/docs/providers/aws/events/sns#setting-a-redrive-policy`,
              type: 'object',
              properties: {
                deadLetterTargetArn: {
                  description: `ARN of the dead letter queue.`,
                  $ref: '#/definitions/awsArnString',
                },
                deadLetterTargetRef: {
                  description: `CloudFormation Ref to the dead letter queue.`,
                  type: 'string',
                  minLength: 1,
                },
                deadLetterTargetImport: {
                  description: `Import existing dead letter queue.`,
                  type: 'object',
                  properties: {
                    arn: {
                      description: `ARN of the DLQ.`,
                      $ref: '#/definitions/awsArnString',
                    },
                    url: {
                      description: `URL of the DLQ (SQS).`,
                      type: 'string',
                      minLength: 1,
                    },
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
            kmsMasterKeyId: {
              description: `KMS key id or ARN used to encrypt the topic.`,
              anyOf: [
                { $ref: '#/definitions/awsArn' },
                { $ref: '#/definitions/awsCfFunction' },
                { type: 'string', pattern: '^alias\/' },
                { type: 'string', pattern: '^[a-f0-9-]+$' },
              ],
            },
          },
          anyOf: [{ required: ['arn'] }, { required: ['topicName'] }],
          additionalProperties: false,
        },
      ],
    })
  }

  compileSNSEvents() {
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.sns) {
            let topicArn
            let topicName
            let region
            let redrivePolicy
            if (typeof event.sns === 'object') {
              if (event.sns.arn) {
                topicArn = event.sns.arn
                if (typeof topicArn === 'string') {
                  // NOTE: we need to process the topic ARN that way due to lacking
                  // support of regex lookbehind in Node.js 6.
                  // Once Node.js 6 support is dropped we can change this to:
                  // `const splitArn = topicArn.split(/(?<!:):(?!:)/);`
                  const splitArn = topicArn
                    .replace(/::/g, '@@')
                    .split(':')
                    .map((s) => s.replace(/@@/g, '::'))
                  topicName = splitArn[splitArn.length - 1]
                  if (splitArn[3] !== this.options.region) {
                    region = splitArn[3]
                  }
                }
                topicName = event.sns.topicName || topicName
                // Only true when providing CFN intrinsic function (not string) to arn property without topicName property
                if (!topicName) {
                  throw new ServerlessError(
                    'Missing "sns.topicName" setting (it needs to be provided if "sns.arn" is not provided as plain ARN string)',
                    'SNS_MISSING_TOPIC_NAME',
                  )
                }
              } else {
                topicName = event.sns.topicName
              }
            } else if (event.sns.indexOf('arn:') === 0) {
              topicArn = event.sns
              const splitArn = topicArn.split(':')
              topicName = splitArn[splitArn.length - 1]
            } else {
              topicName = event.sns
            }

            if (event.sns.redrivePolicy) {
              const {
                deadLetterTargetArn,
                deadLetterTargetRef,
                deadLetterTargetImport,
              } = event.sns.redrivePolicy
              let targetArn
              let targetUrl

              if (deadLetterTargetArn) {
                targetArn = deadLetterTargetArn
                // arn:aws:sqs:us-east-1:11111111111:myDLQ
                const [deQueueName, deAccount, deRegion] = deadLetterTargetArn
                  .split(':')
                  .reverse()
                targetUrl = {
                  'Fn::Join': [
                    '',
                    [
                      `https://sqs.${deRegion}.`,
                      { Ref: 'AWS::URLSuffix' },
                      `/${deAccount}/${deQueueName}`,
                    ],
                  ],
                }
              } else if (deadLetterTargetRef) {
                targetArn = {
                  'Fn::GetAtt': [deadLetterTargetRef, 'Arn'],
                }
                targetUrl = {
                  Ref: deadLetterTargetRef,
                }
              } else {
                targetArn = {
                  'Fn::ImportValue': deadLetterTargetImport.arn,
                }
                targetUrl = {
                  'Fn::ImportValue': deadLetterTargetImport.url,
                }
              }

              redrivePolicy = {
                deadLetterTargetArn: targetArn,
              }

              const queuePolicyLogicalId =
                this.provider.naming.getTopicDLQPolicyLogicalId(
                  functionName,
                  topicName,
                )

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
              })
            }

            const endpoint = resolveLambdaTarget(functionName, functionObj)

            const subscriptionLogicalId =
              this.provider.naming.getLambdaSnsSubscriptionLogicalId(
                functionName,
                topicName,
              )

            if (topicArn) {
              _.merge(template.Resources, {
                [subscriptionLogicalId]: {
                  Type: 'AWS::SNS::Subscription',
                  DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
                  Properties: {
                    TopicArn: topicArn,
                    Protocol: 'lambda',
                    Endpoint: endpoint,
                    FilterPolicy: event.sns.filterPolicy,
                    FilterPolicyScope: event.sns.filterPolicyScope,
                    RedrivePolicy: redrivePolicy,
                    Region: region,
                  },
                },
              })
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
              }

              const topicLogicalId =
                this.provider.naming.getTopicLogicalId(topicName)

              const subscription = {
                Endpoint: endpoint,
                Protocol: 'lambda',
              }

              if (!(topicLogicalId in template.Resources)) {
                const topicResourceProperties = { TopicName: topicName }
                if (event.sns.displayName) {
                  topicResourceProperties.DisplayName = event.sns.displayName
                }
                if (event.sns.kmsMasterKeyId) {
                  topicResourceProperties.KmsMasterKeyId =
                    event.sns.kmsMasterKeyId
                }
                _.merge(template.Resources, {
                  [topicLogicalId]: {
                    Type: 'AWS::SNS::Topic',
                    DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
                    Properties: topicResourceProperties,
                  },
                })
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
                      FilterPolicyScope: event.sns.filterPolicyScope,
                      RedrivePolicy: redrivePolicy,
                    }),
                  },
                })
              } else {
                if (
                  !template.Resources[topicLogicalId].Properties.Subscription
                ) {
                  template.Resources[topicLogicalId].Properties.Subscription =
                    []
                }
                template.Resources[topicLogicalId].Properties.Subscription.push(
                  subscription,
                )
              }
            }

            const lambdaPermissionLogicalId =
              this.provider.naming.getLambdaSnsPermissionLogicalId(
                functionName,
                topicName,
              )

            _.merge(template.Resources, {
              [lambdaPermissionLogicalId]: {
                Type: 'AWS::Lambda::Permission',
                DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
                Properties: {
                  FunctionName: endpoint,
                  Action: 'lambda:InvokeFunction',
                  Principal: 'sns.amazonaws.com',
                  SourceArn: topicArn,
                },
              },
            })
          }
        })
      }
    })
  }
}

export default AwsCompileSNSEvents
