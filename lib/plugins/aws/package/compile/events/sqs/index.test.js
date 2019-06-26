'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileSQSEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileSQSEvents', () => {
  let serverless;
  let awsCompileSQSEvents;

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
    awsCompileSQSEvents = new AwsCompileSQSEvents(serverless);
    awsCompileSQSEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to be an instance of AwsProvider', () =>
      expect(awsCompileSQSEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileSQSEvents()', () => {
    it('should throw an error if sqs event type is not a string or an object', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 42,
            },
          ],
        },
      };

      expect(() => awsCompileSQSEvents.compileSQSEvents()).to.throw(Error);
    });

    it('should throw an error if the "arn" property is not given', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: {
                arn: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileSQSEvents.compileSQSEvents()).to.throw(Error);
    });

    it('should not throw error or merge role statements if default policy is not present', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:queueName',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role is set in function', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          role: 'arn:aws:iam::account:role/foo',
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn
      ).to.be.instanceof(Array);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn.length
      ).to.equal(0);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role name reference is set in function', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          role: roleLogicalId,
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn
      ).to.equal(roleLogicalId);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role reference is set in function', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          role: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn
      ).to.equal(roleLogicalId);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role is set in provider', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      awsCompileSQSEvents.serverless.service.provider.role = 'arn:aws:iam::account:role/foo';

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn
      ).to.be.instanceof(Array);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn.length
      ).to.equal(0);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if IAM role is imported', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          role: { 'Fn::ImportValue': 'ExportedRoleId' },
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn.length
      ).to.equal(0);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role reference is set in provider', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      awsCompileSQSEvents.serverless.service.provider.role = {
        'Fn::GetAtt': [roleLogicalId, 'Arn'],
      };

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn
      ).to.equal(roleLogicalId);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    it('should not throw error if custom IAM role name reference is set in provider', () => {
      const roleLogicalId = 'RoleLogicalId';
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:MyQueue',
            },
          ],
        },
      };

      // pretend that the default IamRoleLambdaExecution is not in place
      awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = null;

      awsCompileSQSEvents.serverless.service.provider.role = roleLogicalId;

      expect(() => {
        awsCompileSQSEvents.compileSQSEvents();
      }).to.not.throw(Error);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstEventSourceMappingSQSMyQueue.DependsOn
      ).to.equal(roleLogicalId);
      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution
      ).to.equal(null);
    });

    describe('when a queue ARN is given', () => {
      it('should create event source mappings when a queue ARN is given', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyFirstQueue',
                  batchSize: 1,
                  enabled: false,
                },
              },
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MySecondQueue',
                },
              },
              {
                sqs: 'arn:aws:sqs:region:account:MyThirdQueue',
              },
            ],
          },
        };

        awsCompileSQSEvents.compileSQSEvents();

        // event 1
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyFirstQueue.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyFirstQueue.DependsOn
        ).to.equal('IamRoleLambdaExecution');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyFirstQueue.Properties.EventSourceArn
        ).to.equal(awsCompileSQSEvents.serverless.service.functions.first.events[0].sqs.arn);
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyFirstQueue.Properties.BatchSize
        ).to.equal(awsCompileSQSEvents.serverless.service.functions.first.events[0].sqs.batchSize);
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyFirstQueue.Properties.Enabled
        ).to.equal('False');

        // event 2
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.DependsOn
        ).to.equal('IamRoleLambdaExecution');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.Properties.EventSourceArn
        ).to.equal(awsCompileSQSEvents.serverless.service.functions.first.events[1].sqs.arn);
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.Properties.Enabled
        ).to.equal('True');

        // event 3
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.DependsOn
        ).to.equal('IamRoleLambdaExecution');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.Properties.EventSourceArn
        ).to.equal(awsCompileSQSEvents.serverless.service.functions.first.events[2].sqs);
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.Properties.BatchSize
        ).to.equal(10);
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.Properties.Enabled
        ).to.equal('True');
      });

      it('should allow specifying SQS Queues as CFN reference types', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: { 'Fn::GetAtt': ['SomeQueue', 'Arn'] },
                },
              },
              {
                sqs: {
                  arn: { 'Fn::ImportValue': 'ForeignQueue' },
                },
              },
              {
                sqs: {
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
                },
              },
            ],
          },
        };

        awsCompileSQSEvents.compileSQSEvents();

        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[0]
        ).to.deep.equal({
          Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Effect: 'Allow',
          Resource: [
            {
              'Fn::GetAtt': ['SomeQueue', 'Arn'],
            },
            {
              'Fn::ImportValue': 'ForeignQueue',
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
          ],
        });
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSSomeQueue.Properties.EventSourceArn
        ).to.deep.equal({ 'Fn::GetAtt': ['SomeQueue', 'Arn'] });
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSForeignQueue.Properties.EventSourceArn
        ).to.deep.equal({ 'Fn::ImportValue': 'ForeignQueue' });
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyQueue.Properties.EventSourceArn
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
      });

      it('fails if keys other than Fn::GetAtt/ImportValue/Join are used for dynamic ARNs', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: {
                  arn: {
                    'Fn::GetAtt': ['SomeQueue', 'Arn'],
                    'batchSize': 1,
                  },
                },
              },
            ],
          },
        };

        expect(() => awsCompileSQSEvents.compileSQSEvents()).to.throw(Error);
      });

      it('should add the necessary IAM role statements', () => {
        awsCompileSQSEvents.serverless.service.functions = {
          first: {
            events: [
              {
                sqs: 'arn:aws:sqs:region:account:MyFirstQueue',
              },
              {
                sqs: 'arn:aws:sqs:region:account:MySecondQueue',
              },
            ],
          },
        };

        const iamRoleStatements = [
          {
            Effect: 'Allow',
            Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
            Resource: [
              'arn:aws:sqs:region:account:MyFirstQueue',
              'arn:aws:sqs:region:account:MySecondQueue',
            ],
          },
        ];

        awsCompileSQSEvents.compileSQSEvents();

        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement
        ).to.deep.equal(iamRoleStatements);
      });
    });

    it('should not create event source mapping when sqs events are not given', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileSQSEvents.compileSQSEvents();

      // should be 1 because we've mocked the IamRoleLambdaExecution above
      expect(
        Object.keys(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        ).length
      ).to.equal(1);
    });

    it('should not add the IAM role statements when sqs events are not given', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileSQSEvents.compileSQSEvents();

      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement.length
      ).to.equal(0);
    });

    it('should remove all non-alphanumerics from queue names for the resource logical ids', () => {
      awsCompileSQSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sqs: 'arn:aws:sqs:region:account:some-queue-name',
            },
          ],
        },
      };

      awsCompileSQSEvents.compileSQSEvents();

      expect(
        awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.have.any.keys('FirstEventSourceMappingSQSSomequeuename');
    });
  });
});
