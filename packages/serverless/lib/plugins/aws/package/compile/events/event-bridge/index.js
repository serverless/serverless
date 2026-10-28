import _ from 'lodash'
import { addCustomResourceToService } from '../../../../custom-resources/index.js'
import ServerlessError from '../../../../../../serverless-error.js'
import {
  makeAndHashRuleName,
  makeEventBusTargetId,
  makeRuleName,
} from './utils.js'
import resolveLambdaTarget from '../../../../utils/resolve-lambda-target.js'
import { classifyEventBus } from './bus-type.js'
import {
  buildSubscriber,
  validateRuleEvent,
  validateSubscriberEvent,
} from './compile-subscriber.js'
import { buildDeliveryRole } from './delivery-role.js'

function caseInsensitive(str) {
  return { type: 'string', regexp: new RegExp(`^${str}$`, 'i').toString() }
}

// Factories, so each Serverless instance registers its own schema objects.
const patternSchema = () => ({
  description: `EventBridge pattern with full event matching.
@see https://docs.aws.amazon.com/eventbridge/latest/userguide/aws-events.html
@example
pattern:
  source:
    - aws.ec2
  detail-type:
    - EC2 Instance State-change Notification`,
  type: 'object',
  properties: {
    version: { description: `Event schema version.` },
    id: { description: `Event id filter.` },
    'detail-type': { description: `Detail type filter.` },
    source: { description: `Event source identifiers.` },
    account: { description: `AWS account filter.` },
    time: { description: `Event timestamp filter.` },
    region: { description: `AWS region filter.` },
    resources: { description: `Resource ARN filter list.` },
    detail: {
      description: `EventBridge/CloudWatch event detail pattern.`,
    },
    $or: {
      description: `OR-combined event pattern clauses.`,
      type: 'array',
    },
  },
})

// A rule pattern matches the event envelope, so its top-level keys are fixed.
// A subscriber filter may match any key, so the schema closes `pattern` only
// when `eventBus` is not a Custom Event Bus. The schema cannot see resource
// types, so every Ref keeps `pattern` open.
const customEventBusSchema = () => ({
  anyOf: [
    { type: 'string', pattern: ':event-busv2/' },
    { type: 'object', required: ['Ref'] },
    {
      type: 'object',
      required: ['Fn::GetAtt'],
      properties: {
        'Fn::GetAtt': {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: [{ type: 'string' }, { const: 'EventBusArn' }],
        },
      },
    },
  ],
})

class AwsCompileEventBridgeEvents {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      initialize: () => {
        const useCloudFormation = _.get(
          this.serverless.service.provider,
          'eventBridge.useCloudFormation',
        )
        const hasFunctionsWithEventBridgeTrigger = Object.values(
          this.serverless.service.functions,
        ).some(({ events }) => events.some(({ eventBridge }) => eventBridge))

