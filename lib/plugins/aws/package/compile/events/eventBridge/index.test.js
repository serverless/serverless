'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const chai = require('chai');
const proxyquire = require('proxyquire').noCallThru();
const AwsProvider = require('../../../../provider/awsProvider');
const Serverless = require('../../../../../../Serverless');

const { expect } = chai;
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

describe('AwsCompileEventBridgeEvents', () => {
  let serverless;
  let awsCompileEventBridgeEvents;
  let addCustomResourceToServiceStub;

  beforeEach(() => {
    addCustomResourceToServiceStub = sinon.stub().resolves();
    const AwsCompileEventBridgeEvents = proxyquire('./index', {
      '../../../../customResources': {
        addCustomResourceToService: addCustomResourceToServiceStub,
      },
    });
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileEventBridgeEvents = new AwsCompileEventBridgeEvents(serverless);

    awsCompileEventBridgeEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileEventBridgeEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileEventBridgeEvents()', () => {
    it('should throw if the eventBridge config is a string', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: 'some-config',
            },
          ],
        },
      };

      expect(() => awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.throw(
        /not an object/
      );
    });

    it('should throw if neither the pattern nor the schedule config is given', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {},
            },
          ],
        },
      };

      expect(() => awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.throw(
        /need to configure the pattern or schedule property/
      );
    });

    it('should not throw if the eventBridge config is an object and used with another event source', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'some-bucket',
              },
            },
            {
              eventBridge: {
                pattern: {},
              },
            },
          ],
        },
      };

      expect(() => awsCompileEventBridgeEvents.compileEventBridgeEvents()).not.to.throw();
    });

    it('should create the necessary resources for the most minimal configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
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
      };

      return expect(awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.be.fulfilled.then(
        () => {
          const {
            Resources,
          } = awsCompileEventBridgeEvents.serverless.service.provider.compiledCloudFormationTemplate;

          expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
          expect(addCustomResourceToServiceStub.args[0][1]).to.equal('eventBridge');
          expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
            {
              Action: [
                'events:PutRule',
                'events:RemoveTargets',
                'events:PutTargets',
                'events:DeleteRule',
              ],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'rule/first-rule-1',
                  ],
                ],
              },
            },
            {
              Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:lambda',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'function',
                    'first',
                  ],
                ],
              },
            },
          ]);
          expect(Resources.FirstCustomEventBridge1).to.deep.equal({
            Type: 'Custom::EventBridge',
            Version: 1,
            DependsOn: [
              'FirstLambdaFunction',
              'CustomDashresourceDasheventDashbridgeLambdaFunction',
            ],
            Properties: {
              ServiceToken: {
                'Fn::GetAtt': ['CustomDashresourceDasheventDashbridgeLambdaFunction', 'Arn'],
              },
              FunctionName: 'first',
              EventBridgeConfig: {
                EventBus: undefined,
                Input: undefined,
                InputPath: undefined,
                InputTransformer: undefined,
                Pattern: {
                  'detail': {
                    eventSource: ['cloudformation.amazonaws.com'],
                  },
                  'detail-type': ['AWS API Call via CloudTrail'],
                  'source': ['aws.cloudformation'],
                },
                RuleName: 'first-rule-1',
                Schedule: 'rate(10 minutes)',
              },
            },
          });
        }
      );
    });

    it('should create the necessary resources when using a complex configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: 'some-event-bus',
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
      };

      return expect(awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.be.fulfilled.then(
        () => {
          const {
            Resources,
          } = awsCompileEventBridgeEvents.serverless.service.provider.compiledCloudFormationTemplate;

          expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
          expect(addCustomResourceToServiceStub.args[0][1]).to.equal('eventBridge');
          expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
            {
              Action: ['events:CreateEventBus', 'events:DeleteEventBus'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'event-bus/some-event-bus',
                  ],
                ],
              },
            },
            {
              Action: [
                'events:PutRule',
                'events:RemoveTargets',
                'events:PutTargets',
                'events:DeleteRule',
              ],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'rule/some-event-bus/first-rule-1',
                  ],
                ],
              },
            },
            {
              Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:lambda',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'function',
                    'first',
                  ],
                ],
              },
            },
          ]);
          expect(Resources.FirstCustomEventBridge1).to.deep.equal({
            Type: 'Custom::EventBridge',
            Version: 1,
            DependsOn: [
              'FirstLambdaFunction',
              'CustomDashresourceDasheventDashbridgeLambdaFunction',
            ],
            Properties: {
              ServiceToken: {
                'Fn::GetAtt': ['CustomDashresourceDasheventDashbridgeLambdaFunction', 'Arn'],
              },
              FunctionName: 'first',
              EventBridgeConfig: {
                EventBus: 'some-event-bus',
                Input: {
                  key1: 'value1',
                  key2: {
                    nested: 'value2',
                  },
                },
                InputPath: undefined,
                InputTransformer: undefined,
                Pattern: {
                  'detail': {
                    eventSource: ['cloudformation.amazonaws.com'],
                  },
                  'detail-type': ['AWS API Call via CloudTrail'],
                  'source': ['aws.cloudformation'],
                },
                RuleName: 'first-rule-1',
                Schedule: 'rate(10 minutes)',
              },
            },
          });
        }
      );
    });

    it('should create the necessary resources when using an own event bus arn', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
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
      };

      return expect(awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.be.fulfilled.then(
        () => {
          const {
            Resources,
          } = awsCompileEventBridgeEvents.serverless.service.provider.compiledCloudFormationTemplate;

          expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
          expect(addCustomResourceToServiceStub.args[0][1]).to.equal('eventBridge');
          expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
            {
              Action: ['events:CreateEventBus', 'events:DeleteEventBus'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'event-bus/some-event-bus',
                  ],
                ],
              },
            },
            {
              Action: [
                'events:PutRule',
                'events:RemoveTargets',
                'events:PutTargets',
                'events:DeleteRule',
              ],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'rule/some-event-bus/first-rule-1',
                  ],
                ],
              },
            },
            {
              Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:lambda',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'function',
                    'first',
                  ],
                ],
              },
            },
          ]);
          expect(Resources.FirstCustomEventBridge1).to.deep.equal({
            Type: 'Custom::EventBridge',
            Version: 1,
            DependsOn: [
              'FirstLambdaFunction',
              'CustomDashresourceDasheventDashbridgeLambdaFunction',
            ],
            Properties: {
              ServiceToken: {
                'Fn::GetAtt': ['CustomDashresourceDasheventDashbridgeLambdaFunction', 'Arn'],
              },
              FunctionName: 'first',
              EventBridgeConfig: {
                EventBus: 'arn:aws:events:us-east-1:12345:event-bus/some-event-bus',
                Input: {
                  key1: 'value1',
                  key2: {
                    nested: 'value2',
                  },
                },
                InputPath: undefined,
                InputTransformer: undefined,
                Pattern: {
                  'detail': {
                    eventSource: ['cloudformation.amazonaws.com'],
                  },
                  'detail-type': ['AWS API Call via CloudTrail'],
                  'source': ['aws.cloudformation'],
                },
                RuleName: 'first-rule-1',
                Schedule: 'rate(10 minutes)',
              },
            },
          });
        }
      );
    });

    it('should create the necessary resources when using a partner event bus arn', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: 'arn:aws:events:us-east-1:12345:event-bus/aws.partner/partner.com/12345',
                pattern: {
                  source: ['aws.partner/partner.com/12345'],
                  detail: {
                    event: ['My Event'],
                    type: ['track'],
                  },
                },
              },
            },
          ],
        },
      };

      return expect(awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.be.fulfilled.then(
        () => {
          const {
            Resources,
          } = awsCompileEventBridgeEvents.serverless.service.provider.compiledCloudFormationTemplate;

          expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
          expect(addCustomResourceToServiceStub.args[0][1]).to.equal('eventBridge');
          expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
            {
              Action: ['events:CreateEventBus', 'events:DeleteEventBus'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'event-bus/aws.partner/partner.com/12345',
                  ],
                ],
              },
            },
            {
              Action: [
                'events:PutRule',
                'events:RemoveTargets',
                'events:PutTargets',
                'events:DeleteRule',
              ],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'rule/aws.partner/partner.com/12345/first-rule-1',
                  ],
                ],
              },
            },
            {
              Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:lambda',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'function',
                    'first',
                  ],
                ],
              },
            },
          ]);
          expect(Resources.FirstCustomEventBridge1).to.deep.equal({
            Type: 'Custom::EventBridge',
            Version: 1,
            DependsOn: [
              'FirstLambdaFunction',
              'CustomDashresourceDasheventDashbridgeLambdaFunction',
            ],
            Properties: {
              ServiceToken: {
                'Fn::GetAtt': ['CustomDashresourceDasheventDashbridgeLambdaFunction', 'Arn'],
              },
              FunctionName: 'first',
              EventBridgeConfig: {
                EventBus: 'arn:aws:events:us-east-1:12345:event-bus/aws.partner/partner.com/12345',
                Input: undefined,
                InputPath: undefined,
                InputTransformer: undefined,
                Pattern: {
                  detail: {
                    event: ['My Event'],
                    type: ['track'],
                  },

                  source: ['aws.partner/partner.com/12345'],
                },
                Schedule: undefined,
                RuleName: 'first-rule-1',
              },
            },
          });
        }
      );
    });

    it('should create the necessary resources when using an input configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
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
                input: {
                  key1: 'value1',
                },
              },
            },
          ],
        },
      };

      return expect(awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.be.fulfilled.then(
        () => {
          const {
            Resources,
          } = awsCompileEventBridgeEvents.serverless.service.provider.compiledCloudFormationTemplate;

          expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
          expect(addCustomResourceToServiceStub.args[0][1]).to.equal('eventBridge');
          expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
            {
              Action: [
                'events:PutRule',
                'events:RemoveTargets',
                'events:PutTargets',
                'events:DeleteRule',
              ],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'rule/first-rule-1',
                  ],
                ],
              },
            },
            {
              Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:lambda',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'function',
                    'first',
                  ],
                ],
              },
            },
          ]);
          expect(Resources.FirstCustomEventBridge1).to.deep.equal({
            Type: 'Custom::EventBridge',
            Version: 1,
            DependsOn: [
              'FirstLambdaFunction',
              'CustomDashresourceDasheventDashbridgeLambdaFunction',
            ],
            Properties: {
              ServiceToken: {
                'Fn::GetAtt': ['CustomDashresourceDasheventDashbridgeLambdaFunction', 'Arn'],
              },
              FunctionName: 'first',
              EventBridgeConfig: {
                EventBus: undefined,
                Input: {
                  key1: 'value1',
                },
                InputPath: undefined,
                InputTransformer: undefined,
                Pattern: {
                  'detail': {
                    eventSource: ['cloudformation.amazonaws.com'],
                  },
                  'detail-type': ['AWS API Call via CloudTrail'],
                  'source': ['aws.cloudformation'],
                },
                RuleName: 'first-rule-1',
                Schedule: undefined,
              },
            },
          });
        }
      );
    });

    it('should create the necessary resources when using an inputPath configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
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
      };

      return expect(awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.be.fulfilled.then(
        () => {
          const {
            Resources,
          } = awsCompileEventBridgeEvents.serverless.service.provider.compiledCloudFormationTemplate;

          expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
          expect(addCustomResourceToServiceStub.args[0][1]).to.equal('eventBridge');
          expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
            {
              Action: [
                'events:PutRule',
                'events:RemoveTargets',
                'events:PutTargets',
                'events:DeleteRule',
              ],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:events',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'rule/first-rule-1',
                  ],
                ],
              },
            },
            {
              Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  ':',
                  [
                    'arn:aws:lambda',
                    {
                      Ref: 'AWS::Region',
                    },
                    {
                      Ref: 'AWS::AccountId',
                    },
                    'function',
                    'first',
                  ],
                ],
              },
            },
          ]);
          expect(Resources.FirstCustomEventBridge1).to.deep.equal({
            Type: 'Custom::EventBridge',
            Version: 1,
            DependsOn: [
              'FirstLambdaFunction',
              'CustomDashresourceDasheventDashbridgeLambdaFunction',
            ],
            Properties: {
              ServiceToken: {
                'Fn::GetAtt': ['CustomDashresourceDasheventDashbridgeLambdaFunction', 'Arn'],
              },
              FunctionName: 'first',
              EventBridgeConfig: {
                EventBus: undefined,
                Input: undefined,
                InputPath: '$.stageVariables',
                InputTransformer: undefined,
                Pattern: {
                  'detail': {
                    eventSource: ['cloudformation.amazonaws.com'],
                  },
                  'detail-type': ['AWS API Call via CloudTrail'],
                  'source': ['aws.cloudformation'],
                },
                RuleName: 'first-rule-1',
                Schedule: undefined,
              },
            },
          });
        }
      );
    });

    describe('when using an inputTransformer configuration', () => {
      it('should create the necessary resources', () => {
        awsCompileEventBridgeEvents.serverless.service.functions = {
          first: {
            name: 'first',
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
        };

        return expect(awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.be.fulfilled.then(
          () => {
            const {
              Resources,
            } = awsCompileEventBridgeEvents.serverless.service.provider.compiledCloudFormationTemplate;

            expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
            expect(addCustomResourceToServiceStub.args[0][1]).to.equal('eventBridge');
            expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
              {
                Action: [
                  'events:PutRule',
                  'events:RemoveTargets',
                  'events:PutTargets',
                  'events:DeleteRule',
                ],
                Effect: 'Allow',
                Resource: {
                  'Fn::Join': [
                    ':',
                    [
                      'arn:aws:events',
                      {
                        Ref: 'AWS::Region',
                      },
                      {
                        Ref: 'AWS::AccountId',
                      },
                      'rule/first-rule-1',
                    ],
                  ],
                },
              },
              {
                Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
                Effect: 'Allow',
                Resource: {
                  'Fn::Join': [
                    ':',
                    [
                      'arn:aws:lambda',
                      {
                        Ref: 'AWS::Region',
                      },
                      {
                        Ref: 'AWS::AccountId',
                      },
                      'function',
                      'first',
                    ],
                  ],
                },
              },
            ]);
            expect(Resources.FirstCustomEventBridge1).to.deep.equal({
              Type: 'Custom::EventBridge',
              Version: 1,
              DependsOn: [
                'FirstLambdaFunction',
                'CustomDashresourceDasheventDashbridgeLambdaFunction',
              ],
              Properties: {
                ServiceToken: {
                  'Fn::GetAtt': ['CustomDashresourceDasheventDashbridgeLambdaFunction', 'Arn'],
                },
                FunctionName: 'first',
                EventBridgeConfig: {
                  EventBus: undefined,
                  Input: undefined,
                  InputPath: undefined,
                  InputTransformer: {
                    InputPathsMap: {
                      eventTime: '$.time',
                    },
                    InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                  },
                  Pattern: {
                    'detail': {
                      eventSource: ['cloudformation.amazonaws.com'],
                    },
                    'detail-type': ['AWS API Call via CloudTrail'],
                    'source': ['aws.cloudformation'],
                  },
                  RuleName: 'first-rule-1',
                  Schedule: undefined,
                },
              },
            });
          }
        );
      });

      it('should throw if the inputTemplate configuration is missing', () => {
        awsCompileEventBridgeEvents.serverless.service.functions = {
          first: {
            name: 'first',
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
                    InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                  },
                },
              },
            ],
          },
        };

        expect(() => awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.throw(
          /inputTemplate key is required/
        );
      });
    });

    describe('when using different input configurations', () => {
      it('should throw when using input and inputTransformer', () => {
        awsCompileEventBridgeEvents.serverless.service.functions = {
          first: {
            name: 'first',
            events: [
              {
                eventBridge: {
                  schedule: 'rate(10 minutes)',
                  input: 'some-input',
                  inputTransformer: {
                    InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                  },
                },
              },
            ],
          },
        };

        expect(() => awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.throw(
          /can only set one of/
        );
      });

      it('should throw when using input and inputPath', () => {
        awsCompileEventBridgeEvents.serverless.service.functions = {
          first: {
            name: 'first',
            events: [
              {
                eventBridge: {
                  schedule: 'rate(10 minutes)',
                  input: 'some-input',
                  inputPath: '$.stageVariables',
                },
              },
            ],
          },
        };

        expect(() => awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.throw(
          /can only set one of/
        );
      });

      it('should throw when using inputPath and inputTransformer', () => {
        awsCompileEventBridgeEvents.serverless.service.functions = {
          first: {
            name: 'first',
            events: [
              {
                eventBridge: {
                  schedule: 'rate(10 minutes)',
                  inputPath: '$.stageVariables',
                  inputTransformer: {
                    InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                  },
                },
              },
            ],
          },
        };

        expect(() => awsCompileEventBridgeEvents.compileEventBridgeEvents()).to.throw(
          /can only set one of/
        );
      });
    });
  });
});
