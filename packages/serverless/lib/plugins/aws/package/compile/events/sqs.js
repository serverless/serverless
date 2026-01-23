import _ from 'lodash'
import resolveLambdaTarget from '../../../utils/resolve-lambda-target.js'
import ServerlessError from '../../../../../serverless-error.js'

class AwsCompileSQSEvents {
  constructor(serverless) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      'package:compileEvents': async () => this.compileSQSEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'sqs', {
      anyOf: [
        { $ref: '#/definitions/awsArnString' },
        {
          type: 'object',
          properties: {
            arn: { $ref: '#/definitions/awsArn' },
            batchSize: { type: 'integer', minimum: 1, maximum: 10000 },
            enabled: { type: 'boolean' },
            maximumBatchingWindow: {
              type: 'integer',
              minimum: 0,
              maximum: 300,
            },
            functionResponseType: { enum: ['ReportBatchItemFailures'] },
            filterPatterns: { $ref: '#/definitions/filterPatterns' },
            maximumConcurrency: { type: 'integer', minimum: 2, maximum: 1000 },
            provisioned: {
              type: 'object',
              properties: {
                mode: { enum: ['PROVISIONED', 'ON_DEMAND'] },
                minimumPollers: { type: 'integer', minimum: 1, maximum: 200 },
                maximumPollers: { type: 'integer', minimum: 1, maximum: 2000 },
              },
              additionalProperties: false,
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

            // Handle SQS Provisioned Mode configuration
            if (event.sqs.provisioned) {
              const provisionedConfig = event.sqs.provisioned

              // Validate provisioned mode constraints
              this.validateProvisionedModeConfig(
                functionName,
                provisionedConfig,
                event.sqs.maximumConcurrency,
              )

              const provisionedPollerConfig = {}

              // Set mode (PROVISIONED or ON_DEMAND)
              if (provisionedConfig.mode) {
                provisionedPollerConfig.Mode = provisionedConfig.mode
              }

              // Set MinimumPollers (only valid when mode is PROVISIONED)
              if (provisionedConfig.minimumPollers != null) {
                provisionedPollerConfig.MinimumPollers =
                  provisionedConfig.minimumPollers
              }

              // Set MaximumPollers
              if (provisionedConfig.maximumPollers != null) {
                provisionedPollerConfig.MaximumPollers =
                  provisionedConfig.maximumPollers
              }

              if (Object.keys(provisionedPollerConfig).length > 0) {
                sqsTemplate.Properties.ProvisionedPollerConfig =
                  provisionedPollerConfig
              }
            }

            // add event source ARNs to PolicyDocument statements
            sqsStatement.Resource.push(EventSourceArn)

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

  /**
   * Validates the provisioned mode configuration for SQS event source mapping.
   *
   * @param {string} functionName - The name of the Lambda function
   * @param {object} provisionedConfig - The provisioned mode configuration
   * @param {number} maximumConcurrency - The maximumConcurrency setting (if any)
   */
  validateProvisionedModeConfig(
    functionName,
    provisionedConfig,
    maximumConcurrency,
  ) {
    const { mode, minimumPollers, maximumPollers } = provisionedConfig

    // Validate that minimumPollers requires PROVISIONED mode
    if (
      minimumPollers != null &&
      mode !== 'PROVISIONED' &&
      mode !== undefined
    ) {
      throw new ServerlessError(
        `SQS event for function "${functionName}": minimumPollers can only be set when mode is PROVISIONED`,
        'SQS_PROVISIONED_MODE_INVALID_CONFIG',
      )
    }

    // Validate minimumPollers <= maximumPollers when both are specified
    if (
      minimumPollers != null &&
      maximumPollers != null &&
      minimumPollers > maximumPollers
    ) {
      throw new ServerlessError(
        `SQS event for function "${functionName}": minimumPollers (${minimumPollers}) cannot be greater than maximumPollers (${maximumPollers})`,
        'SQS_PROVISIONED_MODE_POLLERS_MISMATCH',
      )
    }

    // Warn about maximumConcurrency being incompatible with provisioned mode in certain scenarios
    // Note: AWS may have specific restrictions, but we allow it with a warning for flexibility
    if (maximumConcurrency && mode === 'PROVISIONED') {
      this.serverless.cli.log(
        `Warning: SQS event for function "${functionName}" has both maximumConcurrency and provisioned mode configured. ` +
          `Ensure your AWS account supports this combination.`,
      )
    }
  }
}

export default AwsCompileSQSEvents
