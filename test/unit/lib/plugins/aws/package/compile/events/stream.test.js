'use strict';

// const expect = require('chai').expect;
const { use: chaiUse, expect } = require('chai');
const chaiAsPromised = require('chai-as-promised');
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const AwsCompileStreamEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/stream');
const Serverless = require('../../../../../../../../lib/serverless');
const runServerless = require('../../../../../../../utils/run-serverless');

chaiUse(chaiAsPromised);

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
      // it('should create event source mappings when a DynamoDB stream ARN is given', () => {
      //   awsCompileStreamEvents.serverless.service.functions = {
      //     first: {
      //       events: [
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
      //             batchSize: 1,
      //             startingPosition: 'STARTING_POSITION_ONE',
      //             enabled: false,
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/bar/stream/2',
      //             batchWindow: 15,
      //             maximumRetryAttempts: 4,
      //           },
      //         },
      //         {
      //           stream: 'arn:aws:dynamodb:region:account:table/baz/stream/3',
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/buzz/stream/4',
      //             bisectBatchOnFunctionError: true,
      //             batchWindow: 0,
      //             maximumRecordAgeInSeconds: 120,
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/fizz/stream/5',
      //             destinations: {
      //               onFailure: 'arn:aws:sns:region:account:snstopic',
      //             },
      //           },
      //         },
      //       ],
      //     },
      //   };

      //   awsCompileStreamEvents.compileStreamEvents();

      //   // event 1
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFoo.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFoo.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFoo.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFoo.Properties.BatchSize
      //   ).to.equal(
      //     awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.batchSize
      //   );
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFoo.Properties.StartingPosition
      //   ).to.equal(
      //     awsCompileStreamEvents.serverless.service.functions.first.events[0].stream
      //       .startingPosition
      //   );
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFoo.Properties.Enabled
      //   ).to.equal(false);

      //   // event 2
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[1].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Properties.MaximumBatchingWindowInSeconds
      //   ).to.equal(15);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Properties.MaximumRetryAttempts
      //   ).to.equal(4);

      //   // event 3
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[2].stream);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Properties.BisectBatchOnFunctionError
      //   ).to.equal(undefined);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Properties.MaximumRecordAgeInSeconds
      //   ).to.equal(undefined);

      //   // event 4
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[3].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.BisectBatchOnFunctionError
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.MaximumRecordAgeInSeconds
      //   ).to.equal(120);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBuzz.Properties.MaximumBatchingWindowInSeconds
      //   ).to.equal(0);

      //   // event 5
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFizz.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFizz.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFizz.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFizz.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFizz.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFizz.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFizz.Properties.DestinationConfig.OnFailure
      //       .Destination
      //   ).to.equal(
      //     awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.destinations
      //       .onFailure
      //   );
      // });

      // it('should allow specifying OnFailure destinations as CFN reference types', () => {
      //   awsCompileStreamEvents.serverless.service.resources.Parameters = {
      //     SomeSNSArn: {
      //       Type: 'String',
      //     },
      //     ForeignSQSArn: {
      //       Type: 'String',
      //     },
      //   };
      //   awsCompileStreamEvents.serverless.service.functions = {
      //     first: {
      //       events: [
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
      //             destinations: {
      //               onFailure: {
      //                 arn: { 'Fn::GetAtt': ['SomeSNS', 'Arn'] },
      //                 type: 'sns',
      //               },
      //             },
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/bar/stream/1',
      //             destinations: {
      //               onFailure: {
      //                 arn: { 'Fn::ImportValue': 'ForeignSQS' },
      //                 type: 'sqs',
      //               },
      //             },
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/baz/stream/1',
      //             destinations: {
      //               onFailure: {
      //                 arn: {
      //                   'Fn::Join': [
      //                     ':',
      //                     [
      //                       'arn',
      //                       'aws',
      //                       'sqs',
      //                       {
      //                         Ref: 'AWS::Region',
      //                       },
      //                       {
      //                         Ref: 'AWS::AccountId',
      //                       },
      //                       'MyQueue',
      //                     ],
      //                   ],
      //                 },
      //                 type: 'sqs',
      //               },
      //             },
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/buzz/stream/1',
      //             destinations: {
      //               onFailure: {
      //                 arn: { Ref: 'SomeSNSArn' },
      //                 type: 'sns',
      //               },
      //             },
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:dynamodb:region:account:table/fizz/stream/1',
      //             destinations: {
      //               onFailure: {
      //                 arn: { Ref: 'ForeignSQSArn' },
      //                 type: 'sqs',
      //               },
      //             },
      //           },
      //         },
      //       ],
      //     },
      //   };

      //   awsCompileStreamEvents.compileStreamEvents();

      //   // sns with Fn::GetAtt
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbFoo.Properties.DestinationConfig.OnFailure
      //       .Destination
      //   ).to.deep.equal({ 'Fn::GetAtt': ['SomeSNS', 'Arn'] });
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[1]
      //   ).to.deep.equal({
      //     Action: ['sns:Publish'],
      //     Effect: 'Allow',
      //     Resource: [
      //       {
      //         'Fn::GetAtt': ['SomeSNS', 'Arn'],
      //       },
      //       {
      //         Ref: 'SomeSNSArn',
      //       },
      //     ],
      //   });

      //   // sqs with Fn::ImportValue
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBar.Properties.DestinationConfig.OnFailure
      //       .Destination
      //   ).to.deep.equal({ 'Fn::ImportValue': 'ForeignSQS' });

      //   // sqs with Fn::Join
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingDynamodbBaz.Properties.DestinationConfig.OnFailure
      //       .Destination
      //   ).to.deep.equal({
      //     'Fn::Join': [
      //       ':',
      //       [
      //         'arn',
      //         'aws',
      //         'sqs',
      //         {
      //           Ref: 'AWS::Region',
      //         },
      //         {
      //           Ref: 'AWS::AccountId',
      //         },
      //         'MyQueue',
      //       ],
      //     ],
      //   });

      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[2]
      //   ).to.deep.equal({
      //     Effect: 'Allow',
      //     Action: ['sqs:ListQueues', 'sqs:SendMessage'],
      //     Resource: [
      //       {
      //         'Fn::ImportValue': 'ForeignSQS',
      //       },
      //       {
      //         'Fn::Join': [
      //           ':',
      //           [
      //             'arn',
      //             'aws',
      //             'sqs',
      //             {
      //               Ref: 'AWS::Region',
      //             },
      //             {
      //               Ref: 'AWS::AccountId',
      //             },
      //             'MyQueue',
      //           ],
      //         ],
      //       },
      //       {
      //         Ref: 'ForeignSQSArn',
      //       },
      //     ],
      //   });
      // });

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
      // it('should create event source mappings when a Kinesis stream ARN is given', () => {
      //   awsCompileStreamEvents.serverless.service.functions = {
      //     first: {
      //       events: [
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:stream/foo',
      //             batchSize: 1,
      //             startingPosition: 'STARTING_POSITION_ONE',
      //             enabled: false,
      //             parallelizationFactor: 10,
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:stream/bar',
      //             batchWindow: 15,
      //             maximumRetryAttempts: 5,
      //           },
      //         },
      //         {
      //           stream: 'arn:aws:kinesis:region:account:stream/baz',
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:stream/buzz',
      //             bisectBatchOnFunctionError: true,
      //             maximumRecordAgeInSeconds: 180,
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:table/fizz/stream/5',
      //             destinations: {
      //               onFailure: 'arn:aws:sns:region:account:snstopic',
      //             },
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:stream/abc',
      //             consumer: true,
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:stream/xyz',
      //             consumer: 'arn:aws:kinesis:region:account:stream/xyz/consumer/foobar:1558544531',
      //           },
      //         },
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:stream/def',
      //             consumer: false,
      //           },
      //         },
      //       ],
      //     },
      //   };

      //   awsCompileStreamEvents.compileStreamEvents();

      //   // event 1
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFoo.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFoo.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFoo.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFoo.Properties.BatchSize
      //   ).to.equal(
      //     awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.batchSize
      //   );
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFoo.Properties.StartingPosition
      //   ).to.equal(
      //     awsCompileStreamEvents.serverless.service.functions.first.events[0].stream
      //       .startingPosition
      //   );
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFoo.Properties.ParallelizationFactor
      //   ).to.equal(
      //     awsCompileStreamEvents.serverless.service.functions.first.events[0].stream
      //       .parallelizationFactor
      //   );
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFoo.Properties.Enabled
      //   ).to.equal(false);

      //   // event 2
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[1].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Properties.ParallelizationFactor
      //   ).to.equal(undefined);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Properties.MaximumBatchingWindowInSeconds
      //   ).to.equal(15);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBar.Properties.MaximumRetryAttempts
      //   ).to.equal(5);

      //   // event 3
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[2].stream);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.Properties.BisectBatchOnFunctionError
      //   ).to.equal(undefined);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBaz.Properties.MaximumRecordAgeInSeconds
      //   ).to.equal(undefined);

      //   // event 4
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[3].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Properties.ParallelizationFactor
      //   ).to.equal(undefined);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Properties.BisectBatchOnFunctionError
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisBuzz.Properties.MaximumRecordAgeInSeconds
      //   ).to.equal(180);

      //   // event 5
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFizz.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFizz.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFizz.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFizz.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFizz.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFizz.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisFizz.Properties.DestinationConfig.OnFailure
      //       .Destination
      //   ).to.equal(
      //     awsCompileStreamEvents.serverless.service.functions.first.events[4].stream.destinations
      //       .onFailure
      //   );

      //   // event 6
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisAbc.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisAbc.DependsOn
      //   ).to.eql(['IamRoleLambdaExecution', 'FirstabcConsumerStreamConsumer']);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisAbc.Properties.EventSourceArn
      //   ).to.eql({ Ref: 'FirstabcConsumerStreamConsumer' });
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisAbc.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisAbc.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisAbc.Properties.Enabled
      //   ).to.equal(true);

      //   // event 7
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisXyz.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisXyz.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisXyz.Properties.EventSourceArn
      //   ).to.equal('arn:aws:kinesis:region:account:stream/xyz/consumer/foobar:1558544531');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisXyz.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisXyz.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisXyz.Properties.Enabled
      //   ).to.equal(true);

      //   // event 8
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.Type
      //   ).to.equal('AWS::Lambda::EventSourceMapping');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.DependsOn
      //   ).to.include('IamRoleLambdaExecution');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.Properties.EventSourceArn
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[7].stream.arn);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.Properties.BatchSize
      //   ).to.equal(10);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.Properties.StartingPosition
      //   ).to.equal('TRIM_HORIZON');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.Properties.Enabled
      //   ).to.equal(true);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.Properties.BisectBatchOnFunctionError
      //   ).to.equal(undefined);
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstEventSourceMappingKinesisDef.Properties.MaximumRecordAgeInSeconds
      //   ).to.equal(undefined);
      // });

      // it('should create stream consumer when a Kinesis stream with consumer "true" is given', () => {
      //   awsCompileStreamEvents.serverless.service.functions = {
      //     first: {
      //       events: [
      //         {
      //           stream: {
      //             arn: 'arn:aws:kinesis:region:account:stream/abc',
      //             consumer: true,
      //           },
      //         },
      //       ],
      //     },
      //   };

      //   awsCompileStreamEvents.compileStreamEvents();

      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstabcConsumerStreamConsumer.Type
      //   ).to.equal('AWS::Kinesis::StreamConsumer');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstabcConsumerStreamConsumer.Properties.ConsumerName
      //   ).to.equal('firstabcConsumer');
      //   expect(
      //     awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //       .Resources.FirstabcConsumerStreamConsumer.Properties.StreamARN
      //   ).to.equal(awsCompileStreamEvents.serverless.service.functions.first.events[0].stream.arn);
      // });

      //   it('should add the necessary IAM role statements', () => {
      //     awsCompileStreamEvents.serverless.service.functions = {
      //       first: {
      //         events: [
      //           {
      //             stream: 'arn:aws:kinesis:region:account:stream/foo',
      //           },
      //           {
      //             stream: 'arn:aws:kinesis:region:account:stream/bar',
      //           },
      //           {
      //             stream: {
      //               type: 'kinesis',
      //               arn: 'arn:aws:kinesis:region:account:stream/fizz',
      //               consumer: true,
      //             },
      //           },
      //           {
      //             stream: {
      //               type: 'kinesis',
      //               arn: 'arn:aws:kinesis:region:account:stream/buzz',
      //               consumer: 'arn:aws:kinesis:region:account:stream/buzz/consumer/abc:1558544531',
      //             },
      //           },
      //         ],
      //       },
      //     };

      //     const iamRoleStatements = [
      //       {
      //         Effect: 'Allow',
      //         Action: [
      //           'kinesis:GetRecords',
      //           'kinesis:GetShardIterator',
      //           'kinesis:DescribeStream',
      //           'kinesis:ListStreams',
      //         ],
      //         Resource: [
      //           'arn:aws:kinesis:region:account:stream/foo',
      //           'arn:aws:kinesis:region:account:stream/bar',
      //         ],
      //       },
      //       {
      //         Effect: 'Allow',
      //         Action: [
      //           'kinesis:GetRecords',
      //           'kinesis:GetShardIterator',
      //           'kinesis:DescribeStreamSummary',
      //           'kinesis:ListShards',
      //         ],
      //         Resource: [
      //           'arn:aws:kinesis:region:account:stream/fizz',
      //           'arn:aws:kinesis:region:account:stream/buzz',
      //         ],
      //       },
      //       {
      //         Effect: 'Allow',
      //         Action: ['kinesis:SubscribeToShard'],
      //         Resource: [
      //           { Ref: 'FirstfizzConsumerStreamConsumer' },
      //           'arn:aws:kinesis:region:account:stream/buzz/consumer/abc:1558544531',
      //         ],
      //       },
      //     ];

      //     awsCompileStreamEvents.compileStreamEvents();

      //     expect(
      //       awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
      //         .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement
      //     ).to.deep.equal(iamRoleStatements);
      //   });
      // });

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
          awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources
        ).to.have.any.keys('FirstEventSourceMappingKinesisSomelongname');
      });
    });
  });

  describe.only('test/unit/lib/plugins/aws/package/compile/events/stream.test.js', () => {
    describe('regular', () => {
      let eventSourceMappingResource;
      let eventSourceMappingResourceDynamoDB;
      let arnCfGetAttEventSourceMappingResource;
      let arnCfJoinEventSourceMappingResource;
      let arnCfRefEventSourceMappingResourceDynamoDB;
      let arnCfRefEventSourceMappingResourceKinesis;
      let destinationGetAttSourceMappingResource;
      let destinationRefSourceMappingResourceBuzz;
      let destinationRefSourceMappingResourceFizz;
      let iamRoleLambdaExecution;

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

        const streamLogicalIdKinesis = awsNaming.getStreamLogicalId(
          'basic',
          'kinesis',
          'some-long-name'
        );
        eventSourceMappingResource = cfTemplate.Resources[streamLogicalIdKinesis];

        const streamLogicalIdDynamoDB = awsNaming.getStreamLogicalId('dynamo', 'dynamodb', 'foo');
        eventSourceMappingResourceDynamoDB = cfTemplate.Resources[streamLogicalIdDynamoDB];

        const arnCfGetAttLogicalId = awsNaming.getStreamLogicalId(
          'arnVariants',
          'dynamodb',
          'SomeDdbTable'
        );
        arnCfGetAttEventSourceMappingResource = cfTemplate.Resources[arnCfGetAttLogicalId];

        const destinationGetAttLogicalId = awsNaming.getStreamLogicalId(
          'destinationVariants',
          'dynamodb',
          'foo'
        );
        destinationGetAttSourceMappingResource = cfTemplate.Resources[destinationGetAttLogicalId];

        const arnCfJoinLogicalId = awsNaming.getStreamLogicalId(
          'arnVariants',
          'kinesis',
          'MyStream'
        );
        arnCfJoinEventSourceMappingResource = cfTemplate.Resources[arnCfJoinLogicalId];

        const arnCfRefLogicalIdDynamoDB = awsNaming.getStreamLogicalId(
          'arnVariants',
          'dynamodb',
          'SomeDdbTableStreamArn'
        );
        arnCfRefEventSourceMappingResourceDynamoDB =
          cfTemplate.Resources[arnCfRefLogicalIdDynamoDB];

        const arnCfRefLogicalIdKinesis = awsNaming.getStreamLogicalId(
          'arnVariants',
          'kinesis',
          'ForeignKinesisStreamArn'
        );
        arnCfRefEventSourceMappingResourceKinesis = cfTemplate.Resources[arnCfRefLogicalIdKinesis];

        const destinationRefLogicalIdBuzz = awsNaming.getStreamLogicalId(
          'destinationVariants',
          'dynamodb',
          'buzz'
        );
        destinationRefSourceMappingResourceBuzz = cfTemplate.Resources[destinationRefLogicalIdBuzz];

        const destinationRefLogicalIdFizz = awsNaming.getStreamLogicalId(
          'destinationVariants',
          'dynamodb',
          'fizz'
        );
        destinationRefSourceMappingResourceFizz = cfTemplate.Resources[destinationRefLogicalIdFizz];

        iamRoleLambdaExecution = cfTemplate.Resources.IamRoleLambdaExecution;
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

      it('should support Fn::GetAtt for `arn`', () => {
        const getAttStreamArn = { 'Fn::GetAtt': ['SomeDdbTable', 'StreamArn'] };
        expect(
          arnCfGetAttEventSourceMappingResource.Properties.EventSourceArn['Fn::GetAtt']
        ).to.deep.equal(getAttStreamArn['Fn::GetAtt']);
      });

      it.skip('TODO: should support Fn::ImportValue for `arn`', () => {
        // Replaces partially
        // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/stream.test.js#L586-L741
        //
        // Confirm effect of `functions.kinesisImportCustomIam.events[0].stream.arn`
      });

      it('should support Fn::Join for `arn`', () => {
        const cfJoinArn = {
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
        };
        expect(
          arnCfJoinEventSourceMappingResource.Properties.EventSourceArn['Fn::Join']
        ).to.deep.equal(cfJoinArn['Fn::Join']);
      });

      it('should support Ref for `arn`', () => {
        const cfRefArnDb = { Ref: 'SomeDdbTableStreamArn' };
        const cfRefArnKinesis = { Ref: 'ForeignKinesisStreamArn' };

        expect(
          arnCfRefEventSourceMappingResourceDynamoDB.Properties.EventSourceArn.Ref
        ).to.deep.equal(cfRefArnDb.Ref);

        expect(
          arnCfRefEventSourceMappingResourceKinesis.Properties.EventSourceArn.Ref
        ).to.deep.equal(cfRefArnKinesis.Ref);
      });

      it('should support `batchSize`', () => {
        const requestedBatchSize = 1;
        expect(eventSourceMappingResourceDynamoDB.Properties.BatchSize).to.equal(
          requestedBatchSize
        );
      });

      it('should support `startingPosition`', () => {
        const requestedStartingPosition = 'LATEST';
        expect(eventSourceMappingResourceDynamoDB.Properties.StartingPosition).to.equal(
          requestedStartingPosition
        );
      });

      it('should support `enabled`', () => {
        const requestedEnabled = false;
        expect(eventSourceMappingResourceDynamoDB.Properties.Enabled).to.equal(requestedEnabled);
      });

      it('should support `batchWindow`', () => {
        const requestedBatchWindow = 15;
        expect(
          eventSourceMappingResourceDynamoDB.Properties.MaximumBatchingWindowInSeconds
        ).to.equal(requestedBatchWindow);
      });

      it('should support `maximumRetryAttempts`', () => {
        const requestedMaximumRetryAttempts = 4;
        expect(eventSourceMappingResourceDynamoDB.Properties.MaximumRetryAttempts).to.equal(
          requestedMaximumRetryAttempts
        );
      });

      it('should support `maximumRecordAgeInSeconds`', () => {
        const requestedMaximumRecordAgeInSeconds = 120;
        expect(eventSourceMappingResourceDynamoDB.Properties.MaximumRecordAgeInSeconds).to.equal(
          requestedMaximumRecordAgeInSeconds
        );
      });

      it('should support `parallelizationFactor`', () => {
        const requestedParallelizationFactor = 10;
        expect(eventSourceMappingResource.Properties.ParallelizationFactor).to.equal(
          requestedParallelizationFactor
        );
      });

      it('should support `bisectBatchOnFunctionError`', () => {
        const requestedBisectBatchOnFunctionError = true;
        expect(eventSourceMappingResource.Properties.BisectBatchOnFunctionError).to.equal(
          requestedBisectBatchOnFunctionError
        );
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

      it('should support ARN string for `destinations.onFailure`', () => {
        const requestedDestinationsOnFailure = 'arn:aws:sns:region:account:snstopic';
        expect(
          eventSourceMappingResourceDynamoDB.Properties.DestinationConfig.OnFailure.Destination
        ).to.equal(requestedDestinationsOnFailure);
      });

      it('should support Fn::GetAtt for `destinations.onFailure`', () => {
        const requestedDestinationsOnFailure = { 'Fn::GetAtt': ['SomeSNS', 'Arn'] };
        expect(
          destinationGetAttSourceMappingResource.Properties.DestinationConfig.OnFailure.Destination[
            'Fn::GetAtt'
          ]
        ).to.deep.equal(requestedDestinationsOnFailure['Fn::GetAtt']);
      });

      it('should support Fn::ImportValue for `destinations.onFailure`', () => {
        const requestedDestinationsOnFailure = { 'Fn::ImportValue': 'ForeignSQS' };
        expect(
          arnCfRefEventSourceMappingResourceDynamoDB.Properties.DestinationConfig.OnFailure
            .Destination['Fn::ImportValue']
        ).to.deep.equal(requestedDestinationsOnFailure['Fn::ImportValue']);
      });

      it('should support Fn::Join for `destinations.onFailure`', () => {
        const requestedDestinationsOnFailure = {
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
        };

        expect(
          destinationGetAttSourceMappingResource.Properties.DestinationConfig.OnFailure.Destination[
            'Fn::Join'
          ]
        ).to.deep.equal(requestedDestinationsOnFailure['Fn::Join']);
      });

      it('should support Ref for `destinations.onFailure`', () => {
        const cfRefArnBuzz = { Ref: 'SomeSNSArn' };
        expect(
          destinationRefSourceMappingResourceBuzz.Properties.DestinationConfig.OnFailure.Destination
            .Ref
        ).to.deep.equal(cfRefArnBuzz.Ref);

        const cfRefArnFizz = { Ref: 'ForeignSQSArn' };
        expect(
          destinationRefSourceMappingResourceFizz.Properties.DestinationConfig.OnFailure.Destination
            .Ref
        ).to.deep.equal(cfRefArnFizz.Ref);
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

      it('should ensure necessary IAM statememnts', () => {
        const iamRoleStatements = [
          {
            Effect: 'Allow',
            Action: [
              'dynamodb:GetRecords',
              'dynamodb:GetShardIterator',
              'dynamodb:DescribeStream',
              'dynamodb:ListStreams',
            ],
            Resource: ['arn:aws:dynamodb:region:account:table/foo/stream/1'],
          },
          {
            Effect: 'Allow',
            Action: ['sns:Publish'],
            Resource: ['arn:aws:sns:region:account:snstopic'],
          },
          {
            Effect: 'Allow',
            Action: [
              'kinesis:GetRecords',
              'kinesis:GetShardIterator',
              'kinesis:DescribeStreamSummary',
              'kinesis:ListShards',
            ],
            Resource: ['arn:aws:kinesis:us-east-1:123456789012:stream/some-long-name'],
          },
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
              'arn:aws:dynamodb:region:account:table/foo/stream/1',
              'arn:aws:dynamodb:region:account:table/buzz/stream/1',
              'arn:aws:dynamodb:region:account:table/fizz/stream/1',
            ],
          },
        ];

        expect(
          iamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement
        ).to.deep.include.members(iamRoleStatements);
      });
    });

    describe('failures', () => {
      it("should fail if stream `type` is not set and couldn't be assumed", async () => {
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
        ).to.be.eventually.rejected.and.have.property(
          'code',
          'INVALID_NON_SCHEMA_COMPLIANT_CONFIGURATION'
        );
      });

      it("should fail if destination `type` is not set and couldn't be assumed", async () => {
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
        ).to.be.eventually.rejected.and.have.property(
          'code',
          'INVALID_NON_SCHEMA_COMPLIANT_CONFIGURATION'
        );
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
        const streamLogicalIdKinesis = awsNaming.getStreamLogicalId('basic', 'kinesis', 'myStream');
        eventSourceMappingResource = cfTemplate.Resources[streamLogicalIdKinesis];
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
});
