'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const AwsCompileStreamEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/stream');
const Serverless = require('../../../../../../../../lib/serverless');
const runServerless = require('../../../../../../../utils/run-serverless');

describe('AwsCompileStreamEvents', () => {
  let serverless;
  let awsCompileStreamEvents;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        IamRoleLambdaExecution: {
          Properties: {
            Policies: [
              {
                PolicyDocument: {
                  Statement: [],
                },
              },
            ],
          },
        },
      },
    };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileStreamEvents = new AwsCompileStreamEvents(serverless);
    awsCompileStreamEvents.serverless.service.service = 'new-service';
  });

  describe('#compileStreamEvents()', () => {
    it('should not throw error or merge role statements if default policy is not present', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role is set in function', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          role: 'arn:aws:iam::account:role/foo',
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.be.instanceof(Array);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn.length
      ).to.equal(0);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role name reference is set in function', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          role: roleLogicalId,
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.include(roleLogicalId);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role reference is set in function', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          role: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.include(roleLogicalId);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role is set in provider', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      awsCompileStreamEvents.serverless.service.provider.role = 'arn:aws:iam::account:role/foo';

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.be.instanceof(Array);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn.length
      ).to.equal(0);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if IAM role is referenced from cloudformation parameters', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          role: { Ref: 'MyStreamRoleArn' },
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn.length
      ).to.equal(0);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if IAM role is imported', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          role: { 'Fn::ImportValue': 'ExportedRoleId' },
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn.length
      ).to.equal(0);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role reference is set in provider', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      awsCompileStreamEvents.serverless.service.provider.role = {
        'Fn::GetAtt': [roleLogicalId, 'Arn'],
      };

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.include(roleLogicalId);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role name reference is set in provider', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              // doesn't matter if DynamoDB or Kinesis stream
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null;

      awsCompileStreamEvents.serverless.service.provider.role = roleLogicalId;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.include(roleLogicalId);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
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
                  batchWindow: 15,
                  maximumRetryAttempts: 4,
                },
              },
              {
                stream: 'arn:aws:dynamodb:region:account:table/baz/stream/3',
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/buzz/stream/4',
                  bisectBatchOnFunctionError: true,
                  batchWindow: 0,
                  maximumRecordAgeInSeconds: 120,
                },
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/fizz/stream/5',
                  destinations: {
                    onFailure: 'arn:aws:sns:region:account:snstopic',
                  },
                },
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // event 1
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.Properties.BatchSize
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.batchSize
        );
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.Properties.StartingPosition
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0].stream
            .startingPosition
        );
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.Properties.Enabled
        ).to.equal(false);

        // event 2
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[1].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.MaximumBatchingWindowInSeconds
        ).to.equal(15);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.MaximumRetryAttempts
        ).to.equal(4);

        // event 3
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[2].stream);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Properties.BisectBatchOnFunctionError
        ).to.equal(undefined);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Properties.MaximumRecordAgeInSeconds
        ).to.equal(undefined);

        // event 4
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[3].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.BisectBatchOnFunctionError
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.MaximumRecordAgeInSeconds
        ).to.equal(120);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.MaximumBatchingWindowInSeconds
        ).to.equal(0);

        // event 5
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFizz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFizz.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFizz.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFizz.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFizz.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFizz.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFizz.Properties.DestinationConfig.OnFailure
            .Destination
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.destinations
            .onFailure
        );
      });

      it('should allow specifying DynamoDB and Kinesis streams as CFN reference types', () => {
        awsCompileStreamEvents.serverless.service.resources.Parameters = {
          SomeDdbTableStreamArn: {
            Type: 'String',
          },
          ForeignKinesisStreamArn: {
            Type: 'String',
          },
        };
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: { 'Fn::GetAtt': ['SomeDdbTable', 'StreamArn'] },
                  type: 'dynamodb',
                },
              },
              {
                stream: {
                  arn: { 'Fn::ImportValue': 'ForeignKinesis' },
                  type: 'kinesis',
                },
              },
              {
                stream: {
                  arn: {
                    'Fn::Join': [
                      ':',
                      [
                        'arn',
                        'aws',
                        'kinesis',
                        {
                          Ref: 'AWS::Region',
                        },
                        {
                          Ref: 'AWS::AccountId',
                        },
                        'stream/MyStream',
                      ],
                    ],
                  },
                  type: 'kinesis',
                },
              },
              {
                stream: {
                  arn: { Ref: 'SomeDdbTableStreamArn' },
                  type: 'dynamodb',
                },
              },
              {
                stream: {
                  arn: { Ref: 'ForeignKinesisStreamArn' },
                  type: 'kinesis',
                },
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // dynamodb with Fn::GetAtt
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbSomeDdbTable.Properties.EventSourceArn
        ).to.deep.equal({ 'Fn::GetAtt': ['SomeDdbTable', 'StreamArn'] });
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[0]
        ).to.deep.equal({
          Action: [
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:DescribeStream',
            'dynamodb:ListStreams',
          ],
          Effect: 'Allow',
          Resource: [
            {
              'Fn::GetAtt': ['SomeDdbTable', 'StreamArn'],
            },
            {
              Ref: 'SomeDdbTableStreamArn',
            },
          ],
        });

        // kinesis with Fn::ImportValue
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisForeignKinesis.Properties.EventSourceArn
        ).to.deep.equal({ 'Fn::ImportValue': 'ForeignKinesis' });

        // kinesis with Fn::Join
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisMyStream.Properties.EventSourceArn
        ).to.deep.equal({
          'Fn::Join': [
            ':',
            [
              'arn',
              'aws',
              'kinesis',
              {
                Ref: 'AWS::Region',
              },
              {
                Ref: 'AWS::AccountId',
              },
              'stream/MyStream',
            ],
          ],
        });

        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[1]
        ).to.deep.equal({
          Effect: 'Allow',
          Action: [
            'kinesis:GetRecords',
            'kinesis:GetShardIterator',
            'kinesis:DescribeStream',
            'kinesis:ListStreams',
          ],
          Resource: [
            {
              'Fn::ImportValue': 'ForeignKinesis',
            },
            {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  'aws',
                  'kinesis',
                  {
                    Ref: 'AWS::Region',
                  },
                  {
                    Ref: 'AWS::AccountId',
                  },
                  'stream/MyStream',
                ],
              ],
            },
            {
              Ref: 'ForeignKinesisStreamArn',
            },
          ],
        });
      });

      it('should allow specifying OnFailure destinations as CFN reference types', () => {
        awsCompileStreamEvents.serverless.service.resources.Parameters = {
          SomeSNSArn: {
            Type: 'String',
          },
          ForeignSQSArn: {
            Type: 'String',
          },
        };
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                  destinations: {
                    onFailure: {
                      arn: { 'Fn::GetAtt': ['SomeSNS', 'Arn'] },
                      type: 'sns',
                    },
                  },
                },
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/bar/stream/1',
                  destinations: {
                    onFailure: {
                      arn: { 'Fn::ImportValue': 'ForeignSQS' },
                      type: 'sqs',
                    },
                  },
                },
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/baz/stream/1',
                  destinations: {
                    onFailure: {
                      arn: {
                        'Fn::Join': [
                          ':',
                          [
                            'arn',
                            'aws',
                            'sqs',
                            {
                              Ref: 'AWS::Region',
                            },
                            {
                              Ref: 'AWS::AccountId',
                            },
                            'MyQueue',
                          ],
                        ],
                      },
                      type: 'sqs',
                    },
                  },
                },
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/buzz/stream/1',
                  destinations: {
                    onFailure: {
                      arn: { Ref: 'SomeSNSArn' },
                      type: 'sns',
                    },
                  },
                },
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/fizz/stream/1',
                  destinations: {
                    onFailure: {
                      arn: { Ref: 'ForeignSQSArn' },
                      type: 'sqs',
                    },
                  },
                },
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // sns with Fn::GetAtt
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.Properties.DestinationConfig.OnFailure
            .Destination
        ).to.deep.equal({ 'Fn::GetAtt': ['SomeSNS', 'Arn'] });
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[1]
        ).to.deep.equal({
          Action: ['sns:Publish'],
          Effect: 'Allow',
          Resource: [
            {
              'Fn::GetAtt': ['SomeSNS', 'Arn'],
            },
            {
              Ref: 'SomeSNSArn',
            },
          ],
        });

        // sqs with Fn::ImportValue
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.DestinationConfig.OnFailure
            .Destination
        ).to.deep.equal({ 'Fn::ImportValue': 'ForeignSQS' });

        // sqs with Fn::Join
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Properties.DestinationConfig.OnFailure
            .Destination
        ).to.deep.equal({
          'Fn::Join': [
            ':',
            [
              'arn',
              'aws',
              'sqs',
              {
                Ref: 'AWS::Region',
              },
              {
                Ref: 'AWS::AccountId',
              },
              'MyQueue',
            ],
          ],
        });

        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[2]
        ).to.deep.equal({
          Effect: 'Allow',
          Action: ['sqs:ListQueues', 'sqs:SendMessage'],
          Resource: [
            {
              'Fn::ImportValue': 'ForeignSQS',
            },
            {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  'aws',
                  'sqs',
                  {
                    Ref: 'AWS::Region',
                  },
                  {
                    Ref: 'AWS::AccountId',
                  },
                  'MyQueue',
                ],
              ],
            },
            {
              Ref: 'ForeignSQSArn',
            },
          ],
        });
      });

      it('fails if Ref/dynamic stream ARN is used without defining it to the CF parameters', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: { Ref: 'SomeDdbTableStreamArn' },
                },
              },
            ],
          },
        };

        expect(() => awsCompileStreamEvents.compileStreamEvents()).to.throw(Error);
      });

      it('fails if Ref/dynamic onFailure ARN is used without defining it to the CF parameters', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/fizz/stream/1',
                  destinations: {
                    onFailure: {
                      arn: { Ref: 'ForeignSQSArn' },
                    },
                  },
                },
              },
            ],
          },
        };

        expect(() => awsCompileStreamEvents.compileStreamEvents()).to.throw(Error);
      });

      it('fails if Fn::GetAtt/dynamic stream ARN is used without a type', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: { 'Fn::GetAtt': ['SomeDdbTable', 'StreamArn'] },
                },
              },
            ],
          },
        };

        expect(() => awsCompileStreamEvents.compileStreamEvents()).to.throw(Error);
      });

      it('fails if Fn::GetAtt/dynamic onFailure ARN is used without a type', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                  destinations: {
                    onFailure: {
                      arn: { 'Fn::GetAtt': ['SomeSNS', 'Arn'] },
                    },
                  },
                },
              },
            ],
          },
        };

        expect(() => awsCompileStreamEvents.compileStreamEvents()).to.throw(Error);
      });

      it('should add the necessary IAM role statements', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
              },
              {
                stream: {
                  arn: 'arn:aws:dynamodb:region:account:table/bar/stream/2',
                  destinations: {
                    onFailure: 'arn:aws:sns:region:account:snstopic',
                  },
                },
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
            Resource: [
              'arn:aws:dynamodb:region:account:table/foo/stream/1',
              'arn:aws:dynamodb:region:account:table/bar/stream/2',
            ],
          },
          {
            Effect: 'Allow',
            Action: ['sns:Publish'],
            Resource: ['arn:aws:sns:region:account:snstopic'],
          },
        ];

        awsCompileStreamEvents.compileStreamEvents();

        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement
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
                  parallelizationFactor: 10,
                },
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/bar',
                  batchWindow: 15,
                  maximumRetryAttempts: 5,
                },
              },
              {
                stream: 'arn:aws:kinesis:region:account:stream/baz',
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/buzz',
                  bisectBatchOnFunctionError: true,
                  maximumRecordAgeInSeconds: 180,
                },
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:table/fizz/stream/5',
                  destinations: {
                    onFailure: 'arn:aws:sns:region:account:snstopic',
                  },
                },
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/abc',
                  consumer: true,
                  startingPosition: 'AT_TIMESTAMP',
                  startingPositionTimestamp: 123,
                },
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/xyz',
                  consumer: 'arn:aws:kinesis:region:account:stream/xyz/consumer/foobar:1558544531',
                },
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/def',
                  consumer: false,
                },
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        // event 1
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.Properties.BatchSize
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.batchSize
        );
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.Properties.StartingPosition
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0].stream
            .startingPosition
        );
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.Properties.ParallelizationFactor
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[0].stream
            .parallelizationFactor
        );
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.Properties.Enabled
        ).to.equal(false);

        // event 2
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[1].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.ParallelizationFactor
        ).to.equal(undefined);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.MaximumBatchingWindowInSeconds
        ).to.equal(15);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.MaximumRetryAttempts
        ).to.equal(5);

        // event 3
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[2].stream);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Properties.BisectBatchOnFunctionError
        ).to.equal(undefined);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Properties.MaximumRecordAgeInSeconds
        ).to.equal(undefined);

        // event 4
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[3].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Properties.ParallelizationFactor
        ).to.equal(undefined);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Properties.BisectBatchOnFunctionError
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBuzz.Properties.MaximumRecordAgeInSeconds
        ).to.equal(180);

        // event 5
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFizz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFizz.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFizz.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFizz.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFizz.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFizz.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFizz.Properties.DestinationConfig.OnFailure
            .Destination
        ).to.equal(
          awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.destinations
            .onFailure
        );

        // event 6
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisAbc.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisAbc.DependsOn
        ).to.eql(['IamRoleLambdaExecution', 'FirstabcConsumerStreamConsumer']);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisAbc.Properties.EventSourceArn
        ).to.eql({ Ref: 'FirstabcConsumerStreamConsumer' });
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisAbc.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisAbc.Properties.StartingPosition
        ).to.equal('AT_TIMESTAMP');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisAbc.Properties.StartingPositionTimestamp
        ).to.equal(123);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisAbc.Properties.Enabled
        ).to.equal(true);

        // event 7
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisXyz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisXyz.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisXyz.Properties.EventSourceArn
        ).to.equal('arn:aws:kinesis:region:account:stream/xyz/consumer/foobar:1558544531');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisXyz.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisXyz.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisXyz.Properties.Enabled
        ).to.equal(true);

        // event 8
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.Properties.EventSourceArn
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[7].stream.arn);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.Properties.BisectBatchOnFunctionError
        ).to.equal(undefined);
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisDef.Properties.MaximumRecordAgeInSeconds
        ).to.equal(undefined);
      });

      it('should create stream consumer when a Kinesis stream with consumer "true" is given', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/abc',
                  consumer: true,
                },
              },
            ],
          },
        };

        awsCompileStreamEvents.compileStreamEvents();

        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstabcConsumerStreamConsumer.Type
        ).to.equal('AWS::Kinesis::StreamConsumer');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstabcConsumerStreamConsumer.Properties.ConsumerName
        ).to.equal('firstabcConsumer');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstabcConsumerStreamConsumer.Properties.StreamARN
        ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.arn);
      });

      it('should add the necessary IAM role statements', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: 'arn:aws:kinesis:region:account:stream/foo',
              },
              {
                stream: 'arn:aws:kinesis:region:account:stream/bar',
              },
              {
                stream: {
                  type: 'kinesis',
                  arn: 'arn:aws:kinesis:region:account:stream/fizz',
                  consumer: true,
                },
              },
              {
                stream: {
                  type: 'kinesis',
                  arn: 'arn:aws:kinesis:region:account:stream/buzz',
                  consumer: 'arn:aws:kinesis:region:account:stream/buzz/consumer/abc:1558544531',
                },
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
            Resource: [
              'arn:aws:kinesis:region:account:stream/foo',
              'arn:aws:kinesis:region:account:stream/bar',
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'kinesis:GetRecords',
              'kinesis:GetShardIterator',
              'kinesis:DescribeStreamSummary',
              'kinesis:ListShards',
            ],
            Resource: [
              'arn:aws:kinesis:region:account:stream/fizz',
              'arn:aws:kinesis:region:account:stream/buzz',
            ],
          },
          {
            Effect: 'Allow',
            Action: ['kinesis:SubscribeToShard'],
            Resource: [
              { Ref: 'FirstfizzConsumerStreamConsumer' },
              'arn:aws:kinesis:region:account:stream/buzz/consumer/abc:1558544531',
            ],
          },
        ];

        awsCompileStreamEvents.compileStreamEvents();

        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement
        ).to.deep.equal(iamRoleStatements);
      });

      it('should fail to compile EventSourceMapping resource properties for startingPosition AT_TIMESTAMP with no startingPositionTimestamp', () => {
        expect(() => {
          awsCompileStreamEvents.serverless.service.functions = {
            first: {
              events: [
                {
                  stream: {
                    arn: 'arn:aws:kinesis:region:account:stream/abc',
                    consumer: true,
                    startingPosition: 'AT_TIMESTAMP',
                  },
                },
              ],
            },
          };

          awsCompileStreamEvents.compileStreamEvents();
        }).to.throw(
          'You must specify startingPositionTimestamp for function: first when startingPosition is AT_TIMESTAMP'
        );
      });
    });

    it('should remove all non-alphanumerics from stream names for the resource logical ids', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 'arn:aws:kinesis:region:account:stream/some-long-name',
            },
          ],
        },
      };

      awsCompileStreamEvents.compileStreamEvents();

      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.have.any.keys('FirstEventSourceMappingKinesisSomelongname');
    });
  });
});

