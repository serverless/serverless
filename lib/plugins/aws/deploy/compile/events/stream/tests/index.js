'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../../provider/awsProvider');
const AwsCompileStreamEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileStreamEvents', () => {
  let serverless;
  let awsCompileStreamEvents;

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
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileStreamEvents = new AwsCompileStreamEvents(serverless);
    awsCompileStreamEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to be an instance of AwsProvider', () =>
      expect(awsCompileStreamEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileStreamEvents()', () => {
    it('should throw an error if stream event type is not a string or an object', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 42,
            },
          ],
        },
      };

      expect(() => awsCompileStreamEvents.compileStreamEvents()).to.throw(Error);
    });

    it('should throw an error if the "arn" property is not given', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileStreamEvents.compileStreamEvents()).to.throw(Error);
    });

    describe('when a DynamoDB stream ARN is given', () => {
      it('should create event source mappings when a DynamoDB stream ARN is given', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                  batchSize: 1,
                  startingPosition: 'STARTING_POSITION_ONE',
                  enabled: false,
                },
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/bar/stream/2',
                },
              },
              {
                stream: 'arn:aws:dynamodb:region:account:table/baz/stream/3',
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // event 1
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
          .stream.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.BatchSize
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
          .stream.batchSize
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.StartingPosition
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
          .stream.startingPosition
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.Enabled
        ).to.equal('False');

        // event 2
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[1]
          .stream.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.Enabled
        ).to.equal('True');

        // event 3
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[2]
          .stream
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.Enabled
        ).to.equal('True');
      });

      it('should add the necessary IAM role statements', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
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

        awsCompileStreamEvents.compileStreamEvents();

        expect(awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .IamPolicyLambdaExecution.Properties
          .PolicyDocument.Statement
        ).to.deep.equal(iamRoleStatements);
      });
    });

    describe('when a Kinesis stream ARN is given', () => {
      it('should create event source mappings when a Kinesis stream ARN is given', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/foo',
                  batchSize: 1,
                  startingPosition: 'STARTING_POSITION_ONE',
                  enabled: false,
                },
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/bar',
                },
              },
              {
                stream: 'arn:aws:kinesis:region:account:stream/baz',
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // event 1
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
          .stream.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.BatchSize
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
          .stream.batchSize
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.StartingPosition
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
          .stream.startingPosition
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.Enabled
        ).to.equal('False');

        // event 2
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[1]
          .stream.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.Enabled
        ).to.equal('True');

        // event 3
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[2]
          .stream
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.Enabled
        ).to.equal('True');
      });

      it('should add the necessary IAM role statements', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: 'arn:aws:kinesis:region:account:stream/foo',
              },
            ],
          },
        };

        const iamRoleStatements = [
          {
            Effect: 'Allow',
            Action: [
              'kinesis:GetRecords',
              'kinesis:GetShardIterator',
              'kinesis:DescribeStream',
              'kinesis:ListStreams',
            ],
            Resource: 'arn:aws:kinesis:region:account:stream/foo',
          },
        ];

        awsCompileStreamEvents.compileStreamEvents();

        expect(awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .IamPolicyLambdaExecution.Properties
          .PolicyDocument.Statement
        ).to.deep.equal(iamRoleStatements);
      });
    });

    describe('when a DynamoDB stream is given', () => {
      it('should create event source mappings when a DynamoDB stream is given', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                dynamodb: {
                  arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                  batchSize: 1,
                  startingPosition: 'STARTING_POSITION_ONE',
                  enabled: false,
                },
              },
              {
                dynamodb: {
                  arn: 'arn:aws:dynamodb:region:account:table/bar/stream/2',
                },
              },
              {
                dynamodb: 'arn:aws:dynamodb:region:account:table/baz/stream/3',
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // event 1
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
            .dynamodb.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.BatchSize
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
            .dynamodb.batchSize
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.StartingPosition
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
            .dynamodb.startingPosition
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb1
          .Properties.Enabled
        ).to.equal('False');

        // event 2
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[1]
            .dynamodb.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb2
          .Properties.Enabled
        ).to.equal('True');

        // event 3
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[2]
            .dynamodb
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingDynamodb3
          .Properties.Enabled
        ).to.equal('True');
      });
    });

    describe('when a Kinesis stream is given', () => {
      it('should create event source mappings when a Kinesis stream is given', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                kinesis: {
                  arn: 'arn:aws:kinesis:region:account:stream/foo',
                  batchSize: 1,
                  startingPosition: 'STARTING_POSITION_ONE',
                  enabled: false,
                },
              },
              {
                kinesis: {
                  arn: 'arn:aws:kinesis:region:account:stream/bar',
                },
              },
              {
                kinesis: 'arn:aws:kinesis:region:account:stream/baz',
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // event 1
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
            .kinesis.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.BatchSize
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
            .kinesis.batchSize
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.StartingPosition
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
            .kinesis.startingPosition
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.Enabled
        ).to.equal('False');

        // event 2
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[1]
            .kinesis.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis2
          .Properties.Enabled
        ).to.equal('True');

        // event 3
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.EventSourceArn
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[2]
            .kinesis
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis3
          .Properties.Enabled
        ).to.equal('True');
      });

      it('should create event source mappings when a Kinesis stream getAttr is given', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                kinesis: {
                  arn: {
                    'Fn::GetAtt': ['BookmarksStream', 'Arn'],
                  },
                },
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // event 1
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .DependsOn
        ).to.equal('IamPolicyLambdaExecution');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.EventSourceArn
        ).to.deep.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0]
            .kinesis.arn
        );
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.BatchSize
        ).to.equal(10);
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(awsCompileStreamEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventSourceMappingKinesis1
          .Properties.Enabled
        ).to.equal('True');
      });
    });

    it('should not create event source mapping when stream events are not given', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileStreamEvents.compileStreamEvents();

      // should be 1 because we've mocked the IamPolicyLambdaExecution above
      expect(
        Object.keys(awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources).length
      ).to.equal(1);
    });

    it('should not add the IAM role statements when stream events are not given', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileStreamEvents.compileStreamEvents();

      expect(
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
          .IamPolicyLambdaExecution.Properties
          .PolicyDocument.Statement.length
      ).to.equal(0);
    });
  });
});