        if (hasFunctionsWithEventBridgeTrigger) {
          if (useCloudFormation === false) {
            this.serverless._logDeprecation(
              'AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN',
              'Support for provisioning AWS EventBridge resources without native CloudFormation' +
                ' resources is deprecated and will no longer be maintained. If you want to' +
                ' upgrade to native CloudFormation, remove "eventBridge.useCloudFormation"' +
                ' setting from your configuration.',
            )
          } else if (useCloudFormation === true) {
            this.serverless._logDeprecation(
              'AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN',
              'Provisioning AWS EventBridge resources with native CloudFormation is now' +
                ' enabled by default. Please remove "eventBridge.useCloudFormation" from your' +
                ' configuration as this setting will not be recognized in the next major release.',
            )
          }
        } else if (useCloudFormation != null) {
          this.serverless._logDeprecation(
            'AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN',
            'Your service does not configure any "eventBridge" events. Please remove' +
              ' "eventBridge.useCloudFormation" from your configuration as this setting' +
              ' will not be recognized in the next major release.',
          )
        }
      },
      'package:compileEvents': async () => this.compileEventBridgeEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent(
      'aws',
      'eventBridge',
      {
        description: `EventBridge event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/event-bridge`,
        type: 'object',
        properties: {
          eventBus: {
            description: `Custom event bus name or ARN.
@see https://www.serverless.com/framework/docs/providers/aws/events/event-bridge#using-a-different-event-bus
@example 'my-custom-bus'`,
            anyOf: [
              { type: 'string', minLength: 1 },
              { $ref: '#/definitions/awsArnString' },
              { $ref: '#/definitions/awsCfImport' },
              { $ref: '#/definitions/awsCfRef' },
              // GetAtt references the "Name" of a Classic bus or the "EventBusArn" of a Custom Event Bus
              {
                type: 'object',
                properties: {
                  'Fn::GetAtt': {
                    description: `GetAtt reference to an EventBus Name or EventBusArn attribute.`,
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: [
                      { type: 'string', minLength: 1 },
                      { type: 'string', enum: ['Name', 'EventBusArn'] },
                    ],
                  },
                },
                required: ['Fn::GetAtt'],
                additionalProperties: false,
              },
            ],
          },
          schedule: {
            description: `Schedule expression (rate or cron).`,
            pattern: '^(?:cron|rate)\\(.+\\)$',
            type: 'string',
          },
          name: {
            description: `Custom rule name (up to 64 characters) or subscriber name (up to 256).`,
            type: 'string',
            pattern: '[a-zA-Z0-9-_.]+',
            minLength: 1,
          },
          description: {
            description: `Rule description.`,
            type: 'string',
            maxLength: 512,
          },
          enabled: {
            description: `Enable or disable the rule.`,
            type: 'boolean',
          },
          pattern: patternSchema(),
          input: {
            description: `Static payload passed to the target.`,
            type: 'object',
          },
          inputPath: {
            description: `JSON path to extract input from event.`,
            type: 'string',
            minLength: 1,
            maxLength: 256,
          },
          inputTransformer: {
            description: `EventBridge/CloudWatch input transformer.
@see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html`,
            type: 'object',
            properties: {
              inputPathsMap: {
                description: `Map of JSON path expressions to variable names.
@example { instance: '$.detail.instance-id' }`,
                type: 'object',
                additionalProperties: { type: 'string', minLength: 1 },
              },
              inputTemplate: {
                description: `Template for the transformed input.
@example '{"instance": <instance>}'`,
                type: 'string',
                minLength: 1,
                maxLength: 8192,
              },
            },
            required: ['inputTemplate'],
            additionalProperties: false,
          },
          retryPolicy: {
            description: `Retry behavior for failed target invocations.`,
            type: 'object',
            properties: {
              maximumEventAge: {
                description: `Maximum event age in seconds before EventBridge drops the event.`,
                type: 'integer',
                minimum: 60,
                maximum: 86400,
              },
              maximumRetryAttempts: {
                description: `Maximum number of retry attempts.`,
                type: 'integer',
                minimum: 0,
                maximum: 185,
              },
            },
          },
          deadLetterQueueArn: {
            description: `Dead-letter queue ARN for undeliverable events.`,
            $ref: '#/definitions/awsArn',
          },
          ordering: {
            description: `Delivery order of a Custom Event Bus subscriber.
@example 'fifo'`,
            anyOf: ['unordered', 'fifo'].map(caseInsensitive),
          },
          batchSize: {
            description: `Maximum number of events in one invocation of a Custom Event Bus subscriber.`,
            type: 'integer',
            minimum: 1,
            maximum: 100,
          },
          maximumBatchingWindow: {
            description: `Seconds a Custom Event Bus subscriber waits to fill a batch.`,
            type: 'integer',
            minimum: 0,
            maximum: 300,
          },
          async: {
            description: `Invoke the function asynchronously instead of waiting for it (Custom Event Bus only).`,
            type: 'boolean',
          },
          resumePosition: {
            description: `Where a Custom Event Bus subscriber resumes after it is started again.
@example 'latest'`,
            anyOf: ['last_processed', 'latest'].map(caseInsensitive),
          },
          role: {
            description: `IAM role EventBridge uses to invoke the function (Custom Event Bus only).`,
            anyOf: [
              { $ref: '#/definitions/awsArnString' },
              { $ref: '#/definitions/awsCfFunction' },
            ],
          },
        },
        if: {
          required: ['eventBus'],
          properties: { eventBus: customEventBusSchema() },
        },
        // Each branch carries its own name limit, so a long name gets one
        // message.
        then: { properties: { name: { maxLength: 256 } } },
        else: {
          properties: {
            pattern: { ...patternSchema(), additionalProperties: false },
            name: { maxLength: 64 },
          },
        },
      },
    )
  }

  compileEventBridgeEvents() {
    const { service } = this.serverless
    const { provider } = service
    const { compiledCloudFormationTemplate } = provider
    const iamRoleStatements = []
    const { eventBridge: options } = provider
    const shouldUseCloudFormation = options ? options.useCloudFormation : true
    let hasEventBusesIamRoleStatement = false
    let anyFuncUsesEventBridge = false
    // Grants for subscribers that EventBridge delivers through the generated role.
    const deliveryFunctionLogicalIds = []
    const deliveryDlqArns = []
    const subscriberLogicalIds = new Set()

    const providerRegion = this.provider.getRegion()

    service.getAllFunctions().forEach((functionName) => {
      const functionObj = service.getFunction(functionName)
      const FunctionName = functionObj.name

      if (functionObj.events) {
        functionObj.events.forEach((event, idx) => {
          if (event.eventBridge) {
            idx++
            anyFuncUsesEventBridge = true
            if (
              classifyEventBus(
                event.eventBridge.eventBus,
                service.resources?.Resources,
              ) === 'subscriber'
            ) {
              validateSubscriberEvent({
                functionKey: functionName,
                functionObj,
                event: event.eventBridge,
                providerRegion,
                useCloudFormation: options?.useCloudFormation,
              })
              const { logicalId, resource, usesGeneratedRole } =
                buildSubscriber({
                  naming: this.provider.naming,
                  functionName,
                  functionObj,
                  event: event.eventBridge,
                  index: idx,
                  deliveryRoleLogicalId:
                    this.provider.naming.getEventBridgeDeliveryRoleLogicalId(),
                })
              if (subscriberLogicalIds.has(logicalId)) {
                throw new ServerlessError(
                  `Two eventBridge subscribers compile to the same CloudFormation logical ID "${logicalId}". Give them names that differ in more than punctuation or the case of their first letter.`,
                  'EVENTBRIDGE_SUBSCRIBER_DUPLICATE_LOGICAL_ID',
                )
              }
              subscriberLogicalIds.add(logicalId)
              compiledCloudFormationTemplate.Resources[logicalId] = resource
              if (usesGeneratedRole) {
                deliveryFunctionLogicalIds.push(
                  this.provider.naming.getLambdaLogicalId(functionName),
                )
                if (event.eventBridge.deadLetterQueueArn !== undefined) {
                  deliveryDlqArns.push(event.eventBridge.deadLetterQueueArn)
                }
              }
              return
            }
            validateRuleEvent({
              functionKey: functionName,
              event: event.eventBridge,
              patternKeys: Object.keys(patternSchema().properties),
            })
            const Description = event.eventBridge.description
            const EventBus = event.eventBridge.eventBus
            const Schedule = event.eventBridge.schedule
            const Pattern = event.eventBridge.pattern
            const Input = event.eventBridge.input
            const InputPath = event.eventBridge.inputPath
            let RuleName = event.eventBridge.name
            let InputTransformer = event.eventBridge.inputTransformer
            let RetryPolicy = event.eventBridge.retryPolicy
            let DeadLetterConfig

            if (!RuleName) {
              RuleName = makeAndHashRuleName({
                functionName: FunctionName,
                index: idx,
              })
            }

            let State = 'ENABLED'
            if (event.eventBridge.enabled === false) {
              State = 'DISABLED'
            }

            if (
              [Input, InputPath, InputTransformer].filter(Boolean).length > 1
            ) {
              throw new ServerlessError(
                [
                  'You can only set one of input, inputPath, or inputTransformer ',
                  'properties for eventBridge events.',
                ].join(''),
                'EVENTBRIDGE_MULTIPLE_INPUT_PROPERTIES',
              )
            }

            if (InputTransformer) {
              InputTransformer = _.mapKeys(
                InputTransformer,
                (value, key) => key[0].toLocaleUpperCase() + key.slice(1),
              )
            }

            if (RetryPolicy) {
              if (!shouldUseCloudFormation) {
                throw new ServerlessError(
                  'Configuring RetryPolicy is not supported for EventBridge integration backed by Custom Resources. Please use "provider.eventBridge.useCloudFormation" setting to use native CloudFormation support for EventBridge.',
                  'ERROR_INVALID_RETRY_POLICY_TO_EVENT_BUS_CUSTOM_RESOURCE',
                )
              }

              RetryPolicy = {
                MaximumEventAgeInSeconds: RetryPolicy.maximumEventAge,
                MaximumRetryAttempts: RetryPolicy.maximumRetryAttempts,
              }
            }

            if (event.eventBridge.deadLetterQueueArn) {
              if (!shouldUseCloudFormation) {
                throw new ServerlessError(
                  'Configuring DeadLetterConfig is not supported for EventBridge integration backed by Custom Resources. Please use "provider.eventBridge.useCloudFormation" setting to use native CloudFormation support for EventBridge.',
                  'ERROR_INVALID_DEAD_LETTER_CONFIG_TO_EVENT_BUS_CUSTOM_RESOURCE',
                )
              }
              DeadLetterConfig = {
                Arn: event.eventBridge.deadLetterQueueArn,
              }
            }

            const eventBusName = EventBus
            // Custom resources will be deprecated in next major release
            if (!shouldUseCloudFormation) {
              const results = this.compileWithCustomResource({
                eventBusName,
                EventBus,
                compiledCloudFormationTemplate,
                functionName,
                RuleName,
                State,
                Input,
                InputPath,
                InputTransformer,
                Pattern,
                Schedule,
                FunctionName,
                idx,
                hasEventBusesIamRoleStatement,
                iamRoleStatements,
              })

              results.iamRoleStatements.forEach((statement) =>
                iamRoleStatements.push(statement),
              )
              hasEventBusesIamRoleStatement =
                results.hasEventBusesIamRoleStatement
            } else {
              this.compileWithCloudFormation({
                eventBusName,
                Description,
                EventBus,
                compiledCloudFormationTemplate,
                functionName,
                RuleName,
                State,
                Input,
                InputPath,
                InputTransformer,
                Pattern,
                Schedule,
                FunctionName,
                idx,
                hasEventBusesIamRoleStatement,
                iamRoleStatements,
                RetryPolicy,
                DeadLetterConfig,
              })
            }
          }
        })
      }
    })

    if (deliveryFunctionLogicalIds.length > 0) {
      const iamRole = provider.iam?.role
      // IAM caps role names at 64 characters, as roles-per-function.js checks
      // for the execution roles.
      const roleNameLength = this.provider.naming
        .getEventBridgeDeliveryRoleName()
        ['Fn::Join'][1].map((part) =>
          part?.Ref === 'AWS::Region'
            ? this.provider.getRegion()
            : String(part ?? ''),
        )
        .join('-').length
      if (roleNameLength > 64) {
        throw new ServerlessError(
          `The generated EventBridge delivery role name is ${roleNameLength} characters long, over IAM's limit of 64. Set "role" on each Custom Event Bus eventBridge event, or shorten the service or stage name.`,
          'EVENTBRIDGE_DELIVERY_ROLE_NAME_TOO_LONG',
        )
      }
      compiledCloudFormationTemplate.Resources[
        this.provider.naming.getEventBridgeDeliveryRoleLogicalId()
      ] = buildDeliveryRole({
        naming: this.provider.naming,
        functionLogicalIds: deliveryFunctionLogicalIds,
        dlqArns: deliveryDlqArns,
        iamRole: _.isObject(iamRole) ? iamRole : {},
        rolePermissionsBoundary: provider.rolePermissionsBoundary,
      })
    }

    // These permissions are for the custom resource lambda
    if (!shouldUseCloudFormation && anyFuncUsesEventBridge) {
      return this._addCustomResourceToService({ iamRoleStatements })
    }
    return null
  }

  compileWithCustomResource({
    eventBusName,
    EventBus,
    compiledCloudFormationTemplate,
    functionName,
    RuleName,
    State,
    Input,
    InputPath,
    InputTransformer,
    Pattern,
    Schedule,
    FunctionName,
    idx,
    hasEventBusesIamRoleStatement,
  }) {
    if (_.isObject(eventBusName)) {
      throw new ServerlessError(
        'Referencing event bus with CloudFormation intrinsic functions is not supported for EventBridge integration backed by Custom Resources. Please use `provider.eventBridge.useCloudFormation` setting to use native CloudFormation support for EventBridge.',
        'ERROR_INVALID_REFERENCE_TO_EVENT_BUS_CUSTOM_RESOURCE',
      )
    }

    const iamRoleStatements = []

    if (typeof eventBusName === 'string' && eventBusName.startsWith('arn')) {
      eventBusName = EventBus.slice(EventBus.indexOf('/') + 1)
    }

    const eventFunctionLogicalId =
      this.provider.naming.getLambdaLogicalId(functionName)
    const customResourceFunctionLogicalId =
      this.provider.naming.getCustomResourceEventBridgeHandlerFunctionLogicalId()
    const customEventBridgeResourceLogicalId =
      this.provider.naming.getCustomResourceEventBridgeResourceLogicalId(
        functionName,
        idx,
      )

    const customEventBridge = {
      Type: 'Custom::EventBridge',
      Version: '1.0',
      DependsOn: [eventFunctionLogicalId, customResourceFunctionLogicalId],
      Properties: {
        ServiceToken: {
          'Fn::GetAtt': [customResourceFunctionLogicalId, 'Arn'],
        },
        FunctionName,
        EventBridgeConfig: {
          RuleName,
          State,
          EventBus,
          Schedule,
          Pattern,
          Input,
          InputPath,
          InputTransformer,
        },
      },
    }

    compiledCloudFormationTemplate.Resources[
      customEventBridgeResourceLogicalId
    ] = customEventBridge

    if (
      !hasEventBusesIamRoleStatement &&
      eventBusName &&
      eventBusName !== 'default'
    ) {
      iamRoleStatements.push({
        Effect: 'Allow',
        Resource: {
          'Fn::Join': [
            ':',
            [
              'arn',
              { Ref: 'AWS::Partition' },
              'events',
              { Ref: 'AWS::Region' },
              { Ref: 'AWS::AccountId' },
              'event-bus/*',
            ],
          ],
        },
        Action: ['events:CreateEventBus', 'events:DeleteEventBus'],
      })
      hasEventBusesIamRoleStatement = true
    }
    return {
      iamRoleStatements,
      hasEventBusesIamRoleStatement,
    }
  }

  compileWithCloudFormation({
    eventBusName: _eventBusName,
    Description,
    EventBus,
    compiledCloudFormationTemplate,
    functionName,
    RuleName,
    State,
    Input,
    InputPath,
    InputTransformer,
    Pattern,
    Schedule,
    FunctionName,
    RetryPolicy,
    DeadLetterConfig,
    idx,
  }) {
    let eventBusResource
    let eventBusExists = false
    let eventBusName = _eventBusName

    // It suggests that the object already exists and is being imported
    if (_.isObject(eventBusName)) {
      eventBusExists = true
    }

    // Does the resource already exist? ARN string - assume it is valid - CF will validate ultimately
    if (typeof eventBusName === 'string' && eventBusName.startsWith('arn')) {
      eventBusExists = true
      eventBusName = EventBus.slice(EventBus.indexOf('/') + 1)
    }

    const shouldCreateEventBus =
      !eventBusExists && eventBusName && eventBusName !== 'default'
    if (shouldCreateEventBus) {
      // Create EventBus Resource
      eventBusResource = {
        Type: 'AWS::Events::EventBus',
        Properties: {
          Name: eventBusName,
        },
      }

      compiledCloudFormationTemplate.Resources[
        this.provider.naming.getEventBridgeEventBusLogicalId(eventBusName)
      ] = eventBusResource
    }

    const functionObj = this.serverless.service.getFunction(functionName)
    const targetBase = {
      Arn: resolveLambdaTarget(functionName, functionObj),
      Id: makeEventBusTargetId(RuleName),
    }

    const target = this.configureTarget({
      target: targetBase,
      Input,
      InputPath,
      InputTransformer,
      RetryPolicy,
      DeadLetterConfig,
    })

    // Create a rule
    const eventRuleResource = {
      Type: 'AWS::Events::Rule',
      DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
      Properties: {
        Description,
        // default event bus is used when EventBusName is not set
        EventBusName: eventBusName === 'default' ? undefined : eventBusName,
        EventPattern: Pattern,
        Name: RuleName,
        ScheduleExpression: Schedule,
        State,
        Targets: [target],
      },
    }
    // If this stack is creating the event bus the rule must depend on it to ensure stack can be removed
    if (shouldCreateEventBus) {
      eventRuleResource.DependsOn =
        this.provider.naming.getEventBridgeEventBusLogicalId(eventBusName)
    }

    const ruleNameLogicalIdStub = makeRuleName({
      functionName: FunctionName,
      index: idx,
    })

    compiledCloudFormationTemplate.Resources[
      this.provider.naming.getEventBridgeRuleLogicalId(ruleNameLogicalIdStub)
    ] = eventRuleResource

    // Rules on the default event bus have no bus name segment in their ARN
    const ruleNameArnPath =
      eventBusName && eventBusName !== 'default'
        ? [eventBusName, RuleName]
        : [RuleName]
    const lambdaPermissionResource = {
      Type: 'AWS::Lambda::Permission',
      DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: resolveLambdaTarget(functionName, functionObj),
        Principal: 'events.amazonaws.com',
        SourceArn: {
          'Fn::Join': [
            ':',
            [
              'arn',
              { Ref: 'AWS::Partition' },
              'events',
              { Ref: 'AWS::Region' },
              { Ref: 'AWS::AccountId' },
              {
                'Fn::Join': ['/', ['rule', ...ruleNameArnPath]],
              },
            ],
          ],
        },
      },
    }

    compiledCloudFormationTemplate.Resources[
      this.provider.naming.getEventBridgeLambdaPermissionLogicalId(
        functionName,
        idx,
      )
    ] = lambdaPermissionResource
  }

  _addCustomResourceToService({ iamRoleStatements: _iamRoleStatements }) {
    const iamRoleStatements = _iamRoleStatements
    const ruleResources = {
      'Fn::Join': [
        ':',
        [
          'arn',
          { Ref: 'AWS::Partition' },
          'events',
          { Ref: 'AWS::Region' },
          { Ref: 'AWS::AccountId' },
          'rule/*',
        ],
      ],
    }
    iamRoleStatements.push({
      Effect: 'Allow',
      Resource: ruleResources,
      Action: [
        'events:PutRule',
        'events:RemoveTargets',
        'events:PutTargets',
        'events:DeleteRule',
      ],
    })
    const functionResources = {
      'Fn::Join': [
        ':',
        [
          'arn',
          { Ref: 'AWS::Partition' },
          'lambda',
          { Ref: 'AWS::Region' },
          { Ref: 'AWS::AccountId' },
          'function',
          '*',
        ],
      ],
    }
    iamRoleStatements.push({
      Effect: 'Allow',
      Resource: functionResources,
      Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
    })

    if (iamRoleStatements.length) {
      return addCustomResourceToService(
        this.provider,
        'eventBridge',
        iamRoleStatements,
      )
    }
    return null
  }

  configureTarget({
    target,
    Input,
    InputPath,
    InputTransformer,
    RetryPolicy,
    DeadLetterConfig,
  }) {
    if (RetryPolicy) {
      target = Object.assign(target, {
        RetryPolicy,
      })
    }

    if (DeadLetterConfig) {
      target = Object.assign(target, {
        DeadLetterConfig,
      })
    }

    if (Input) {
      target = Object.assign(target, {
        Input: JSON.stringify(Input),
      })
      return target
    }
    if (InputPath) {
      target = Object.assign(target, {
        InputPath,
      })
      return target
    }
    if (InputTransformer) {
      target = Object.assign(target, {
        InputTransformer,
      })
      return target
    }

    return target
  }
}

export default AwsCompileEventBridgeEvents
