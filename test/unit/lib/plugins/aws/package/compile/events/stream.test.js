'use strict';

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
