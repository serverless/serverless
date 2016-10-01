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
                streamArn: 'stream:arn:one',
                batchSize: 1,
                startingPosition: 'STARTING_POSITION_ONE',
              },
            },
            {
              dynamodb: {
                streamArn: 'stream:arn:two',
              },
            },
            {
              dynamodb: 'stream:arn:three',
            },
          ],
        },
      };

      awsCompileDynamoDbEvents.compileDynamoDbEvents();

      // event 1
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb1
        .Type
      ).to.equal('AWS::Lambda::EventSourceMapping');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb1
        .Properties.EventSourceArn
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[0]
        .dynamodb.streamArn
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb1
        .Properties.BatchSize
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[0]
        .dynamodb.batchSize
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb1
        .Properties.StartingPosition
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[0]
        .dynamodb.startingPosition
      );

      // event 2
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb2
        .Type
      ).to.equal('AWS::Lambda::EventSourceMapping');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb2
        .Properties.EventSourceArn
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[1]
        .dynamodb.streamArn
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb2
        .Properties.BatchSize
      ).to.equal(10);
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb2
        .Properties.StartingPosition
      ).to.equal('TRIM_HORIZON');

      // event 3
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb3
        .Type
      ).to.equal('AWS::Lambda::EventSourceMapping');
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb3
        .Properties.EventSourceArn
      ).to.equal(
        awsCompileDynamoDbEvents.serverless.service.functions.first.events[2]
        .dynamodb
      );
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb3
        .Properties.BatchSize
      ).to.equal(10);
      expect(awsCompileDynamoDbEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamoDb3
        .Properties.StartingPosition
      ).to.equal('TRIM_HORIZON');
    });

    it('should add the necessary IAM role statements', () => {
      awsCompileDynamoDbEvents.serverless.service.functions = {
        first: {
          events: [
            {
              dynamodb: 'stream:arn:one',
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
          Resource: 'stream:arn:one',
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

      expect(
        awsCompileDynamoDbEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
      ).to.not.include.keys('FirstEventSourceMappingDynamoDb1');
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
