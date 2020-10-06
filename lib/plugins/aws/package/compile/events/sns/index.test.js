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
    const options = {
      region: 'some-region',
    };
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileSNSEvents = new AwsCompileSNSEvents(serverless, options);
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
                filterPolicy: {
                  pet: ['dog', 'cat'],
                },
              },
            },
            {
              sns: 'Topic 2',
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic2.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic1SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic2SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Properties.FilterPolicy
      ).to.eql({ pet: ['dog', 'cat'] });
    });

    it('should allow SNS topic without displayName', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic1.Properties
      ).to.to.not.have.property('DisplayName');
    });

    it('should create corresponding resources when topic is defined in resources', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
                filterPolicy: {
                  pet: ['dog', 'cat'],
                },
              },
            },
            {
              sns: 'Topic 2',
            },
          ],
        },
      };

      Object.assign(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        {
          SNSTopicTopic2: {
            Type: 'AWS::SNS::Topic',
            Properties: {
              TopicName: 'Topic 2',
              DisplayName: 'Display name for topic 2',
            },
          },
        }
      );

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic2.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic1SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic2SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Properties.FilterPolicy
      ).to.eql({ pet: ['dog', 'cat'] });
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

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic1SNS.Type
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

      expect(() => {
        awsCompileSNSEvents.compileSNSEvents();
      }).to.throw(Error);
    });

    it('should not create corresponding resources when SNS events are not given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });

    it('should create SNS topic when arn is given as a string', () => {
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

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFooSNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Properties.FilterPolicy
      ).to.equal(undefined);
    });

    it('should create SNS topic when only arn is given as an object property', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:region:accountid:foo',
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFooSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create a cross region subscription when SNS topic arn in a different region than provider', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:some-other-region:accountid:foo',
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();
      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Properties.Region
      ).to.equal('some-other-region');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFooSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create a cross region subscription when SNS topic arn in a different region is using pseudo params', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:${AWS::Region}:${AWS::AccountId}:foo',
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();
      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Properties.Region
      ).to.equal('${AWS::Region}');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFooSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should throw an error when the arn an object and the value is not a string', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 123,
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileSNSEvents.compileSNSEvents();
      }).to.throw(Error);
    });

    it('should create SNS topic when both arn and topicName are given as object properties', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'bar',
                arn: 'arn:aws:sns:region:accountid:bar',
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionBar.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionBarSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create two SNS topic subsriptions for ARNs with the same topic name in two regions when different topicName parameters are specified', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'first',
                arn: 'arn:aws:sns:region-1:accountid:bar',
              },
            },
            {
              sns: {
                topicName: 'second',
                arn: 'arn:aws:sns:region-2:accountid:bar',
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(4);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFirst.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionSecond.Type
      ).to.equal('AWS::SNS::Subscription');
    });

    it('should override SNS topic subsription CF resource name when arn and topicName are given as object properties', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'foo',
                arn: 'arn:aws:sns:region:accountid:bar',
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionFoo.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFooSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    // eslint-disable-next-line max-len
    it('should create SNS topic when arn object and topicName are given as object properties', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'bar',
                arn: {
                  'Fn::Join': [':', ['arn:aws:sns', '${AWS::Region}', '${AWS::AccountId}', 'bar']],
                },
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionBar.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionBarSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    // eslint-disable-next-line max-len
    it('should throw an error when arn object and no topicName are given as object properties', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: {
                  'Fn::Join': [':', ['arn:aws:sns', '${AWS::Region}', '${AWS::AccountId}', 'bar']],
                },
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileSNSEvents.compileSNSEvents();
      }).to.throw(Error);
    });

    it('should create SNS topic when arn, topicName, and filterPolicy are given as object', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'bar',
                arn: 'arn:aws:sns:region:accountid:bar',
                filterPolicy: {
                  pet: ['dog', 'cat'],
                },
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        Object.keys(
          awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )
      ).to.have.length(2);
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionBar.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionBar.Properties.FilterPolicy
      ).to.eql({ pet: ['dog', 'cat'] });
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionBarSNS.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should link topic to corresponding dlq when redrivePolicy is defined by arn string', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
                redrivePolicy: {
                  deadLetterTargetArn: 'arn:aws:sqs:us-east-1:11111111111:myDLQ',
                },
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic1SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Properties.RedrivePolicy
      ).to.eql({ deadLetterTargetArn: 'arn:aws:sqs:us-east-1:11111111111:myDLQ' });
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .Topic1ToFirstDLQPolicy.Type
      ).to.equal('AWS::SQS::QueuePolicy');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .Topic1ToFirstDLQPolicy.Properties.Queues
      ).to.deep.equal([
        {
          'Fn::Join': [
            '',
            [
              'https://sqs.us-east-1.',
              {
                Ref: 'AWS::URLSuffix',
              },
              '/11111111111/myDLQ',
            ],
          ],
        },
      ]);
    });

    it('should link topic to corresponding dlq when redrivePolicy is defined with resource ref', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
                redrivePolicy: {
                  deadLetterTargetRef: 'SNSDLQ',
                },
              },
            },
          ],
        },
      };

      Object.assign(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        {
          SNSDLQ: {
            Type: 'AWS::SQS::Queue',
            Properties: {
              QueueName: 'SNSDLQ',
            },
          },
        }
      );

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic1SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Properties.RedrivePolicy
      ).to.eql({ deadLetterTargetArn: { 'Fn::GetAtt': ['SNSDLQ', 'Arn'] } });
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .Topic1ToFirstDLQPolicy.Type
      ).to.equal('AWS::SQS::QueuePolicy');
    });

    it('should link topic to corresponding dlq when redrivePolicy is defined with resource ref', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
                redrivePolicy: {
                  deadLetterTargetImport: {
                    arn: 'myDLQArn',
                    url: 'myDLQUrl',
                  },
                },
              },
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .SNSTopicTopic1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionTopic1SNS.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Type
      ).to.equal('AWS::SNS::Subscription');
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstSnsSubscriptionTopic1.Properties.RedrivePolicy
      ).to.eql({ deadLetterTargetArn: { 'Fn::ImportValue': 'myDLQArn' } });
      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .Topic1ToFirstDLQPolicy.Type
      ).to.equal('AWS::SQS::QueuePolicy');
    });
  });
});
