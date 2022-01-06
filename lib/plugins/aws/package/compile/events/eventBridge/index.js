'use strict';

const _ = require('lodash');
const { addCustomResourceToService } = require('../../../../customResources');
const ServerlessError = require('../../../../../../serverless-error');
const { makeAndHashRuleName, makeEventBusTargetId, makeRuleName } = require('./utils');

class AwsCompileEventBridgeEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'initialize': () => {
        if (_.get(this.serverless.service.provider, 'eventBridge.useCloudFormation') == null) {
          const hasFunctionsWithEventBridgeTrigger = Object.values(
            this.serverless.service.functions
          ).some(({ events }) => events.some(({ eventBridge }) => eventBridge));
          if (hasFunctionsWithEventBridgeTrigger) {
            this.serverless._logDeprecation(
              'AWS_EVENT_BRIDGE_CUSTOM_RESOURCE',
              'Starting with "v3.0.0", AWS EventBridge resources will be created using native CloudFormation resources by default. It is possible to use that functionality now by setting "eventBridge.useCloudFormation: true" as provider property in your configuration. If you want to keep using the old creation method, set that property to "false" to hide this deprecation message.'
            );
          }
        }
      },
      'package:compileEvents': this.compileEventBridgeEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'eventBridge', {
      type: 'object',
      properties: {
        eventBus: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { $ref: '#/definitions/awsArnString' },
            { $ref: '#/definitions/awsCfImport' },
            { $ref: '#/definitions/awsCfRef' },
            // GetAtt should only reference "Name" property of EventBus
            {
              type: 'object',
              properties: {
                'Fn::GetAtt': {
                  type: 'array',
                  minItems: 2,
                  maxItems: 2,
                  items: [
                    { type: 'string', minLength: 1 },
                    { type: 'string', enum: ['Name'] },
                  ],
                },
              },
              required: ['Fn::GetAtt'],
              additionalProperties: false,
            },
          ],
        },
        schedule: { pattern: '^(?:cron|rate)\\(.+\\)$', type: 'string' },
        enabled: { type: 'boolean' },
        pattern: {
          type: 'object',
          properties: {
            'version': {},
            'id': {},
            'detail-type': {},
            'source': {},
            'account': {},
            'time': {},
            'region': {},
            'resources': {},
            'detail': {},
          },
          additionalProperties: false,
        },
        input: { type: 'object' },
        inputPath: { type: 'string', minLength: 1, maxLength: 256 },
        inputTransformer: {
          type: 'object',
          properties: {
            inputPathsMap: {
              type: 'object',
              additionalProperties: { type: 'string', minLength: 1 },
            },
            inputTemplate: { type: 'string', minLength: 1, maxLength: 8192 },
          },
          required: ['inputTemplate'],
          additionalProperties: false,
        },
        retryPolicy: {
          type: 'object',
          properties: {
            maximumEventAge: {
              type: 'integer',
              minimum: 60,
              maximum: 86400,
            },
            maximumRetryAttempts: {
              type: 'integer',
              minimum: 0,
              maximum: 185,
            },
          },
        },
        deadLetterQueueArn: { $ref: '#/definitions/awsArn' },
      },
      anyOf: [{ required: ['pattern'] }, { required: ['schedule'] }],
    });
  }

  compileEventBridgeEvents() {
    const { service } = this.serverless;
    const { provider } = service;
    const { compiledCloudFormationTemplate } = provider;
    const iamRoleStatements = [];
    const { eventBridge: options } = provider;
    const shouldUseCloudFormation = options ? options.useCloudFormation : false;
    let hasEventBusesIamRoleStatement = false;
    let anyFuncUsesEventBridge = false;

    service.getAllFunctions().forEach((functionName) => {
      const functionObj = service.getFunction(functionName);
      const FunctionName = functionObj.name;

      if (functionObj.events) {
        functionObj.events.forEach((event, idx) => {
          if (event.eventBridge) {
            idx++;
            anyFuncUsesEventBridge = true;
            const EventBus = event.eventBridge.eventBus;
            const Schedule = event.eventBridge.schedule;
            const Pattern = event.eventBridge.pattern;
            const Input = event.eventBridge.input;
            const InputPath = event.eventBridge.inputPath;
            let InputTransformer = event.eventBridge.inputTransformer;
            let RetryPolicy = event.eventBridge.retryPolicy;
            let DeadLetterConfig;

            const RuleName = makeAndHashRuleName({
              functionName: FunctionName,
              index: idx,
            });

            let State = 'ENABLED';
            if (event.eventBridge.enabled === false) {
              State = 'DISABLED';
            }

            if ([Input, InputPath, InputTransformer].filter(Boolean).length > 1) {
              throw new ServerlessError(
                [
                  'You can only set one of input, inputPath, or inputTransformer ',
                  'properties for eventBridge events.',
                ].join(''),
                'EVENTBRIDGE_MULTIPLE_INPUT_PROPERTIES'
              );
            }

            if (InputTransformer) {
              InputTransformer = _.mapKeys(
                InputTransformer,
                (value, key) => key[0].toLocaleUpperCase() + key.slice(1)
              );
            }

            if (RetryPolicy) {
              if (!shouldUseCloudFormation) {
                throw new ServerlessError(
                  'Configuring RetryPolicy is not supported for EventBridge integration backed by Custom Resources. Please use "provider.eventBridge.useCloudFormation" setting to use native CloudFormation support for EventBridge.',
                  'ERROR_INVALID_RETRY_POLICY_TO_EVENT_BUS_CUSTOM_RESOURCE'
                );
              }

              RetryPolicy = {
                MaximumEventAgeInSeconds: RetryPolicy.maximumEventAge,
                MaximumRetryAttempts: RetryPolicy.maximumRetryAttempts,
              };
            }

            if (event.eventBridge.deadLetterQueueArn) {
              if (!shouldUseCloudFormation) {
                throw new ServerlessError(
                  'Configuring DeadLetterConfig is not supported for EventBridge integration backed by Custom Resources. Please use "provider.eventBridge.useCloudFormation" setting to use native CloudFormation support for EventBridge.',
                  'ERROR_INVALID_DEAD_LETTER_CONFIG_TO_EVENT_BUS_CUSTOM_RESOURCE'
                );
              }
              DeadLetterConfig = {
                Arn: event.eventBridge.deadLetterQueueArn,
              };
            }

            const eventBusName = EventBus;
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
              });

              results.iamRoleStatements.forEach((statement) => iamRoleStatements.push(statement));
              hasEventBusesIamRoleStatement = results.hasEventBusesIamRoleStatement;
            } else {
              this.compileWithCloudFormation({
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
                RetryPolicy,
                DeadLetterConfig,
              });
            }
          }
        });
      }
    });

    // These permissions are for the custom resource lambda
    if (!shouldUseCloudFormation && anyFuncUsesEventBridge) {
      return this._addCustomResourceToService({ iamRoleStatements });
    }
    return null;
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
        'ERROR_INVALID_REFERENCE_TO_EVENT_BUS_CUSTOM_RESOURCE'
      );
    }

    const iamRoleStatements = [];

    if (typeof eventBusName === 'string' && eventBusName.startsWith('arn')) {
      eventBusName = EventBus.slice(EventBus.indexOf('/') + 1);
    }

    const eventFunctionLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
    const customResourceFunctionLogicalId =
      this.provider.naming.getCustomResourceEventBridgeHandlerFunctionLogicalId();
    const customEventBridgeResourceLogicalId =
      this.provider.naming.getCustomResourceEventBridgeResourceLogicalId(functionName, idx);

    const customEventBridge = {
      Type: 'Custom::EventBridge',
      Version: 1.0,
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
    };

    compiledCloudFormationTemplate.Resources[customEventBridgeResourceLogicalId] =
      customEventBridge;

    if (!hasEventBusesIamRoleStatement && eventBusName && eventBusName !== 'default') {
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
      });
      hasEventBusesIamRoleStatement = true;
    }
    return {
      iamRoleStatements,
      hasEventBusesIamRoleStatement,
    };
  }

  compileWithCloudFormation({
    eventBusName: _eventBusName,
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
    let eventBusResource;
    let eventBusExists = false;
    let eventBusName = _eventBusName;

    // It suggests that the object already exists and is being imported
    if (_.isObject(eventBusName)) {
      eventBusExists = true;
    }

    // Does the resource already exist? ARN string - assume it is valid - CF will validate ultimately
    if (typeof eventBusName === 'string' && eventBusName.startsWith('arn')) {
      eventBusExists = true;
      eventBusName = EventBus.slice(EventBus.indexOf('/') + 1);
    }

    const shouldCreateEventBus = !eventBusExists && eventBusName && eventBusName !== 'default';
    if (shouldCreateEventBus) {
      // Create EventBus Resource
      eventBusResource = {
        Type: 'AWS::Events::EventBus',
        Properties: {
          Name: eventBusName,
        },
      };

      compiledCloudFormationTemplate.Resources[
        this.provider.naming.getEventBridgeEventBusLogicalId(eventBusName)
      ] = eventBusResource;
    }

    const targetBase = {
      Arn: {
        'Fn::GetAtt': [this.provider.naming.getLambdaLogicalId(functionName), 'Arn'],
      },
      Id: makeEventBusTargetId(RuleName),
    };

    const target = this.configureTarget({
      target: targetBase,
      Input,
      InputPath,
      InputTransformer,
      RetryPolicy,
      DeadLetterConfig,
    });

    // Create a rule
    const eventRuleResource = {
      Type: 'AWS::Events::Rule',
      Properties: {
        // default event bus is used when EventBusName is not set
        EventBusName: eventBusName === 'default' ? undefined : eventBusName,
        EventPattern: Pattern,
        Name: RuleName,
        ScheduleExpression: Schedule,
        State,
        Targets: [target],
      },
    };
    // If this stack is creating the event bus the rule must depend on it to ensure stack can be removed
    if (shouldCreateEventBus) {
      eventRuleResource.DependsOn =
        this.provider.naming.getEventBridgeEventBusLogicalId(eventBusName);
    }

    const ruleNameLogicalIdStub = makeRuleName({
      functionName: FunctionName,
      index: idx,
    });

    compiledCloudFormationTemplate.Resources[
      this.provider.naming.getEventBridgeRuleLogicalId(ruleNameLogicalIdStub)
    ] = eventRuleResource;

    const ruleNameArnPath = eventBusName ? [eventBusName, RuleName] : [RuleName];
    const lambdaPermissionResource = {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: {
          Ref: this.provider.naming.getLambdaLogicalId(functionName),
        },
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
    };

    compiledCloudFormationTemplate.Resources[
      this.provider.naming.getEventBridgeLambdaPermissionLogicalId(functionName, idx)
    ] = lambdaPermissionResource;
  }

  _addCustomResourceToService({ iamRoleStatements: _iamRoleStatements }) {
    const iamRoleStatements = _iamRoleStatements;
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
    };
    iamRoleStatements.push({
      Effect: 'Allow',
      Resource: ruleResources,
      Action: ['events:PutRule', 'events:RemoveTargets', 'events:PutTargets', 'events:DeleteRule'],
    });
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
    };
    iamRoleStatements.push({
      Effect: 'Allow',
      Resource: functionResources,
      Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
    });

    if (iamRoleStatements.length) {
      return addCustomResourceToService(this.provider, 'eventBridge', iamRoleStatements);
    }
    return null;
  }

  configureTarget({ target, Input, InputPath, InputTransformer, RetryPolicy, DeadLetterConfig }) {
    if (RetryPolicy) {
      target = Object.assign(target, {
        RetryPolicy,
      });
    }

    if (DeadLetterConfig) {
      target = Object.assign(target, {
        DeadLetterConfig,
      });
    }

    if (Input) {
      target = Object.assign(target, {
        Input: JSON.stringify(Input),
      });
      return target;
    }
    if (InputPath) {
      target = Object.assign(target, {
        InputPath,
      });
      return target;
    }
    if (InputTransformer) {
      target = Object.assign(target, {
        InputTransformer,
      });
      return target;
    }

    return target;
  }
}

module.exports = AwsCompileEventBridgeEvents;
