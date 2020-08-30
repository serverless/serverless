'use strict';

const _ = require('lodash');
const crypto = require('crypto');
const { addCustomResourceToService } = require('../../../../customResources');
const ServerlessError = require('../../../../../../serverless-error');

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
                (_, key) => key[0].toLocaleUpperCase() + key.slice(1)
              );
            }

            let eventBusName = EventBus;
            if (!useNativeCloudFormation) {
              // TODO: Output deprecation log
              useCustomResources = true;
              if (typeof eventBusName === 'string' && eventBusName.startsWith('arn')) {
                eventBusName = EventBus.slice(EventBus.indexOf('/') + 1);
              }

              const eventFunctionLogicalId = this.provider.naming.getLambdaLogicalId(FunctionName);
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
              // TODO - expect CF func or name
              // TODO - use Fn::Join with value of eventBus to compose arns/resources etc.
              // If CF func extrat the logical resource ID from func
              // If not CF func assume it is a plain text eventBus name to be created
              // Keep track of bus names so that we only create the eventBus once - us CF func to get value if already being created - add DependsOn when appropriate

              let eventBusResource;
              let eventBusExists = false;

              // Does the resource already exist?
              if (
                isCFFunc(eventBusName) ||
                (typeof eventBusName === 'string' &&
                  compiledCloudFormationTemplate[
                    this.provider.naming.getEventBridgeEventBusLogicalId(eventBusName)
                  ])
              ) {
                eventBusExists = true;
              }

              // Create EventBus Resource
              if (!eventBusExists && eventBusName && eventBusName !== 'default') {
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
                  // TODO: This should be the logicalId for a lambdaPermission - cannot use eventBusName here as it may CF func object
                  // TODO: This is failing tests - need to sort the name out!!
                  // Lambda permission unique to the lambda and the eventBus <- logical id must reflect this
                  // Use name if string or extract logical Id if CF func?
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
            }
          }
        });
      }
    });

    // These permissions are for the custom resource lambda
    // The use should ensure the IAM role the serverless framework use has these when using native CloudFormation
    if (useCustomResources) {
      if (anyFuncUsesEventBridge) {
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
      }

      if (iamRoleStatements.length) {
        return addCustomResourceToService(this.provider, 'eventBridge', iamRoleStatements);
      }
    }

    return null;
  }
}

const makeAndHashRuleName = ({ functionName, index }) => {
  const name = makeRuleName({ functionName, index });
  if (name.length > 64) {
    // Rule names cannot be longer than 64.
    // Temporary solution until we have https://github.com/serverless/serverless/issues/6598
    return hashName(name, makeRuleNameSuffix(index));
  }
  return name;
};

const makeRuleName = ({ functionName, index }) => `${functionName}-${makeRuleNameSuffix(index)}`;

const makeRuleNameSuffix = index => `rule-${index}`;

const makeEventBusTargetId = ruleName => {
  const suffix = 'target';
  let targetId = `${ruleName}-${suffix}`;
  if (targetId.length > 64) {
    // Target ids cannot be longer than 64.
    targetId = hashName(targetId, suffix);
  }
  return targetId;
};

const hashName = (name, suffix) =>
  `${name.slice(0, 31 - suffix.length)}${crypto
    .createHash('md5')
    .update(name)
    .digest('hex')}-${suffix}`;

const isCFFunc = data => {
  if (typeof data !== 'object') {
    return false;
  }
  const keys = Object.keys(data);
  if (keys.length !== 1) {
    return false;
  }
  const cfFuncs = ['Fn::GetAtt', 'Fn::ImportValue', 'Fn::Ref'];
  if (!cfFuncs.includes(keys[0])) {
    return false;
  }
  return true;
};

// Possible paths
// `useCF` property is not set - fork to old code
// `useCF` is set to true - follow below pathways
// No eventBus set in config = use default event bus -> no name set on rule
// TODO: Don't care about arn strings? eventBus is set as arn string = manually compose arn and name when required - use custom resource
// eventBus is set as a CF Func = validate CF Func -> extract logicalId from func and use in of CF Resources
// eventBus is set but not an arn string or CF Func = use plain CloudFormation -> use value of eventBridge as EventBus name

module.exports = AwsCompileEventBridgeEvents;
