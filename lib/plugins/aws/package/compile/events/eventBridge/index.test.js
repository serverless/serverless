'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const runServerless = require('../../../../../../../test/utils/run-serverless');

const { expect } = chai;

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
  },
};

describe('EventBridgeEvents', () => {
  let cfResources;
  let naming;

  before(() =>
    runServerless({
      fixture: 'function',
      configExt: serverlessConfigurationExtension,
      cliArgs: ['package'],
    }).then(({ cfTemplate, awsNaming }) => {
      ({ Resources: cfResources } = cfTemplate);
      naming = awsNaming;
    })
  );

  /**
   *
   * @param {String} id
   */
  function getEventBridgeConfigById(resourceLogicalId) {
    const eventBridgeId = naming.getCustomResourceEventBridgeResourceLogicalId(
      resourceLogicalId,
      1
    );
    return cfResources[eventBridgeId].Properties.EventBridgeConfig;
  }

  it('should create the correct policy Statement', () => {
    const roleId = naming.getCustomResourcesRoleLogicalId('default', '12345');

    const [firstStatement, secondStatement, thirdStatment] = cfResources[
      roleId
    ].Properties.Policies[0].PolicyDocument.Statement;
    expect(firstStatement.Effect).to.be.eq('Allow');
    expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('arn');
    expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('events');
    expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('event-bus/*');
    expect(firstStatement.Action).to.be.deep.eq(['events:CreateEventBus', 'events:DeleteEventBus']);

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
    expect(thirdStatment.Action).to.be.deep.eq(['lambda:AddPermission', 'lambda:RemovePermission']);
  });
  it('should create the necessary resource', () => {
    const eventBridgeConfig = getEventBridgeConfigById('default');
    expect(eventBridgeConfig.RuleName).to.include('dev-default-rule-1');
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
});
