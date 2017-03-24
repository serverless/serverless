'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileCloudWatchLogEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileCloudWatchLogEvents', () => {
  let serverless;
  let awsCompileCloudWatchLogEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileCloudWatchLogEvents = new AwsCompileCloudWatchLogEvents(serverless);
    awsCompileCloudWatchLogEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileCloudWatchLogEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileCloudWatchLogEvents()', () => {
    it('should throw an error if cloudwatch event type is not an object', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: 42,
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()).to.throw(Error);

      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '42',
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()).to.throw(Error);
    });

    it('should throw an error if the "logGroup" property is not given', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {},
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()).to.throw(Error);
    });

    it('should create corresponding resources when cloudwatchLog events are given', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
              },
            },
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello2',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents();
      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog1.Type
      ).to.equal('AWS::Logs::SubscriptionFilter');
      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog2.Type
      ).to.equal('AWS::Logs::SubscriptionFilter');
      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog1
        .Properties.LogGroupName
      ).to.equal('/aws/lambda/hello1');
      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog2
        .Properties.LogGroupName
      ).to.equal('/aws/lambda/hello2');
      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCloudWatchLog1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCloudWatchLog2.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should respect "filter" variable', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
                filter: '{$.userIdentity.type = Root}',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents();

      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog1
        .Properties.FilterPattern
      ).to.equal('{$.userIdentity.type = Root}');
    });

    it('should set empty string to FilterPattern statiment when "filter" variable is not given'
    , () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents();

      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog1
        .Properties.FilterPattern
      ).to.equal('');
    });

    it('should throw an error if "filter" variable is not a string', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
                filter: {},
              },
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()).to.throw(Error);

      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
                filter: [],
              },
            },
          ],
        },
      };

      expect(() => awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()).to.throw(Error);
    });

    it('should respect variables if multi-line variables is given', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lam\nbda/hello1',
                filter: '{$.userIden\ntity.type = Root}',
              },
            },
          ],
        },
      };

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents();

      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog1
        .Properties.LogGroupName
      ).to.equal('/aws/lambda/hello1');
      expect(awsCompileCloudWatchLogEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstCloudWatchLog1
        .Properties.FilterPattern
      ).to.equal('{$.userIdentity.type = Root}');
    });

    it('should not create corresponding resources when cloudwatchLog events are not given', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents();

      expect(
        awsCompileCloudWatchLogEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });
});
