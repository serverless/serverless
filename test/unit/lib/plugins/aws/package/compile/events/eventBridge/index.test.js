'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const runServerless = require('../../../../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

const NAME_OVER_64_CHARS = 'oneVeryLongAndVeryStrangeAndVeryComplicatedFunctionNameOver64Chars';

const serverlessConfigurationExtension = {
  functions: {
    default: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'arn:aws:events:us-east-1:12345:event-bus/default',
            schedule: 'rate(10 minutes)',
          },
        },
      ],
    },
    [NAME_OVER_64_CHARS]: {
      handler: 'index.handler',
      name: 'one-very-long-and-very-strange-and-very-complicated-function-name-over-64-chars',
      events: [
        {
          eventBridge: {
            schedule: 'rate(10 minutes)',
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
          },
        },
      ],
    },
    configureInput: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'arn:aws:events:us-east-1:12345:event-bus/some-event-bus',
            schedule: 'rate(10 minutes)',
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
            input: {
              key1: 'value1',
              key2: {
                nested: 'value2',
              },
            },
          },
        },
      ],
    },
    inputPathConfiguration: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
            inputPath: '$.stageVariables',
          },
        },
      ],
    },
    inputTransformer: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
            inputTransformer: {
              inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
              inputPathsMap: {
                eventTime: '$.time',
              },
            },
          },
        },
      ],
    },
    customSaas: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'custom-saas-events',
            pattern: {
              detail: {
                eventSource: ['saas.external'],
              },
            },
            inputTransformer: {
              inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
              inputPathsMap: {
                eventTime: '$.time',
              },
            },
          },
        },
      ],
    },
    disabled: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'arn:aws:events:us-east-1:12345:event-bus/default',
            schedule: 'rate(10 minutes)',
            enabled: false,
          },
        },
      ],
    },
    enabled: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'arn:aws:events:us-east-1:12345:event-bus/default',
            schedule: 'rate(10 minutes)',
            enabled: true,
          },
        },
      ],
    },
  },
};

