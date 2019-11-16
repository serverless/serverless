'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileStreamEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileStreamEvents', () => {
  let serverless;
  let awsCompileStreamEvents;

  beforeEach(() => {
    serverless = new Serverless();
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

    it('should throw an error if the "arn" property contains an unsupported stream type', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:NOT-SUPPORTED:us-east-1:123456789012:stream/myStream',
              },
            },
          ],
        },
      };

      expect(() => awsCompileStreamEvents.compileStreamEvents()).to.throw(Error);
    });

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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.equal(roleLogicalId);
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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.equal(roleLogicalId);
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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      awsCompileStreamEvents.serverless.service.provider.role = {
        'Fn::GetAtt': [roleLogicalId, 'Arn'],
      };

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.equal(roleLogicalId);
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
      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      awsCompileStreamEvents.serverless.service.provider.role = roleLogicalId;

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingDynamodbFoo.DependsOn
      ).to.equal(roleLogicalId);
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
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbFoo.DependsOn
        ).to.equal('IamRoleLambdaExecution');
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
        ).to.equal('False');

        // event 2
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.DependsOn
        ).to.equal('IamRoleLambdaExecution');
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
        ).to.equal('True');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBar.Properties.MaximumBatchingWindowInSeconds
        ).to.equal(15);

        // event 3
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingDynamodbBaz.DependsOn
        ).to.equal('IamRoleLambdaExecution');
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
        ).to.equal('True');
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

      it('fails if keys other than Fn::GetAtt/ImportValue/Join are used for dynamic stream ARN', () => {
        awsCompileStreamEvents.serverless.service.functions = {
          first: {
            events: [
              {
                stream: {
                  type: 'dynamodb',
                  arn: {
                    'Fn::GetAtt': ['SomeDdbTable', 'StreamArn'],
                    'batchSize': 1,
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
                stream: 'arn:aws:dynamodb:region:account:table/bar/stream/2',
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
                },
              },
              {
                stream: {
                  arn: 'arn:aws:kinesis:region:account:stream/bar',
                  batchWindow: 15,
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
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisFoo.DependsOn
        ).to.equal('IamRoleLambdaExecution');
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
            .Resources.FirstEventSourceMappingKinesisFoo.Properties.Enabled
        ).to.equal('False');

        // event 2
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.DependsOn
        ).to.equal('IamRoleLambdaExecution');
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
            .Resources.FirstEventSourceMappingKinesisBar.Properties.StartingPosition
        ).to.equal('TRIM_HORIZON');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.Enabled
        ).to.equal('True');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBar.Properties.MaximumBatchingWindowInSeconds
        ).to.equal(15);

        // event 3
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FirstEventSourceMappingKinesisBaz.DependsOn
        ).to.equal('IamRoleLambdaExecution');
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
        ).to.equal('True');
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
        ];

        awsCompileStreamEvents.compileStreamEvents();

        expect(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement
        ).to.deep.equal(iamRoleStatements);
      });
    });

    it('should not create event source mapping when stream events are not given', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileStreamEvents.compileStreamEvents();

      // should be 1 because we've mocked the IamRoleLambdaExecution above
      expect(
        Object.keys(
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources
        ).length
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
        awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement.length
      ).to.equal(0);
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
