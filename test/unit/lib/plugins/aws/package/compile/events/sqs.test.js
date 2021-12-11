'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const AwsCompileSQSEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/sqs');
const Serverless = require('../../../../../../../../lib/Serverless');
const runServerless = require('../../../../../../../utils/run-serverless');

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

  describe('#compileSQSEvents()', () => {
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
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyFirstQueue.DependsOn
        ).to.have.lengthOf(1);
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
        ).to.equal(false);

        // event 2
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMySecondQueue.DependsOn
        ).to.have.lengthOf(1);
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
        ).to.equal(true);

        // event 3
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.Type
        ).to.equal('AWS::Lambda::EventSourceMapping');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.DependsOn
        ).to.include('IamRoleLambdaExecution');
        expect(
          awsCompileSQSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FirstEventSourceMappingSQSMyThirdQueue.DependsOn
        ).to.have.lengthOf(1);
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
        ).to.equal(true);
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

describe('test/unit/lib/plugins/aws/package/compile/events/sqs.test.js', () => {
  describe('regular configuration', () => {
    let eventSourceMappingResource;

    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            basic: {
              events: [
                {
                  sqs: {
                    arn: 'arn:aws:sqs:region:account:some-queue-name',
                    batchSize: 10,
                    maximumBatchingWindow: 100,
                    functionResponseType: 'ReportBatchItemFailures',
                  },
                },
              ],
            },
            directArn: {
              handler: 'basic.handler',
              events: [{ sqs: 'arn:aws:sqs:region:account:MyQueue' }],
            },
            arnCfGetAtt: {
              handler: 'basic.handler',
              events: [{ sqs: { arn: { 'Fn::GetAtt': ['SomeQueue', 'Arn'] } } }],
            },
            arnCfImport: {
              handler: 'basic.handler',
              events: [{ sqs: { arn: { 'Fn::ImportValue': 'ForeignQueue' } } }],
            },
            arnCfJoin: {
              handler: 'basic.handler',
              events: [
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
          },
        },
        command: 'package',
      });
      const queueLogicalId = awsNaming.getQueueLogicalId('basic', 'some-queue-name');
      eventSourceMappingResource = cfTemplate.Resources[queueLogicalId];
    });

    it.skip('TODO: should suport direct ARN string', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L302-L405
      //
      // Confirm effect of functions.directArn.events[0].sqs`
    });

    it.skip('TODO: should suport `arn` (string)', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L302-L405 (partially)
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L576-L593
      // Confirm effect of `functions.basic.events[0].sqs.arn`
    });

    it.skip('TODO: should suport `arn` (CF Fn::GetAtt)', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L407-L508
      //
      // Confirm effect of `functions.arnCfGetAtt.events[0].sqs.arn`
    });

    it.skip('TODO: should suport `arn` (CF Fn::ImportValue)', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L407-L508
      //
      // Confirm effect of `functions.arnCfImport.events[0].sqs.arn`
    });

    it.skip('TODO: should suport `arn` (CF Fn::Join)', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L407-L508
      //
      // Confirm effect of `functions.arnCfJoin.events[0].sqs.arn`
    });

    it.skip('TODO: should suport `batchSize`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L302-L405
      //
      // Confirm effect  of`functions.basic.events[0].sqs.batchSize`
    });

    it('should suport `functionResponseType`', () => {
      expect(eventSourceMappingResource.Properties.FunctionResponseTypes).to.include.members([
        'ReportBatchItemFailures',
      ]);
    });

    it.skip('TODO: should ensure necessary IAM statememnts', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/f64f7c68abb1d6837ecaa6173f4b605cf3975acf/test/unit/lib/plugins/aws/package/compile/events/sqs.test.js#L510-L542
      //
      // Confirm expected IAM statements on final role
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
              events: [
                {
                  sqs: {
                    arn: 'arn:aws:sqs:region:account:MyQueue',
                    batchSize: 10,
                    maximumBatchingWindow: 100,
                    filterPatterns: [{ a: [1, 2] }, { b: [3, 4] }],
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      naming = awsNaming;
      const queueLogicalId = awsNaming.getQueueLogicalId('basic', 'MyQueue');
      eventSourceMappingResource = cfTemplate.Resources[queueLogicalId];
    });

    it('should reference provisioned alias', () => {
      expect(
        JSON.stringify(eventSourceMappingResource.Properties.FunctionName['Fn::Join'])
      ).to.include('provisioned');
    });

    it('should depend on provisioned alias', () => {
      const aliasLogicalId = naming.getLambdaProvisionedConcurrencyAliasLogicalId('basic');
      expect(eventSourceMappingResource.DependsOn).to.include(aliasLogicalId);
    });

    it('should have correct batch size', () => {
      expect(eventSourceMappingResource.Properties.BatchSize).to.equal(10);
    });

    it('should have correct batching window size', () => {
      expect(eventSourceMappingResource.Properties.MaximumBatchingWindowInSeconds).to.equal(100);
    });

    it('should have correct filtering patterns', () => {
      expect(eventSourceMappingResource.Properties.FilterCriteria).to.deep.equal({
        Filters: [
          {
            Pattern: JSON.stringify({ a: [1, 2] }),
          },
          {
            Pattern: JSON.stringify({ b: [3, 4] }),
          },
        ],
      });
    });
  });

  it('should not depend on default IAM role when custom role defined', async () => {
    const { awsNaming, cfTemplate } = await runServerless({
      fixture: 'function',
      configExt: {
        provider: {
          iam: {
            role: {
              'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/iam-role-name',
            },
          },
        },
        functions: {
          basic: {
            events: [
              {
                sqs: {
                  arn: 'arn:aws:sqs:region:account:MyQueue',
                },
              },
            ],
          },
        },
      },
      command: 'package',
    });

    const queueLogicalId = awsNaming.getQueueLogicalId('basic', 'MyQueue');
    const eventSourceMappingResource = cfTemplate.Resources[queueLogicalId];

    expect(eventSourceMappingResource.DependsOn).to.deep.equal([]);
  });
});
