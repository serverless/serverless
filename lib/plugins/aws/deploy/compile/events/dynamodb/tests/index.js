'use strict';

const expect = require('chai').expect;
const AwsCompileDynamoDbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileDynamoDbEvents', () => {
  let serverless;
  let awsCompileDynamoDbEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        IamPolicyLambdaExecution: {
          Properties: {
            PolicyDocument: {
              Statement: [],
            },
          },
        },
      },
    };
    awsCompileDynamoDbEvents = new AwsCompileDynamoDbEvents(serverless);
    awsCompileDynamoDbEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to "aws"', () => expect(awsCompileDynamoDbEvents.provider)
      .to.equal('aws'));
  });

  describe('#compileDynamoDbEvents()', () => {
    it('should throw an error if dynamodb event type is not a string or an object', () => {
      awsCompileDynamoDbEvents.serverless.service.functions = {
        first: {
          events: [
            {
              dynamodb: 42,
            },
          ],
        },
      };

      expect(() => awsCompileDynamoDbEvents.compileDynamoDbEvents()).to.throw(Error);
    });

    it('should throw an error if the "streamArn" property is not given', () => {
      awsCompileDynamoDbEvents.serverless.service.functions = {
        first: {
          events: [
            {
              dynamodb: {
                streamArn: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileDynamoDbEvents.compileDynamoDbEvents()).to.throw(Error);
    });

    it('should create event source mappings when dynamodb events are given', () => {
      awsCompileDynamoDbEvents.serverless.service.functions = {
        first: {
          events: [
            {
              dynamodb: {
                streamArn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                batchSize: 1,
                startingPosition: 'STARTING_POSITION_ONE',
                enabled: false,
              },
            },
            {
              dynamodb: {
                streamArn: 'arn:aws:dynamodb:region:account:table/bar/stream/2',
              },
            },
            {
              dynamodb: 'arn:aws:dynamodb:region:account:table/baz/stream/3',
            },
          ],
        },
      };

      awsCompileDynamoDbEvents.compileDynamoDbEvents();

      // event 1
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbFoo
        .Type
      ).to.equal('AWS::Lambda::EventSourceMapping');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbFoo
        .DependsOn
      ).to.equal('IamPolicyLambdaExecution');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbFoo
        .Properties.EventSourceArn
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[0]
        .dynamodb.streamArn
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbFoo
        .Properties.BatchSize
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[0]
        .dynamodb.batchSize
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbFoo
        .Properties.StartingPosition
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[0]
        .dynamodb.startingPosition
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbFoo
        .Properties.Enabled
      ).to.equal('False');

      // event 2
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBar
        .Type
      ).to.equal('AWS::Lambda::EventSourceMapping');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBar
        .DependsOn
      ).to.equal('IamPolicyLambdaExecution');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBar
        .Properties.EventSourceArn
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[1]
        .dynamodb.streamArn
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBar
        .Properties.BatchSize
      ).to.equal(10);
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBar
        .Properties.StartingPosition
      ).to.equal('TRIM_HORIZON');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBar
        .Properties.Enabled
      ).to.equal('True');

      // event 3
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBaz
        .Type
      ).to.equal('AWS::Lambda::EventSourceMapping');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBaz
        .DependsOn
      ).to.equal('IamPolicyLambdaExecution');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBaz
        .Properties.EventSourceArn
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[2]
        .dynamodb
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBaz
        .Properties.BatchSize
      ).to.equal(10);
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBaz
        .Properties.StartingPosition
      ).to.equal('TRIM_HORIZON');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDbBaz
        .Properties.Enabled
      ).to.equal('True');
    });

    it('should add the necessary IAM role statements', () => {
      awsCompileDynamoDbEvents.serverless.service.functions = {
        first: {
          events: [
            {
              dynamodb: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      const iamRoleStatements = [
        {
          Effect: 'Allow',
          Action: [
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:DescribeStream',
            'dynamodb:ListStreams',
          ],
          Resource: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
        },
      ];

      awsCompileDynamoDbEvents.compileDynamoDbEvents();

      expect(awsCompileDynamoDbEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .IamPolicyLambdaExecution.Properties
        .PolicyDocument.Statement
      ).to.deep.equal(iamRoleStatements);
    });

    it('should not create event source mapping when dynamodb events are not given', () => {
      awsCompileDynamoDbEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileDynamoDbEvents.compileDynamoDbEvents();

      // should be 1 because we've mocked the IamPolicyLambdaExecution above
      expect(
        Object.keys(awsCompileDynamoDbEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources).length
      ).to.equal(1);
    });

    it('should not add the IAM role statements when dynamodb events are not given', () => {
      awsCompileDynamoDbEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileDynamoDbEvents.compileDynamoDbEvents();

      expect(
        awsCompileDynamoDbEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .IamPolicyLambdaExecution.Properties
          .PolicyDocument.Statement.length
      ).to.equal(0);
    });
  });
});
