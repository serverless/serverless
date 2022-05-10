'use strict';

const expect = require('chai').expect;
const runServerless = require('../../../../../../../utils/run-serverless');

describe('test/unit/lib/plugins/aws/package/compile/events/sqs.test.js', () => {
  describe('regular configuration', () => {
    let directArnEventSourceMappingResource;
    let basicEventSourceMappingResource;
    let arnCfGetAttEventSourceMappingResource;
    let arnCfImportEventSourceMappingResource;
    let arnCfJoinEventSourceMappingResource;
    let iamRoleLambdaExecution;

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
      const directArnFunctionLogicalId = awsNaming.getQueueLogicalId('directArn', 'MyQueue');
      directArnEventSourceMappingResource = cfTemplate.Resources[directArnFunctionLogicalId];

      const basicFunctionLogicalId = awsNaming.getQueueLogicalId('basic', 'some-queue-name');
      basicEventSourceMappingResource = cfTemplate.Resources[basicFunctionLogicalId];

      const arnCfGetAttLogicalId = awsNaming.getQueueLogicalId('arnCfGetAtt', 'SomeQueue');
      arnCfGetAttEventSourceMappingResource = cfTemplate.Resources[arnCfGetAttLogicalId];

      const arnCfImportLogicalId = awsNaming.getQueueLogicalId('arnCfImport', 'ForeignQueue');
      arnCfImportEventSourceMappingResource = cfTemplate.Resources[arnCfImportLogicalId];

      const arnCfJoinLogicalId = awsNaming.getQueueLogicalId('arnCfJoin', 'MyQueue');
      arnCfJoinEventSourceMappingResource = cfTemplate.Resources[arnCfJoinLogicalId];

      iamRoleLambdaExecution = cfTemplate.Resources.IamRoleLambdaExecution;
    });

    it('should suport direct ARN string', () => {
      const directSqsArn = 'arn:aws:sqs:region:account:MyQueue';
      expect(directArnEventSourceMappingResource.Properties.EventSourceArn).to.equal(directSqsArn);
    });

    it('should support `arn` (string)', () => {
      const basicSqsArn = 'arn:aws:sqs:region:account:some-queue-name';
      expect(basicEventSourceMappingResource.Properties.EventSourceArn).to.equal(basicSqsArn);
    });

    it('should suport `arn` (CF Fn::GetAtt)', () => {
      const getAttSqsArn = { 'Fn::GetAtt': ['SomeQueue', 'Arn'] };
      expect(
        arnCfGetAttEventSourceMappingResource.Properties.EventSourceArn['Fn::GetAtt']
      ).to.deep.equal(getAttSqsArn['Fn::GetAtt']);
    });

    it('should suport `arn` (CF Fn::ImportValue)', () => {
      const cfImportArn = { 'Fn::ImportValue': 'ForeignQueue' };
      expect(
        arnCfImportEventSourceMappingResource.Properties.EventSourceArn['Fn::ImportValue']
      ).to.deep.equal(cfImportArn['Fn::ImportValue']);
    });

    it('should suport `arn` (CF Fn::Join)', () => {
      const cfJoinArn = {
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
        arnCfJoinEventSourceMappingResource.Properties.EventSourceArn['Fn::Join']
      ).to.deep.equal(cfJoinArn['Fn::Join']);
    });

    it('should suport `batchSize`', () => {
      const requestedBatchSize = 10;
      expect(basicEventSourceMappingResource.Properties.BatchSize).to.equal(requestedBatchSize);
    });

    it('should suport `functionResponseType`', () => {
      const requestedFunctionResponseType = 'ReportBatchItemFailures';
      expect(basicEventSourceMappingResource.Properties.FunctionResponseTypes).to.include.members([
        requestedFunctionResponseType,
      ]);
    });

    it('should ensure necessary IAM statememnts', () => {
      const iamRoleStatments = [
        {
          Effect: 'Allow',
          Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Resource: ['arn:aws:sqs:region:account:some-queue-name'],
        },
        {
          Effect: 'Allow',
          Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Resource: ['arn:aws:sqs:region:account:MyQueue'],
        },
        {
          Effect: 'Allow',
          Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Resource: [{ 'Fn::GetAtt': ['SomeQueue', 'Arn'] }],
        },
        {
          Effect: 'Allow',
          Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Resource: [{ 'Fn::ImportValue': 'ForeignQueue' }],
        },
        {
          Effect: 'Allow',
          Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Resource: [
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
        },
      ];
      expect(
        iamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement
      ).to.deep.include.members(iamRoleStatments);
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
