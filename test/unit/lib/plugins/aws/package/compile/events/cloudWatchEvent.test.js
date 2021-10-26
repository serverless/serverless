'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const AwsCompileCloudWatchEventEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/cloudWatchEvent');
const Serverless = require('../../../../../../../../lib/Serverless');

describe('awsCompileCloudWatchEventEvents', () => {
  let serverless;
  let awsCompileCloudWatchEventEvents;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileCloudWatchEventEvents = new AwsCompileCloudWatchEventEvents(serverless);
    awsCompileCloudWatchEventEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileCloudWatchEventEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileCloudWatchEventEvents()', () => {
    it('should create corresponding resources when cloudwatch events are given', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
              },
            },
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: true,
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Type
      ).to.equal('AWS::Events::Rule');
      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent2.Type
      ).to.equal('AWS::Events::Rule');
      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleCloudWatchEvent1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleCloudWatchEvent2.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should respect enabled variable, defaulting to true', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
              },
            },
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: true,
              },
            },
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.State
      ).to.equal('DISABLED');
      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent2.Properties.State
      ).to.equal('ENABLED');
      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent3.Properties.State
      ).to.equal('ENABLED');
    });

    it('should respect inputPath variable', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0].InputPath
      ).to.equal('$.stageVariables');
    });

    it('should respect input variable', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
                input: '{"key":"value"}',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should respect inputTransformer variable', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
                inputTransformer: {
                  inputPathsMap: {
                    eventTime: '$.time',
                  },
                  inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                },
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0].InputTransformer
      ).to.eql({
        InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        InputPathsMap: { eventTime: '$.time' },
      });
    });

    it('should respect description variable', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
                input: '{"key":"value"}',
                description: 'test description',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.Description
      ).to.equal('test description');
    });

    it('should respect name variable', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
                input: '{"key":"value"}',
                name: 'test-event-name',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.Name
      ).to.equal('test-event-name');
    });

    it('should respect input variable as an object', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
                input: {
                  key: 'value',
                },
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should respect variables if multi-line variables is given', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  'source': ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification \n with newline'],
                  'detail': { state: ['pending'] },
                },
                enabled: false,
                input: {
                  key: 'value\n',
                },
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();
      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.EventPattern['detail-type'][0]
      ).to.equal('EC2 Instance State-change Notification  with newline');
      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should not create corresponding resources when cloudwatch events are not given', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents();

      expect(
        awsCompileCloudWatchEventEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });
});
