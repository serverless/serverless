'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileCloudWatchEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('awsCompileCloudWatchEvents', () => {
  let serverless;
  let awsCompileCloudWatchEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileCloudWatchEvents = new AwsCompileCloudWatchEvents(serverless);
    awsCompileCloudWatchEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileCloudWatchEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileCloudWatchEvents()', () => {
    it('should throw an error if cloudwatch event type is not an object', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: 42,
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchEvents.compileCloudWatchEvents()).to.throw(Error);

      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: '42',
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchEvents.compileCloudWatchEvents()).to.throw(Error);
    });

    it('should throw an error if the "event" property is not given', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchEvents.compileCloudWatchEvents()).to.throw(Error);
    });

    it('should create corresponding resources when cloudwatch events are given', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
              },
            },
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: true,
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch1.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch2.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionEventsRuleCloudWatch1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionEventsRuleCloudWatch2.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should respect enabled variable, defaulting to true', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
              },
            },
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: true,
              },
            },
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch1
        .Properties.State
      ).to.equal('DISABLED');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch2
        .Properties.State
      ).to.equal('ENABLED');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch3
        .Properties.State
      ).to.equal('ENABLED');
    });

    it('should respect name variable', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
                name: 'your-cloudwatch-event-name',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch1
        .Properties.Name
      ).to.equal('your-cloudwatch-event-name');
    });

    it('should respect description variable', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
                description: 'your cloudwatch event description',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch1
        .Properties.Description
      ).to.equal('your cloudwatch event description');
    });

    it('should respect inputPath variable', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch1
        .Properties.Targets[0].InputPath
      ).to.equal('$.stageVariables');
    });

    it('should respect input variable', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
                input: '{"key":"value"}',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch1
        .Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should respect input variable as an object', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
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

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleCloudWatch1
        .Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should throw an error when both Input and InputPath are set', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
                input: {
                  key: 'value',
                },
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchEvents.compileCloudWatchEvents()).to.throw(Error);
    });

    it('should respect variables if multi-line variables is given', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatch: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification \n with newline'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
                input: {
                  key: 'value\n',
                },
                name: 'your-cloudwatch-event-name\n',
                description: 'your cloudwatch event description \n with newline',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstEventsRuleCloudWatch1.Properties.EventPattern['detail-type'][0]
      ).to.equal('EC2 Instance State-change Notification  with newline');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstEventsRuleCloudWatch1.Properties.Name
      ).to.equal('your-cloudwatch-event-name');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstEventsRuleCloudWatch1.Properties.Description
      ).to.equal('your cloudwatch event description  with newline');
      expect(awsCompileCloudWatchEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstEventsRuleCloudWatch1.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should not create corresponding resources when cloudwatch events are not given', () => {
      awsCompileCloudWatchEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileCloudWatchEvents.compileCloudWatchEvents();

      expect(
        awsCompileCloudWatchEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });
});