describe('test/unit/lib/plugins/aws/package/compile/events/stream.test.js', () => {
  describe('regular', () => {
    let eventSourceMappingResource;

    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            basic: {
              events: [
                {
                  stream: {
                    arn: 'arn:aws:kinesis:us-east-1:123456789012:stream/some-long-name',
                    functionResponseType: 'ReportBatchItemFailures',
                    tumblingWindowInSeconds: 30,
                    filterPatterns: [{ eventName: ['INSERT'] }, { eventName: ['MODIFY'] }],
                    parallelizationFactor: 10,
                    bisectBatchOnFunctionError: true,
                    consumer: true,
                  },
                },
              ],
            },
            dynamo: {
              handler: 'basic.handler',
              events: [
                {
                  stream: {
                    arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                    batchSize: 1,
                    startingPosition: 'LATEST',
                    enabled: false,
                    batchWindow: 15,
                    maximumRetryAttempts: 4,
                    maximumRecordAgeInSeconds: 120,
                    destinations: {
                      onFailure: 'arn:aws:sns:region:account:snstopic',
                    },
                  },
                },
              ],
            },
            kinesisImportCustomIam: {
              handler: 'basic.handler',
              role: {
                'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/iam-role-name',
              },
              events: [
                {
                  stream: {
                    arn: { 'Fn::ImportValue': 'ForeignKinesis' },
                    type: 'kinesis',
                    consumer:
                      'arn:aws:kinesis:region:account:stream/xyz/consumer/foobar:1558544531',
                  },
                },
              ],
            },
            arnVariants: {
              handler: 'basic.handler',
              events: [
                {
                  stream: {
                    arn: { 'Fn::GetAtt': ['SomeDdbTable', 'StreamArn'] },
                    type: 'dynamodb',
                    destinations: {
                      onFailure: {
                        arn: { 'Fn::ImportValue': 'ForeignSQS' },
                        type: 'sqs',
                      },
                    },
                  },
                },
                {
                  stream: {
                    arn: {
                      'Fn::Join': [
                        ':',
                        [
                          'arn',
                          'aws',
                          'kinesis',
                          {
                            Ref: 'AWS::Region',
                          },
                          {
                            Ref: 'AWS::AccountId',
                          },
                          'stream/MyStream',
                        ],
                      ],
                    },
                    type: 'kinesis',
                  },
                },
                {
                  stream: {
                    arn: { Ref: 'SomeDdbTableStreamArn' },
                    type: 'dynamodb',
                    destinations: {
                      onFailure: {
                        arn: { 'Fn::ImportValue': 'ForeignSQS' },
                        type: 'sqs',
                      },
                    },
                  },
                },
                {
                  stream: {
                    arn: { Ref: 'ForeignKinesisStreamArn' },
                    type: 'kinesis',
                  },
                },
              ],
            },
            destinationVariants: {
              handler: 'basic.handler',
              events: [
                {
                  stream: {
                    arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                    destinations: {
                      onFailure: {
                        arn: { 'Fn::GetAtt': ['SomeSNS', 'Arn'] },
                        type: 'sns',
                      },
                    },
                  },
                },
                {
                  stream: {
                    arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                    destinations: {
                      onFailure: {
                        arn: {
                          'Fn::Join': [
                            ':',
                            [
                              'arn',
                              'aws',
                              'sqs',
                              {
                                Ref: 'AWS::Region',
                              },
                              {
                                Ref: 'AWS::AccountId',
                              },
                              'MyQueue',
                            ],
                          ],
                        },
                        type: 'sqs',
                      },
                    },
                  },
                },
                {
                  stream: {
                    arn: 'arn:aws:dynamodb:region:account:table/buzz/stream/1',
                    destinations: {
                      onFailure: {
                        arn: { Ref: 'SomeSNSArn' },
                        type: 'sns',
                      },
                    },
                  },
                },
                {
                  stream: {
                    arn: 'arn:aws:dynamodb:region:account:table/fizz/stream/1',
                    destinations: {
                      onFailure: {
                        arn: { Ref: 'ForeignSQSArn' },
                        type: 'sqs',
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      const streamLogicalId = awsNaming.getStreamLogicalId('basic', 'kinesis', 'some-long-name');
      eventSourceMappingResource = cfTemplate.Resources[streamLogicalId];
    });

    it.skip('TODO: should support ARN String for `arn`', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453 (partially)
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1574-L1591
      //
      // Confirm effect of:
      // - `functions.basic.events[0].stream.arn`
      // - `functions.dynamodb.events[0].stream.arn`
    });

    it.skip('TODO: should support Fn::GetAtt for `arn`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L586-L741
      //
      // Confirm effect of `functions.arnVariants.events[0].stream.arn`
    });

    it.skip('TODO: should support Fn::ImportValue for `arn`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L586-L741
      //
      // Confirm effect of `functions.kinesisImportCustomIam.events[0].stream.arn`
    });

    it.skip('TODO: should support Fn::Join for `arn`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L586-L741
      //
      // Confirm effect of `functions.arnVariants.events[1].stream.arn`
    });

    it.skip('TODO: should support Ref for `arn`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L586-L741
      //
      // Confirm effect of:
      // - `functions.arnVariants.events[2].stream.arn`
      // - `functions.arnVariants.events[3].stream.arn`
    });

    it.skip('TODO: should support `batchSize`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L370-L584
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.dynamo.events[0].stream.batchSize`
    });

    it.skip('TODO: should support `startingPosition`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L370-L584
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.dynamo.events[0].stream.startingPosition`
    });

    it.skip('TODO: should support `enabled`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L370-L584
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.dynamo.events[0].stream.enabled`
    });

    it.skip('TODO: should support `batchWindow`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L370-L584
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.dynamo.events[0].stream.batchWindow`
    });

    it.skip('TODO: should support `maximumRetryAttempts`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L370-L584
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.dynamo.events[0].stream.maximumRetryAttempts`
    });

    it.skip('TODO: should support `maximumRecordAgeInSeconds`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L370-L584
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.dynamo.events[0].stream.maximumRecordAgeInSeconds`
    });

    it.skip('TODO: should support `parallelizationFactor`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.basic.events[0].stream.parallelizationFactor`
    });

    it.skip('TODO: should support `bisectBatchOnFunctionError`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1106-L1453
      //
      // Confirm effect of `functions.basic.events[0].stream.bisectBatchOnFunctionError`
    });

    it.skip('TODO: should support `consumer`', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1437-L1465
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1467-L1539 (partially)
      //
      // Confirm effect of:
      // - `functions.basic.events[0].stream.consumer`
      // - `functions.kinesisImportCustomIam.events[0].stream.consumer`
    });

    it.skip('TODO: should support ARN string for `destinations.onFailure`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L370-L584
      //
      // Confirm effect of: `functions.dynamo.events[0].stream.destinations`
    });

    it.skip('TODO: should support Fn::GetAtt for `destinations.onFailure`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L743-L916
      //
      // Confirm effect of: `functions.destinationVariants.events[0].stream.destinations`
    });

    it.skip('TODO: should support Fn::ImportValue for `destinations.onFailure`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L743-L916
      //
      // Confirm effect of: `functions.arnVariants.events[2].stream.destinations`
    });

    it.skip('TODO: should support Fn::Join for `destinations.onFailure`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L743-L916
      //
      // Confirm effect of: `functions.destinationVariants.events[1].stream.destinations`
    });

    it.skip('TODO: should support Ref for `destinations.onFailure`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L743-L916
      //
      // Confirm effect of:
      // - `functions.destinationVariants.events[2].stream.destinations`
      // - `functions.destinationVariants.events[3].stream.destinations`
    });

    it('should support `functionResponseType`', () => {
      expect(eventSourceMappingResource.Properties.FunctionResponseTypes).to.include.members([
        'ReportBatchItemFailures',
      ]);
    });

    it('should support `tumblingWindowInSeconds`', () => {
      expect(eventSourceMappingResource.Properties.TumblingWindowInSeconds).to.equal(30);
    });

    it('should support `filterPatterns`', () => {
      expect(eventSourceMappingResource.Properties.FilterCriteria).to.deep.equal({
        Filters: [
          {
            Pattern: JSON.stringify({ eventName: ['INSERT'] }),
          },
          {
            Pattern: JSON.stringify({ eventName: ['MODIFY'] }),
          },
        ],
      });
    });

    it.skip('TODO: should ensure necessary IAM statememnts', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L87-L366
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1056-L1103
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L1467-L1539 (partially)
      //
      // Confirm expected IAM statements on final role
    });
  });

  describe.skip('TODO: failures', () => {
    it("should fail if stream `type` is not set and couldn't be assumed", async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L918-L932
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L955-L969
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              basic: {
                events: [
                  {
                    stream: {
                      arn: { Ref: 'SomeDdbTableStreamArn' },
                    },
                  },
                ],
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property('code', 'TODO');
    });

    it("should fail if destination `type` is not set and couldn't be assumed", async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L934-L953
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L971-L990
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              basic: {
                events: [
                  {
                    stream: {
                      arn: 'arn:aws:dynamodb:region:account:table/fizz/stream/1',
                      destinations: {
                        onFailure: {
                          arn: { Ref: 'ForeignSQSArn' },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property('code', 'TODO');
    });
  });

  describe('with provisioned concurrency', () => {
    let naming;
    let eventSourceMappingResource;

    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            basic: {
              provisionedConcurrency: 1,
              events: [{ stream: 'arn:aws:kinesis:us-east-1:123456789012:stream/myStream' }],
            },
          },
        },
        command: 'package',
      });
      naming = awsNaming;
      const streamLogicalId = awsNaming.getStreamLogicalId('basic', 'kinesis', 'myStream');
      eventSourceMappingResource = cfTemplate.Resources[streamLogicalId];
    });

    it('should reference provisioned alias', () => {
      expect(eventSourceMappingResource.Properties.FunctionName).to.deep.equal({
        'Fn::Join': [
          ':',
          [
            {
              'Fn::GetAtt': ['BasicLambdaFunction', 'Arn'],
            },
            'provisioned',
          ],
        ],
      });
    });

    it('should depend on provisioned alias', () => {
      const aliasLogicalId = naming.getLambdaProvisionedConcurrencyAliasLogicalId('basic');
      expect(eventSourceMappingResource.DependsOn).to.include(aliasLogicalId);
    });
  });
});
