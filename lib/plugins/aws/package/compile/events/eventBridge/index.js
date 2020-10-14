'use strict';

const _ = require('lodash');
const { addCustomResourceToService } = require('../../../../customResources');
const ServerlessError = require('../../../../../../serverless-error');
const { isCFFunc, makeAndHashRuleName, makeEventBusTargetId, makeRuleName } = require('./helpers');

class AwsCompileEventBridgeEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileEventBridgeEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'eventBridge', {
      type: 'object',
      properties: {
        eventBus: { type: 'string', minLength: 1 },
        schedule: { pattern: '^(?:cron|rate)\\(.+\\)$' },
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
      },
      anyOf: [{ required: ['pattern'] }, { required: ['schedule'] }],
    });
  }

  compileEventBridgeEvents() {
    const { service } = this.serverless;
    const { provider } = service;
    const { compiledCloudFormationTemplate } = provider;
    const iamRoleStatements = [];
    let hasEventBusesIamRoleStatement = false;
    let anyFuncUsesEventBridge = false;
    let useCustomResources = false;

    service.getAllFunctions().forEach((functionName) => {
      const functionObj = service.getFunction(functionName);
      const FunctionName = functionObj.name;
      // Track persmissions against eventBus name
      const lambdaPermissionsByEventBusName = {};

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
            const RuleName = makeAndHashRuleName({
              functionName: FunctionName,
              index: idx,
            });
            const useNativeCloudFormation = event.eventBridge.useNativeCloudFormation;

            if ([Input, InputPath, InputTransformer].filter(Boolean).length > 1) {
              throw new ServerlessError(
                [
                  'You can only set one of input, inputPath, or inputTransformer ',
                  'properties for eventBridge events.',
                ].join('')
              );
            }

            if (InputTransformer) {
              InputTransformer = _.mapKeys(
                InputTransformer,
                (index, key) => key[0].toLocaleUpperCase() + key.slice(1)
              );
            }

            let eventBusName = EventBus;
            // Custom resources will be deprecated in next major release
            if (!useNativeCloudFormation) {
              this.serverless._logDeprecation(
                'AWS_EVENT_BRIDGE_CUSTOM_RESOURCE',
                'AWS EventBridge resources were not created using native CloudFormation, this is now possible and the use of custom resources is deprecated. Set `useNativeCloudFormation: true` in the EventBridge event definition to use this now. Transition between custom resources and CloudFormation will require the manual import of some resources.'
              );

              useCustomResources = true;
              if (typeof eventBusName === 'string' && eventBusName.startsWith('arn')) {
                eventBusName = EventBus.slice(EventBus.indexOf('/') + 1);
              }

              const eventFunctionLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
              const customResourceFunctionLogicalId = this.provider.naming.getCustomResourceEventBridgeHandlerFunctionLogicalId();
              const customEventBridgeResourceLogicalId = this.provider.naming.getCustomResourceEventBridgeResourceLogicalId(
                functionName,
                idx
              );

              const customEventBridge = {
                [customEventBridgeResourceLogicalId]: {
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
                      EventBus,
                      Schedule,
                      Pattern,
                      Input,
                      InputPath,
                      InputTransformer,
                    },
                  },
                },
              };

              _.merge(compiledCloudFormationTemplate.Resources, customEventBridge);

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
            } else {
              let eventBusResource;
              let eventBusExists = false;

              // Does the resource already exist? - CF Func
              if (isCFFunc(eventBusName)) {
                eventBusExists = true;
              }

              // Does the resource already exist? - arn string - just assume it is valid - CF will validate ultimately
              // It might be an arn - HANDLED
              // TODO: it might just be a name of an eventBus - need to check if it is in the template alredy
              if (typeof eventBusName === 'string' && eventBusName.startsWith('arn')) {
                eventBusExists = true;
                eventBusName = EventBus.slice(EventBus.indexOf('/') + 1);
                console.log('Event bus name when arn string: ', eventBusName);
              }

              if (!eventBusExists && eventBusName && eventBusName !== 'default') {
                // Create EventBus Resource
                eventBusResource = {
                  Type: 'AWS::Events::EventBus',
                  Properties: {
                    Name: eventBusName,
                  },
                };

                _.merge(compiledCloudFormationTemplate.Resources, {
                  [this.provider.naming.getEventBridgeEventBusLogicalId(
                    eventBusName
                  )]: eventBusResource,
                });
              }

              let target = {
                Arn: {
                  'Fn::GetAtt': [this.provider.naming.getLambdaLogicalId(functionName), 'Arn'],
                },
                Id: makeEventBusTargetId(RuleName),
              };

              if (Input) {
                target = Object.assign(target, {
                  Input: JSON.stringify(Input),
                });
              } else if (InputPath) {
                target = Object.assign(target, {
                  InputPath,
                });
              } else if (InputTransformer) {
                target = Object.assign(target, {
                  InputTransformer,
                });
              }

              // eventBusName may be a CF func object or a string - stringify for object key
              if (!lambdaPermissionsByEventBusName[JSON.stringify(eventBusName)]) {
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
                            'Fn::Join': ['/', ['event-bus', eventBusName || 'default']],
                          },
                        ],
                      ],
                    },
                  },
                };

                _.merge(compiledCloudFormationTemplate.Resources, {
                  [this.provider.naming.getEventBridgeLambdaPermissionLogicalId(
                    functionName,
                    idx
                  )]: lambdaPermissionResource,
                });

                // Track what lambda permissions have been added - the same event bus may be being used for multiple event triggers
                lambdaPermissionsByEventBusName[JSON.stringify(eventBusName)] = true;
              }

              // Create a rule
              const eventRuleResource = {
                Type: 'AWS::Events::Rule',
                Properties: {
                  // default event bus is used when EventBusName is not set
                  EventBusName: eventBusName === 'default' ? undefined : eventBusName,
                  EventPattern: JSON.stringify(Pattern),
                  Name: RuleName,
                  ScheduleExpression: Schedule,
                  State: 'ENABLED',
                  Targets: [target],
                },
              };

              const ruleNameLogicalIdStub = makeRuleName({
                functionName: FunctionName,
                index: idx,
              });
              _.merge(compiledCloudFormationTemplate.Resources, {
                [this.provider.naming.getEventBridgeRuleLogicalId(
                  ruleNameLogicalIdStub
                )]: eventRuleResource,
              });
              console.log(JSON.stringify(compiledCloudFormationTemplate));
            }
          }
        });
      }
    });

    // These permissions are for the custom resource lambda
    // The use should ensure the IAM role the serverless framework use has these when using native CloudFormation
    if (useCustomResources && anyFuncUsesEventBridge) {
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
        Action: [
          'events:PutRule',
          'events:RemoveTargets',
          'events:PutTargets',
          'events:DeleteRule',
        ],
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
    }

    return null;
  }
}

module.exports = AwsCompileEventBridgeEvents;
