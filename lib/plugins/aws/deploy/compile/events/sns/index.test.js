'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileSNSEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileSNSEvents', () => {
  let serverless;
  let awsCompileSNSEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileSNSEvents = new AwsCompileSNSEvents(serverless);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileSNSEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileSNSEvents()', () => {
    it('should throw an error if SNS event type is not a string or an object', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: 42,
            },
          ],
        },
      };

      expect(() => awsCompileSNSEvents.compileSNSEvents()).to.throw(Error);
    });

    it('should create corresponding resources when SNS events are given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
              },
            },
            {
              sns: 'Topic 2',
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.SNSTopicTopic2.Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstLambdaPermissionTopic1SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstLambdaPermissionTopic2SNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create single SNS topic when the same topic is referenced repeatedly', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
              },
            },
            {
              sns: 'Topic 1',
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(Object.keys(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources)
      ).to.have.length(2);
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.SNSTopicTopic1
        .Properties.Subscription.length
      ).to.equal(2);
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstLambdaPermissionTopic1SNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should throw an error when the event an object and the displayName is not given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                displayName: 'Display name for topic 1',
              },
            },
          ],
        },
      };

      expect(() => { awsCompileSNSEvents.compileSNSEvents(); }).to.throw(Error);
    });

    it('should not create corresponding resources when SNS events are not given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });

    it('should not create SNS topic when arn is given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: 'arn:aws:foo',
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(Object.keys(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources)
      ).to.have.length(2);
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstSnsSubscriptionFoo.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(awsCompileSNSEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstLambdaPermissionFooSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });
  });
});
