import _ from 'lodash'
import ServerlessError from '../../../../../serverless-error.js'
import resolveLambdaTarget from '../../../utils/resolve-lambda-target.js'
import usesDedicatedPerFunctionRole from '../../lib/uses-dedicated-per-function-role.js'

class AwsCompileSQSEvents {
  constructor(serverless) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      'package:compileEvents': async () => this.compileSQSEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'sqs', {
      description: `SQS event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/sqs
@example
events:
  - sqs:
      arn: arn:aws:sqs:region:account:queue
      batchSize: 10
      functionResponseType: ReportBatchItemFailures`,
      anyOf: [
        { $ref: '#/definitions/awsArnString' },
        {
          type: 'object',
          properties: {
            arn: {
              description: `SQS queue ARN or CloudFormation reference.
@example 'arn:aws:sqs:us-east-1:123456789:my-queue'`,
              $ref: '#/definitions/awsArn',
            },
            batchSize: {
              description: `Number of messages to retrieve per batch (1-10000).
@default 10`,
              type: 'integer',
              minimum: 1,
              maximum: 10000,
            },
            enabled: {
              description: `Enable or disable the event source mapping.
@default true`,
              type: 'boolean',
            },
            maximumBatchingWindow: {
              description: `Maximum time to wait for a full batch in seconds (0-300).`,
              type: 'integer',
              minimum: 0,
              maximum: 300,
            },
            functionResponseType: {
              description: `Enable partial batch failure reporting.`,
              enum: ['ReportBatchItemFailures'],
            },
            filterPatterns: {
              description: `Event filter patterns.
@see https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html`,
              $ref: '#/definitions/filterPatterns',
            },
            maximumConcurrency: {
              description: `Maximum concurrent batches processed by Lambda.`,
              type: 'integer',
              minimum: 2,
              maximum: 1000,
            },
            provisionedPollers: {
              description: `Provisioned mode for the event source mapping — dedicated event pollers with min/max bounds. Mutually exclusive with maximumConcurrency. Set to false to disable provisioned mode on an existing mapping.
@see https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html
@example
provisionedPollers:
  min: 2
  max: 500`,
              anyOf: [
                { const: false },
                {
                  type: 'object',
                  properties: {
                    min: {
                      description: `Minimum number of provisioned event pollers (2-200). AWS default: 2.`,
                      type: 'integer',
                      minimum: 2,
                      maximum: 200,
                    },
                    max: {
                      description: `Maximum number of provisioned event pollers (2-10000). AWS default: 200.`,
                      type: 'integer',
                      minimum: 2,
                      maximum: 10000,
                    },
                  },
                  minProperties: 1,
                  additionalProperties: false,
                },
              ],
            },
          },
          required: ['arn'],
          additionalProperties: false,
        },
      ],
    })
  }

  compileSQSEvents() {
    const sqsStatement = {
      Effect: 'Allow',
      Action: [
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes',
      ],
      Resource: [],
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      const skipGlobalRolePermissions = usesDedicatedPerFunctionRole({
        functionObject: functionObj,
        serverless: this.serverless,
        awsProvider: this.provider,
      })

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.sqs) {
            let EventSourceArn
            let BatchSize = 10
            let Enabled = true

            if (typeof event.sqs === 'object') {
              EventSourceArn = event.sqs.arn
              BatchSize = event.sqs.batchSize || BatchSize
              if (typeof event.sqs.enabled !== 'undefined') {
                Enabled = event.sqs.enabled
              }
            } else if (typeof event.sqs === 'string') {
              EventSourceArn = event.sqs
            }

            const queueName = (function () {
              if (EventSourceArn['Fn::GetAtt']) {
                return EventSourceArn['Fn::GetAtt'][0]
              } else if (EventSourceArn['Fn::ImportValue']) {
                return EventSourceArn['Fn::ImportValue']
              } else if (EventSourceArn['Fn::Join']) {
                // [0] is the used delimiter, [1] is the array with values
                return EventSourceArn['Fn::Join'][1].slice(-1).pop()
              }
              return EventSourceArn.split(':').pop()
            })()

            const queueLogicalId = this.provider.naming.getQueueLogicalId(
              functionName,
              queueName,
            )

            const dependsOn = []
            const functionIamRoleResourceName =
              this.provider.resolveFunctionIamRoleResourceName(functionObj)
            if (functionIamRoleResourceName) {
              dependsOn.push(functionIamRoleResourceName)
            }
            const { targetAlias } =
              this.serverless.service.functions[functionName]
            if (targetAlias) {
              dependsOn.push(targetAlias.logicalId)
            }

            const sqsTemplate = {
              Type: 'AWS::Lambda::EventSourceMapping',
              DependsOn: dependsOn,
              Properties: {
                BatchSize,
                MaximumBatchingWindowInSeconds:
                  event.sqs.maximumBatchingWindow != null
                    ? event.sqs.maximumBatchingWindow
                    : undefined,
                EventSourceArn,
                FunctionName: resolveLambdaTarget(functionName, functionObj),
                Enabled,
              },
            }

            if (event.sqs.functionResponseType != null) {
              sqsTemplate.Properties.FunctionResponseTypes = [
                event.sqs.functionResponseType,
              ]
            }

            if (event.sqs.filterPatterns) {
              sqsTemplate.Properties.FilterCriteria = {
                Filters: event.sqs.filterPatterns.map((pattern) => ({
                  Pattern: JSON.stringify(pattern),
                })),
              }
            }

            if (event.sqs.maximumConcurrency) {
              sqsTemplate.Properties.ScalingConfig = {
                MaximumConcurrency: event.sqs.maximumConcurrency,
              }
            }

            const provisionedPollers = event.sqs.provisionedPollers
            if (provisionedPollers && typeof provisionedPollers === 'object') {
              if (event.sqs.maximumConcurrency) {
                throw new ServerlessError(
                  `The "sqs" event of function "${functionName}" cannot set both "maximumConcurrency" and "provisionedPollers". They are mutually exclusive scaling modes: in provisioned mode, control concurrency with "provisionedPollers.max" instead.`,
                  'SQS_EVENT_SCALING_MODE_CONFLICT',
                )
              }
              if (
                provisionedPollers.min != null &&
                provisionedPollers.max != null &&
                provisionedPollers.min > provisionedPollers.max
              ) {
                throw new ServerlessError(
                  `The "sqs" event of function "${functionName}" has "provisionedPollers.min" (${provisionedPollers.min}) greater than "max" (${provisionedPollers.max}).`,
                  'EVENT_PROVISIONED_POLLERS_INVALID',
                )
              }
              sqsTemplate.Properties.ProvisionedPollerConfig = {
                ...(provisionedPollers.min != null && {
                  MinimumPollers: provisionedPollers.min,
                }),
                ...(provisionedPollers.max != null && {
                  MaximumPollers: provisionedPollers.max,
                }),
              }
            } else if (provisionedPollers === false) {
              // Update-time clear ({} disables provisioned mode). On a brand-new
              // mapping AWS rejects {} at create — documented; users remove the line.
              sqsTemplate.Properties.ProvisionedPollerConfig = {}
            }

            if (!skipGlobalRolePermissions) {
              // add event source ARNs to PolicyDocument statements
              sqsStatement.Resource.push(EventSourceArn)
            }

            const newSQSObject = {
              [queueLogicalId]: sqsTemplate,
            }

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate
                .Resources,
              newSQSObject,
            )
          }
        })
      }
    })

    // update the PolicyDocument statements (if default policy is used)
    if (
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .IamRoleLambdaExecution
    ) {
      const statement =
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution.Properties.Policies[0]
          .PolicyDocument.Statement
      if (sqsStatement.Resource.length) {
        statement.push(sqsStatement)
      }
    }
  }
}

export default AwsCompileSQSEvents