describe('EventBridgeEvents', () => {
  describe('using custom resources deployment pattern', () => {
    let cfResources;
    let naming;

    before(async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        configExt: {
          ...serverlessConfigurationExtension,
          disabledDeprecations: ['AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN'],
          provider: {
            eventBridge: {
              useCloudFormation: false,
            },
          },
        },
        command: 'package',
      });
      cfResources = cfTemplate.Resources;
      naming = awsNaming;
    });

    function getEventBridgeConfigById(resourceLogicalId) {
      const eventBridgeId = naming.getCustomResourceEventBridgeResourceLogicalId(
        resourceLogicalId,
        1
      );
      return cfResources[eventBridgeId].Properties.EventBridgeConfig;
    }

    it('should create the correct policy Statement', () => {
      const roleId = naming.getCustomResourcesRoleLogicalId('default', '12345');

      const [firstStatement, secondStatement, thirdStatment] =
        cfResources[roleId].Properties.Policies[0].PolicyDocument.Statement;
      expect(firstStatement.Effect).to.be.eq('Allow');
      expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('arn');
      expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('events');
      expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('event-bus/*');
      expect(firstStatement.Action).to.be.deep.eq([
        'events:CreateEventBus',
        'events:DeleteEventBus',
      ]);

      expect(secondStatement.Effect).to.be.eq('Allow');
      expect(secondStatement.Resource['Fn::Join'][1]).to.deep.include('events');
      expect(secondStatement.Resource['Fn::Join'][1]).to.deep.include('rule/*');
      expect(secondStatement.Action).to.be.deep.eq([
        'events:PutRule',
        'events:RemoveTargets',
        'events:PutTargets',
        'events:DeleteRule',
      ]);

      expect(thirdStatment.Effect).to.be.eq('Allow');
      expect(thirdStatment.Resource['Fn::Join'][1]).to.deep.include('function');
      expect(thirdStatment.Resource['Fn::Join'][1]).to.deep.include('lambda');
      expect(thirdStatment.Action).to.be.deep.eq([
        'lambda:AddPermission',
        'lambda:RemovePermission',
      ]);
    });
    it('should create the necessary resource', () => {
      const eventBridgeConfig = getEventBridgeConfigById('default');
      expect(eventBridgeConfig.RuleName).to.include('dev-default-rule-1');
    });

    it('should ensure state is enabled by default', () => {
      const eventBridgeConfig = getEventBridgeConfigById('default');
      expect(eventBridgeConfig.State).to.be.eq('ENABLED');
    });

    it('should ensure state is enabled when explicity set', () => {
      const eventBridgeConfig = getEventBridgeConfigById('enabled');
      expect(eventBridgeConfig.State).to.be.eq('ENABLED');
    });

    it('should ensure state is disabled when explicity set', () => {
      const eventBridgeConfig = getEventBridgeConfigById('disabled');
      expect(eventBridgeConfig.State).to.be.eq('DISABLED');
    });

    it("should ensure rule name doesn't exceed 64 chars", () => {
      const eventBridgeConfig = getEventBridgeConfigById(NAME_OVER_64_CHARS);
      expect(eventBridgeConfig.RuleName.endsWith('rule-1')).to.be.true;
      expect(eventBridgeConfig.RuleName).lengthOf.lte(64);
    });

    it('should support input configuration', () => {
      const eventBridgeConfig = getEventBridgeConfigById('configureInput');
      expect(eventBridgeConfig.Input.key1).be.eq('value1');
      expect(eventBridgeConfig.Input.key2).be.deep.eq({
        nested: 'value2',
      });
    });

    it('should support arn at eventBus', () => {
      const eventBridgeConfig = getEventBridgeConfigById('configureInput');
      expect(eventBridgeConfig.EventBus).be.eq(
        'arn:aws:events:us-east-1:12345:event-bus/some-event-bus'
      );
    });
    it('should support inputPath configuration', () => {
      const eventBridgeConfig = getEventBridgeConfigById('inputPathConfiguration');
      expect(eventBridgeConfig.InputPath).be.eq('$.stageVariables');
    });

    it('should support inputTransformer configuration', () => {
      const eventBridgeConfig = getEventBridgeConfigById('inputTransformer');
      const {
        InputTemplate,
        InputPathsMap: { eventTime },
      } = eventBridgeConfig.InputTransformer;
      expect(InputTemplate).be.eq('{"time": <eventTime>, "key1": "value1"}');
      expect(eventTime).be.eq('$.time');
    });

    it('should register created and delete event bus permissions for non default event bus', () => {
      const roleId = naming.getCustomResourcesRoleLogicalId('customSaas', '12345');
      const [firstStatement] = cfResources[roleId].Properties.Policies[0].PolicyDocument.Statement;
      expect(firstStatement.Action[0]).to.be.eq('events:CreateEventBus');
      expect(firstStatement.Action[1]).to.be.eq('events:DeleteEventBus');
      expect(firstStatement.Effect).to.be.eq('Allow');
    });

    it('should fail when trying to set RetryPolicy', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          configExt: {
            disabledDeprecations: ['AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN'],
            provider: {
              eventBridge: {
                useCloudFormation: false,
              },
            },
            functions: {
              basic: {
                events: [
                  {
                    eventBridge: {
                      retryPolicy: {
                        maximumEventAge: 4200,
                        maximumRetryAttempts: 180,
                      },
                      pattern: {
                        source: ['aws.something'],
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ERROR_INVALID_RETRY_POLICY_TO_EVENT_BUS_CUSTOM_RESOURCE'
      );
    });

    it('should fail when trying to set DeadLetterQueueArn', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          configExt: {
            disabledDeprecations: ['AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN'],
            provider: {
              eventBridge: {
                useCloudFormation: false,
              },
            },
            functions: {
              basic: {
                events: [
                  {
                    eventBridge: {
                      deadLetterQueueArn: {
                        'Fn::GetAtt': ['not-supported', 'Arn'],
                      },
                      pattern: {
                        source: ['aws.something'],
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ERROR_INVALID_DEAD_LETTER_CONFIG_TO_EVENT_BUS_CUSTOM_RESOURCE'
      );
    });

    it('should fail when trying to reference event bus via CF intrinsic function', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          configExt: {
            disabledDeprecations: ['AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN'],
            provider: {
              eventBridge: {
                useCloudFormation: false,
              },
            },
            functions: {
              basic: {
                events: [
                  {
                    eventBridge: {
                      eventBus: { Ref: 'ImportedEventBus' },
                      schedule: 'rate(10 minutes)',
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ERROR_INVALID_REFERENCE_TO_EVENT_BUS_CUSTOM_RESOURCE'
      );
    });
  });

  describe('using native CloudFormation', () => {
    describe('when event bus is created as a part of the stack', () => {
      let cfResources;
      let naming;
      let eventBusLogicalId;
      let ruleResource;
      let ruleTarget;
      const schedule = 'rate(10 minutes)';
      const eventBusName = 'nondefault';
      const pattern = {
        source: ['aws.cloudformation'],
      };
      const input = {
        key1: 'value1',
        key2: {
          nested: 'value2',
        },
      };
      const inputPath = '$.stageVariables';
      const inputTransformer = {
        inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        inputPathsMap: {
          eventTime: '$.time',
        },
      };
      const retryPolicy = {
        maximumEventAge: 7200,
        maximumRetryAttempts: 9,
      };

      const deadLetterQueueArn = {
        'Fn::GetAtt': ['test', 'Arn'],
      };

      const getRuleResourceEndingWith = (resources, ending) =>
        Object.values(resources).find(
          (resource) =>
            resource.Type === 'AWS::Events::Rule' && resource.Properties.Name.endsWith(ending)
        );

      before(async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          configExt: {
            functions: {
              basic: {
                events: [
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      input,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      inputPath,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      inputTransformer,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      enabled: false,
                      pattern,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      enabled: true,
                      pattern,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      retryPolicy,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      deadLetterQueueArn,
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
        eventBusLogicalId = naming.getEventBridgeEventBusLogicalId(eventBusName);
        ruleResource = getRuleResourceEndingWith(cfResources, '1');
        ruleTarget = ruleResource.Properties.Targets[0];
      });

      it('should create an EventBus resource', () => {
        expect(cfResources[eventBusLogicalId].Properties).to.deep.equal({ Name: eventBusName });
      });

      it('should correctly set ScheduleExpression on a created rule', () => {
        expect(ruleResource.Properties.ScheduleExpression).to.equal('rate(10 minutes)');
      });

      it('should correctly set State by default on a created rule', () => {
        expect(ruleResource.Properties.State).to.equal('ENABLED');
      });

      it('should correctly set State when disabled on a created rule', () => {
        const disabledRuleResource = getRuleResourceEndingWith(cfResources, '4');
        expect(disabledRuleResource.Properties.State).to.equal('DISABLED');
      });

      it('should correctly set State when enabled on a created rule', () => {
        const enabledRuleResource = getRuleResourceEndingWith(cfResources, '5');
        expect(enabledRuleResource.Properties.State).to.equal('ENABLED');
      });

      it('should correctly set EventPattern on a created rule', () => {
        expect(ruleResource.Properties.EventPattern).to.deep.equal(pattern);
      });

      it('should correctly set Input on the target for the created rule', () => {
        expect(ruleTarget.Input).to.deep.equal(JSON.stringify(input));
      });

      it('should correctly set InputPath on the target for the created rule', () => {
        const inputPathRuleResource = getRuleResourceEndingWith(cfResources, '2');
        const inputPathRuleTarget = inputPathRuleResource.Properties.Targets[0];
        expect(inputPathRuleTarget.InputPath).to.deep.equal(inputPath);
      });

      it('should correctly set InputTransformer on the target for the created rule', () => {
        const inputTransformerRuleResource = getRuleResourceEndingWith(cfResources, '3');
        const inputTransformerRuleTarget = inputTransformerRuleResource.Properties.Targets[0];
        expect(inputTransformerRuleTarget.InputTransformer.InputPathsMap).to.deep.equal(
          inputTransformer.inputPathsMap
        );
        expect(inputTransformerRuleTarget.InputTransformer.InputTemplate).to.deep.equal(
          inputTransformer.inputTemplate
        );
      });

      it('should support retryPolicy configuration', () => {
        const retryPolicyRuleTarget = getRuleResourceEndingWith(cfResources, '6').Properties
          .Targets[0];
        expect(retryPolicyRuleTarget.RetryPolicy).to.deep.equal({
          MaximumEventAgeInSeconds: 7200,
          MaximumRetryAttempts: 9,
        });
      });

      it('should support deadLetterQueueArn configuration', () => {
        const deadLetterConfigRuleTarget = getRuleResourceEndingWith(cfResources, '7').Properties
          .Targets[0];
        expect(deadLetterConfigRuleTarget.DeadLetterConfig).to.have.property('Arn');
      });

      it('should create a rule that depends on created EventBus', () => {
        expect(ruleResource.DependsOn).to.equal(eventBusLogicalId);
      });

      it('should create a rule that references correct function in target', () => {
        expect(ruleTarget.Arn['Fn::GetAtt'][0]).to.equal(naming.getLambdaLogicalId('basic'));
      });

      it('should create a lambda permission resource that correctly references event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('basic', 1)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.deep.equal(eventBusName);
      });
    });

    describe('when it references already existing EventBus or uses default one', () => {
      let cfResources;
      let naming;

      before(async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              basic: {
                events: [
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                      eventBus: 'arn:xxxxx',
                    },
                  },
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                      eventBus: { Ref: 'ImportedEventBus' },
                    },
                  },
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                      eventBus: 'default',
                    },
                  },
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                    },
                  },
                ],
              },
            },
          },
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
      });

      it('should not create an EventBus if it is provided or default', async () => {
        expect(Object.values(cfResources).some((value) => value.Type === 'AWS::Events::EventBus'))
          .to.be.false;
      });

      it('should create a lambda permission resource that correctly references arn event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('basic', 1)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.deep.equal('arn:xxxxx');
      });

      it('should create a lambda permission resource that correctly references CF event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('basic', 2)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.deep.equal({ Ref: 'ImportedEventBus' });
      });

      it('should create a lambda permission resource that correctly references explicit default event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('basic', 3)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.equal('default');
      });

      it('should create a lambda permission resource that correctly references implicit default event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('basic', 4)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1]
        ).not.to.include('default');
      });
    });
  });

  it('should trigger deprecation when `useCloudFormation` is set without any `eventBridge` events', async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          provider: {
            eventBridge: {
              useCloudFormation: true,
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property(
      'code',
      'REJECTED_DEPRECATION_AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN'
    );
  });
});
