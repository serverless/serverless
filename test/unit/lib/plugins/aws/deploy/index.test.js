'use strict';

const chai = require('chai');
const sinon = require('sinon');

const runServerless = require('../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('test/unit/lib/plugins/aws/deploy/index.test.js', () => {
  const baseAwsRequestStubMap = {
    STS: {
      getCallerIdentity: {
        ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
        UserId: 'XXXXXXXXXXXXXXXXXXXXX',
        Account: '999999999999',
        Arn: 'arn:aws:iam::999999999999:user/test',
      },
    },
  };

  describe('with direct create/update calls', () => {
    it('with nonexistent stack - first deploy', async () => {
      const describeStacksStub = sinon
        .stub()
        .onFirstCall()
        .throws('error', 'stack does not exist')
        .onSecondCall()
        .resolves({ Stacks: [{}] });
      const createStackStub = sinon.stub().resolves({});
      const updateStackStub = sinon.stub().resolves({});
      const s3UploadStub = sinon.stub().resolves();
      const deleteObjectsStub = sinon.stub().resolves({});
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: deleteObjectsStub,
          listObjectsV2: { Contents: [] },
          upload: s3UploadStub,
          headBucket: {},
        },
        CloudFormation: {
          describeStacks: describeStacksStub,
          createStack: createStackStub,
          updateStack: updateStackStub,
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'CREATE_COMPLETE',
              },
            ],
          },
          describeStackResource: {
            StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        configExt: {
          provider: {
            deploymentMethod: 'direct',
          },
        },
      });

      expect(createStackStub).to.be.calledOnce;
      expect(updateStackStub).to.be.calledOnce;
      const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
        call[0].Key.endsWith('compiled-cloudformation-template.json')
      );
      expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
      expect(deleteObjectsStub).not.to.be.called;
    });

    it('with nonexistent stack - first deploy with custom deployment bucket', async () => {
      const describeStacksStub = sinon
        .stub()
        .onFirstCall()
        .throws('error', 'stack does not exist')
        .onSecondCall()
        .resolves({ Stacks: [{}] });
      const createStackStub = sinon.stub().resolves({});
      const updateStackStub = sinon.stub().resolves({});
      const s3UploadStub = sinon.stub().resolves();
      const deleteObjectsStub = sinon.stub().resolves({});
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: deleteObjectsStub,
          listObjectsV2: { Contents: [] },
          upload: s3UploadStub,
          headBucket: {},
          getBucketLocation: () => {
            return {
              LocationConstraint: 'us-east-1',
            };
          },
        },
        CloudFormation: {
          describeStacks: describeStacksStub,
          createStack: createStackStub,
          updateStack: updateStackStub,
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'CREATE_COMPLETE',
              },
            ],
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        configExt: {
          provider: {
            deploymentBucket: 'existing-s3-bucket',
            deploymentMethod: 'direct',
          },
        },
      });

      expect(createStackStub).to.be.calledOnce;
      expect(updateStackStub).not.to.be.called;
      const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
        call[0].Key.endsWith('compiled-cloudformation-template.json')
      );
      expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
      expect(deleteObjectsStub).not.to.be.called;
    });

    it('with existing stack - subsequent deploy', async () => {
      const s3BucketPrefix = 'serverless/test-aws-deploy-with-existing-stack/dev';
      const s3UploadStub = sinon.stub().resolves();
      const createStackStub = sinon.stub().resolves({});
      const updateStackStub = sinon.stub().resolves({});
      const listObjectsV2Stub = sinon
        .stub()
        .onFirstCall()
        .resolves({ Contents: [] })
        .onSecondCall()
        .resolves({
          Contents: [
            {
              Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
            },
            {
              Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/artifact.zip`,
            },
            {
              Key: `${s3BucketPrefix}/1589988704352-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
            },
            {
              Key: `${s3BucketPrefix}/1589988704352-2020-05-20T15:31:44.359Z/artifact.zip`,
            },
          ],
        });
      const deleteObjectsStub = sinon.stub().resolves();
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: deleteObjectsStub,
          listObjectsV2: listObjectsV2Stub,
          upload: s3UploadStub,
          headBucket: {},
        },
        CloudFormation: {
          describeStacks: { Stacks: [{}] },
          createStack: createStackStub,
          updateStack: updateStackStub,
          describeChangeSet: {
            ChangeSetName: 'new-service-dev-change-set',
            ChangeSetId: 'some-change-set-id',
            StackName: 'new-service-dev',
            Status: 'CREATE_COMPLETE',
          },
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'UPDATE_COMPLETE',
              },
            ],
          },
          describeStackResource: {
            StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        configExt: {
          // Default, non-deterministic service-name invalidates this test as S3 Bucket cleanup relies on it
          service: 'test-aws-deploy-with-existing-stack',
          provider: {
            deploymentMethod: 'direct',
            deploymentBucket: {
              maxPreviousDeploymentArtifacts: 1,
            },
          },
        },
      });

      expect(createStackStub).not.to.be.called;
      expect(updateStackStub).to.be.calledOnce;
      const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
        call[0].Key.endsWith('compiled-cloudformation-template.json')
      );
      expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
      expect(deleteObjectsStub).to.be.calledWithExactly({
        Bucket: 's3-bucket-resource',
        Delete: {
          Objects: [
            {
              Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
            },
            { Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/artifact.zip` },
          ],
        },
      });
    });

    it('with existing stack - with deployment bucket resource missing from CloudFormation template', async () => {
      const createStackStub = sinon.stub().resolves({});
      const updateStackStub = sinon.stub().resolves({});
      const describeStackResourceStub = sinon
        .stub()
        .onFirstCall()
        .throws(() => {
          const err = new Error('does not exist for stack');
          err.providerError = {
            code: 'ValidationError',
          };
          return err;
        })
        .onSecondCall()
        .resolves({
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        });

      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          listObjectsV2: { Contents: [] },
          headBucket: () => {
            const err = new Error();
            err.code = 'AWS_S3_HEAD_BUCKET_NOT_FOUND';
            throw err;
          },
        },
        CloudFormation: {
          describeStacks: { Stacks: [{}] },
          validateTemplate: {},
          createStack: createStackStub,
          updateStack: updateStackStub,
          getTemplate: () => {
            return {
              TemplateBody: JSON.stringify({}),
            };
          },
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'UPDATE_COMPLETE',
              },
            ],
          },
          describeStackResource: describeStackResourceStub,
        },
      };

      const { serverless, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        configExt: {
          provider: {
            deploymentMethod: 'direct',
          },
        },
        lastLifecycleHookName: 'aws:deploy:deploy:checkForChanges',
      });

      expect(createStackStub).not.to.be.called;
      expect(updateStackStub).to.be.calledWithExactly({
        StackName: awsNaming.getStackName(),
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        Parameters: [],
        NotificationARNs: [],
        Tags: [{ Key: 'STAGE', Value: 'dev' }],
        TemplateBody: JSON.stringify({
          Resources: serverless.service.provider.coreCloudFormationTemplate.Resources,
          Outputs: serverless.service.provider.coreCloudFormationTemplate.Outputs,
        }),
      });
    });

    describe('custom deployment-related properties', () => {
      let createStackStub;
      let updateStackStub;
      const deploymentRole = 'arn:xxx';
      const notificationArns = ['arn:xxx', 'arn:yyy'];
      const stackParameters = [
        {
          ParameterKey: 'key',
          ParameterValue: 'val',
        },
        {
          ParameterKey: 'key2',
          ParameterValue: 'val2',
        },
      ];

      const stackPolicy = [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['Update:*'],
          Resource: '*',
        },
      ];

      const rollbackConfiguration = {
        MonitoringTimeInMinutes: 20,
      };

      const disableRollback = true;
      const stackTags = {
        TAG: 'value',
        ANOTHERTAG: 'anotherval',
      };

      before(async () => {
        const describeStacksStub = sinon
          .stub()
          .onFirstCall()
          .throws('error', 'stack does not exist')
          .onSecondCall()
          .resolves({ Stacks: [{}] });
        createStackStub = sinon.stub().resolves({});
        updateStackStub = sinon.stub().resolves({});
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            describeRepositories: sinon.stub().throws({
              providerError: { code: 'RepositoryNotFoundException' },
            }),
          },
          S3: {
            deleteObjects: {},
            listObjectsV2: { Contents: [] },
            upload: {},
            headBucket: {},
          },
          CloudFormation: {
            describeStacks: describeStacksStub,
            createStack: createStackStub,
            updateStack: updateStackStub,
            describeStackEvents: {
              StackEvents: [
                {
                  EventId: '1e2f3g4h',
                  StackName: 'new-service-dev',
                  LogicalResourceId: 'new-service-dev',
                  ResourceType: 'AWS::CloudFormation::Stack',
                  Timestamp: new Date(),
                  ResourceStatus: 'CREATE_COMPLETE',
                },
              ],
            },
            describeStackResource: {
              StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
            },
            validateTemplate: {},
            listStackResources: {},
          },
        };

        await runServerless({
          fixture: 'function',
          command: 'deploy',
          awsRequestStubMap,
          configExt: {
            provider: {
              deploymentMethod: 'direct',
              notificationArns,
              rollbackConfiguration,
              stackParameters,
              stackPolicy,
              stackTags,
              disableRollback,
              iam: {
                deploymentRole,
              },
            },
          },
        });
      });

      it('should support custom deployment role', () => {
        expect(createStackStub.getCall(0).args[0].RoleARN).to.equal(deploymentRole);
        expect(updateStackStub.getCall(0).args[0].RoleARN).to.equal(deploymentRole);
      });

      it('should support `notificationsArns`', () => {
        expect(createStackStub.getCall(0).args[0].NotificationARNs).to.deep.equal(notificationArns);
        expect(updateStackStub.getCall(0).args[0].NotificationARNs).to.deep.equal(notificationArns);
      });

      it('should support `stackParameters`', () => {
        expect(createStackStub.getCall(0).args[0].Parameters).to.deep.equal(stackParameters);
        expect(updateStackStub.getCall(0).args[0].Parameters).to.deep.equal(stackParameters);
      });

      it('should support `stackPolicy`', () => {
        expect(updateStackStub.getCall(0).args[0].StackPolicyBody).to.deep.equal(
          JSON.stringify({ Statement: stackPolicy })
        );
      });

      it('should support `rollbackConfiguration`', () => {
        expect(updateStackStub.getCall(0).args[0].RollbackConfiguration).to.deep.equal(
          rollbackConfiguration
        );
      });

      it('should support `disableRollback`', () => {
        expect(createStackStub.getCall(0).args[0].DisableRollback).to.be.true;
        expect(updateStackStub.getCall(0).args[0].DisableRollback).to.be.true;
      });

      it('should support `stackTags`', () => {
        expect(createStackStub.getCall(0).args[0].Tags).to.deep.equal([
          { Key: 'STAGE', Value: 'dev' },
          { Key: 'TAG', Value: 'value' },
          { Key: 'ANOTHERTAG', Value: 'anotherval' },
        ]);
        expect(updateStackStub.getCall(0).args[0].Tags).to.deep.equal([
          { Key: 'STAGE', Value: 'dev' },
          { Key: 'TAG', Value: 'value' },
          { Key: 'ANOTHERTAG', Value: 'anotherval' },
        ]);
      });
    });
  });

  describe('with change-sets', () => {
    it('with nonexistent stack - first deploy with custom deployment bucket', async () => {
      const describeStacksStub = sinon
        .stub()
        .onFirstCall()
        .throws('error', 'stack does not exist')
        .onSecondCall()
        .resolves({ Stacks: [{}] });
      const createChangeSetStub = sinon.stub().resolves({});
      const executeChangeSetStub = sinon.stub().resolves({});
      const s3UploadStub = sinon.stub().resolves();
      const deleteObjectsStub = sinon.stub().resolves({});
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: deleteObjectsStub,
          listObjectsV2: { Contents: [] },
          upload: s3UploadStub,
          headBucket: {},
          getBucketLocation: () => {
            return {
              LocationConstraint: 'us-east-1',
            };
          },
        },
        CloudFormation: {
          describeStacks: describeStacksStub,
          createChangeSet: createChangeSetStub,
          executeChangeSet: executeChangeSetStub,
          deleteChangeSet: {},
          describeChangeSet: {
            ChangeSetName: 'new-service-dev-change-set',
            ChangeSetId: 'some-change-set-id',
            StackName: 'new-service-dev',
            Status: 'CREATE_COMPLETE',
          },
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'CREATE_COMPLETE',
              },
            ],
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        configExt: {
          provider: {
            deploymentBucket: 'existing-s3-bucket',
          },
        },
      });

      expect(createChangeSetStub).to.be.calledOnce;
      expect(createChangeSetStub.getCall(0).args[0].ChangeSetType).to.equal('CREATE');
      expect(executeChangeSetStub).to.be.calledOnce;
      const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
        call[0].Key.endsWith('compiled-cloudformation-template.json')
      );
      expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
      expect(deleteObjectsStub).not.to.be.called;
    });

    it('with nonexistent stack - first deploy', async () => {
      const describeStacksStub = sinon
        .stub()
        .onFirstCall()
        .throws('error', 'stack does not exist')
        .onSecondCall()
        .resolves({ Stacks: [{}] });
      const createChangeSetStub = sinon.stub().resolves({});
      const executeChangeSetStub = sinon.stub().resolves({});
      const s3UploadStub = sinon.stub().resolves();
      const deleteObjectsStub = sinon.stub().resolves({});
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: deleteObjectsStub,
          listObjectsV2: { Contents: [] },
          upload: s3UploadStub,
          headBucket: {},
        },
        CloudFormation: {
          describeStacks: describeStacksStub,
          createChangeSet: createChangeSetStub,
          executeChangeSet: executeChangeSetStub,
          deleteChangeSet: {},
          describeChangeSet: {
            ChangeSetName: 'new-service-dev-change-set',
            ChangeSetId: 'some-change-set-id',
            StackName: 'new-service-dev',
            Status: 'CREATE_COMPLETE',
          },
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'CREATE_COMPLETE',
              },
            ],
          },
          describeStackResource: {
            StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
      });

      expect(createChangeSetStub).to.be.calledTwice;
      expect(createChangeSetStub.getCall(0).args[0].ChangeSetType).to.equal('CREATE');
      expect(createChangeSetStub.getCall(1).args[0].ChangeSetType).to.equal('UPDATE');
      expect(executeChangeSetStub).to.be.calledTwice;
      const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
        call[0].Key.endsWith('compiled-cloudformation-template.json')
      );
      expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
      expect(deleteObjectsStub).not.to.be.called;
    });

    it('with existing stack - subsequent deploy', async () => {
      const s3BucketPrefix = 'serverless/test-aws-deploy-with-existing-stack/dev';
      const s3UploadStub = sinon.stub().resolves();
      const createChangeSetStub = sinon.stub().resolves({});
      const executeChangeSetStub = sinon.stub().resolves({});
      const listObjectsV2Stub = sinon
        .stub()
        .onFirstCall()
        .resolves({ Contents: [] })
        .onSecondCall()
        .resolves({
          Contents: [
            {
              Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
            },
            {
              Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/artifact.zip`,
            },
            {
              Key: `${s3BucketPrefix}/1589988704352-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
            },
            {
              Key: `${s3BucketPrefix}/1589988704352-2020-05-20T15:31:44.359Z/artifact.zip`,
            },
          ],
        });
      const deleteObjectsStub = sinon.stub().resolves();
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: deleteObjectsStub,
          listObjectsV2: listObjectsV2Stub,
          upload: s3UploadStub,
          headBucket: {},
        },
        CloudFormation: {
          describeStacks: { Stacks: [{}] },
          deleteChangeSet: {},
          createChangeSet: createChangeSetStub,
          executeChangeSet: executeChangeSetStub,
          describeChangeSet: {
            ChangeSetName: 'new-service-dev-change-set',
            ChangeSetId: 'some-change-set-id',
            StackName: 'new-service-dev',
            Status: 'CREATE_COMPLETE',
          },
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'UPDATE_COMPLETE',
              },
            ],
          },
          describeStackResource: {
            StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        configExt: {
          // Default, non-deterministic service-name invalidates this test as S3 Bucket cleanup relies on it
          service: 'test-aws-deploy-with-existing-stack',
          provider: {
            deploymentBucket: {
              maxPreviousDeploymentArtifacts: 1,
            },
          },
        },
      });

      expect(createChangeSetStub).to.be.calledOnce;
      expect(createChangeSetStub.getCall(0).args[0].ChangeSetType).to.equal('UPDATE');
      expect(executeChangeSetStub).to.be.calledOnce;
      const wasCloudFormationTemplateUploadInitiated = s3UploadStub.args.some((call) =>
        call[0].Key.endsWith('compiled-cloudformation-template.json')
      );
      expect(wasCloudFormationTemplateUploadInitiated).to.be.true;
      expect(deleteObjectsStub).to.be.calledWithExactly({
        Bucket: 's3-bucket-resource',
        Delete: {
          Objects: [
            {
              Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
            },
            { Key: `${s3BucketPrefix}/1589988704351-2020-05-20T15:31:44.359Z/artifact.zip` },
          ],
        },
      });
    });

    it('with existing stack - subsequent deploy with empty changeset', async () => {
      const createChangeSetStub = sinon.stub().resolves({});
      const executeChangeSetStub = sinon.stub().resolves({});
      const deleteChangeSetStub = sinon.stub().resolves();
      const deleteObjectsStub = sinon.stub().resolves();
      let objectsToRemove;
      const listObjectsV2Stub = sinon
        .stub()
        .onFirstCall()
        .resolves({ Contents: [] })
        .onSecondCall()
        .callsFake((params) => {
          objectsToRemove = [
            {
              Key: `${params.Prefix}/compiled-cloudformation-template.json`,
            },
            {
              Key: `${params.Prefix}/artifact.zip`,
            },
          ];
          return {
            Contents: objectsToRemove,
          };
        });
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: deleteObjectsStub,
          listObjectsV2: listObjectsV2Stub,
          upload: {},
          headBucket: {},
        },
        CloudFormation: {
          describeStacks: { Stacks: [{}] },
          deleteChangeSet: deleteChangeSetStub,
          createChangeSet: createChangeSetStub,
          executeChangeSet: executeChangeSetStub,
          describeChangeSet: {
            ChangeSetName: 'new-service-dev-change-set',
            ChangeSetId: 'some-change-set-id',
            StackName: 'new-service-dev',
            Status: 'FAILED',
            StatusReason: 'No updates are to be performed.',
          },
          describeStackResource: {
            StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
      });

      expect(createChangeSetStub).to.be.calledOnce;
      expect(createChangeSetStub.getCall(0).args[0].ChangeSetType).to.equal('UPDATE');
      expect(executeChangeSetStub).not.to.be.called;
      expect(deleteChangeSetStub).to.be.calledTwice;
      expect(deleteObjectsStub).to.be.calledWithExactly({
        Bucket: 's3-bucket-resource',
        Delete: { Objects: objectsToRemove },
      });
    });

    it('should fail if cannot create a change set', async () => {
      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteObjects: {},
          listObjectsV2: { Contents: [] },
          upload: {},
          headBucket: {},
        },
        CloudFormation: {
          describeStacks: { Stacks: [{}] },
          deleteChangeSet: {},
          createChangeSet: {},
          executeChangeSet: {},
          describeChangeSet: {
            ChangeSetName: 'new-service-dev-change-set',
            ChangeSetId: 'some-change-set-id',
            StackName: 'new-service-dev',
            Status: 'FAILED',
            StatusReason: 'Some internal reason',
          },
          describeStackResource: {
            StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
          },
          validateTemplate: {},
          listStackResources: {},
        },
      };

      await expect(
        runServerless({
          fixture: 'function',
          command: 'deploy',
          awsRequestStubMap,
        })
      ).to.have.been.eventually.rejected.with.property(
        'code',
        'AWS_CLOUD_FORMATION_CHANGE_SET_CREATION_FAILED'
      );
    });

    it('with existing stack - with deployment bucket resource missing from CloudFormation template', async () => {
      const createChangeSetStub = sinon.stub().resolves({});
      const executeChangeSetStub = sinon.stub().resolves({});
      const describeStackResourceStub = sinon
        .stub()
        .onFirstCall()
        .throws(() => {
          const err = new Error('does not exist for stack');
          err.providerError = {
            code: 'ValidationError',
          };
          return err;
        })
        .onSecondCall()
        .resolves({
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        });

      const awsRequestStubMap = {
        ...baseAwsRequestStubMap,
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          listObjectsV2: { Contents: [] },
          headBucket: () => {
            const err = new Error();
            err.code = 'AWS_S3_HEAD_BUCKET_NOT_FOUND';
            throw err;
          },
        },
        CloudFormation: {
          describeStacks: { Stacks: [{}] },
          validateTemplate: {},
          deleteChangeSet: {},
          createChangeSet: createChangeSetStub,
          executeChangeSet: executeChangeSetStub,
          describeChangeSet: {
            ChangeSetName: 'new-service-dev-change-set',
            ChangeSetId: 'some-change-set-id',
            StackName: 'new-service-dev',
            Status: 'CREATE_COMPLETE',
          },
          getTemplate: () => {
            return {
              TemplateBody: JSON.stringify({}),
            };
          },
          describeStackEvents: {
            StackEvents: [
              {
                EventId: '1e2f3g4h',
                StackName: 'new-service-dev',
                LogicalResourceId: 'new-service-dev',
                ResourceType: 'AWS::CloudFormation::Stack',
                Timestamp: new Date(),
                ResourceStatus: 'UPDATE_COMPLETE',
              },
            ],
          },
          describeStackResource: describeStackResourceStub,
        },
      };

      const { serverless, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        lastLifecycleHookName: 'aws:deploy:deploy:checkForChanges',
      });

      expect(createChangeSetStub).to.be.calledWithExactly({
        StackName: awsNaming.getStackName(),
        ChangeSetName: awsNaming.getStackChangeSetName(),
        ChangeSetType: 'UPDATE',
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        Parameters: [],
        NotificationARNs: [],
        Tags: [{ Key: 'STAGE', Value: 'dev' }],
        TemplateBody: JSON.stringify({
          Resources: serverless.service.provider.coreCloudFormationTemplate.Resources,
          Outputs: serverless.service.provider.coreCloudFormationTemplate.Outputs,
        }),
      });
      expect(executeChangeSetStub).to.be.calledWithExactly({
        StackName: awsNaming.getStackName(),
        ChangeSetName: awsNaming.getStackChangeSetName(),
      });
    });

    describe('custom deployment-related properties', () => {
      let createChangeSetStub;
      let executeChangeSetStub;
      let setStackPolicyStub;
      const deploymentRole = 'arn:xxx';
      const notificationArns = ['arn:xxx', 'arn:yyy'];
      const stackParameters = [
        {
          ParameterKey: 'key',
          ParameterValue: 'val',
        },
        {
          ParameterKey: 'key2',
          ParameterValue: 'val2',
        },
      ];

      const stackPolicy = [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: ['Update:*'],
          Resource: '*',
        },
      ];

      const rollbackConfiguration = {
        MonitoringTimeInMinutes: 20,
      };

      const disableRollback = true;
      const stackTags = {
        TAG: 'value',
        ANOTHERTAG: 'anotherval',
      };

      before(async () => {
        const describeStacksStub = sinon
          .stub()
          .onFirstCall()
          .throws('error', 'stack does not exist')
          .onSecondCall()
          .resolves({ Stacks: [{}] });
        createChangeSetStub = sinon.stub().resolves({});
        executeChangeSetStub = sinon.stub().resolves({});
        setStackPolicyStub = sinon.stub().resolves({});
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            describeRepositories: sinon.stub().throws({
              providerError: { code: 'RepositoryNotFoundException' },
            }),
          },
          S3: {
            deleteObjects: {},
            listObjectsV2: { Contents: [] },
            upload: {},
            headBucket: {},
          },
          CloudFormation: {
            describeStacks: describeStacksStub,
            createChangeSet: createChangeSetStub,
            executeChangeSet: executeChangeSetStub,
            deleteChangeSet: {},
            describeChangeSet: {
              ChangeSetName: 'new-service-dev-change-set',
              ChangeSetId: 'some-change-set-id',
              StackName: 'new-service-dev',
              Status: 'CREATE_COMPLETE',
            },
            setStackPolicy: setStackPolicyStub,
            describeStackEvents: {
              StackEvents: [
                {
                  EventId: '1e2f3g4h',
                  StackName: 'new-service-dev',
                  LogicalResourceId: 'new-service-dev',
                  ResourceType: 'AWS::CloudFormation::Stack',
                  Timestamp: new Date(),
                  ResourceStatus: 'CREATE_COMPLETE',
                },
              ],
            },
            describeStackResource: {
              StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
            },
            validateTemplate: {},
            listStackResources: {},
          },
        };

        await runServerless({
          fixture: 'function',
          command: 'deploy',
          awsRequestStubMap,
          configExt: {
            provider: {
              notificationArns,
              rollbackConfiguration,
              stackParameters,
              stackPolicy,
              stackTags,
              disableRollback,
              iam: {
                deploymentRole,
              },
            },
          },
        });
      });

      it('should support custom deployment role', () => {
        expect(createChangeSetStub.getCall(0).args[0].RoleARN).to.equal(deploymentRole);
        expect(createChangeSetStub.getCall(1).args[0].RoleARN).to.equal(deploymentRole);
      });

      it('should support `notificationsArns`', () => {
        expect(createChangeSetStub.getCall(0).args[0].NotificationARNs).to.deep.equal(
          notificationArns
        );
        expect(createChangeSetStub.getCall(1).args[0].NotificationARNs).to.deep.equal(
          notificationArns
        );
      });

      it('should support `stackParameters`', () => {
        expect(createChangeSetStub.getCall(1).args[0].Parameters).to.deep.equal(stackParameters);
      });

      it('should support `stackPolicy`', () => {
        expect(setStackPolicyStub.getCall(0).args[0].StackPolicyBody).to.equal(
          JSON.stringify({ Statement: stackPolicy })
        );
      });

      it('should only set `stackPolicy` after applying change set', () => {
        expect(setStackPolicyStub).to.not.be.calledBefore(executeChangeSetStub);
      });

      it('should support `rollbackConfiguration`', () => {
        expect(createChangeSetStub.getCall(1).args[0].RollbackConfiguration).to.deep.equal(
          rollbackConfiguration
        );
      });

      it('should support `disableRollback`', () => {
        expect(executeChangeSetStub.getCall(0).args[0].DisableRollback).to.be.true;
        expect(executeChangeSetStub.getCall(1).args[0].DisableRollback).to.be.true;
      });

      it('should support `stackTags`', () => {
        expect(createChangeSetStub.getCall(0).args[0].Tags).to.deep.equal([
          { Key: 'STAGE', Value: 'dev' },
          { Key: 'TAG', Value: 'value' },
          { Key: 'ANOTHERTAG', Value: 'anotherval' },
        ]);
        expect(createChangeSetStub.getCall(1).args[0].Tags).to.deep.equal([
          { Key: 'STAGE', Value: 'dev' },
          { Key: 'TAG', Value: 'value' },
          { Key: 'ANOTHERTAG', Value: 'anotherval' },
        ]);
      });
    });
  });

  it('with existing stack - should skip deploy if nothing changed', async () => {
    const s3UploadStub = sinon.stub().resolves();

    const listObjectsV2Stub = sinon.stub().resolves({
      Contents: [
        {
          Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json',
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
        {
          Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/serverless-state.json',
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
        {
          Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/my-own.zip',
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
      ],
    });
    const s3HeadObjectStub = sinon.stub();
    s3HeadObjectStub
      .withArgs({
        Bucket: 's3-bucket-resource',
        Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json',
      })
      .returns({
        Metadata: { filesha256: 'qxp+iwSTMhcRUfHzka4AE4XAWawS8GnEyBh1WpGb7Vw=' },
      });
    s3HeadObjectStub
      .withArgs({
        Bucket: 's3-bucket-resource',
        Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/serverless-state.json',
      })
      .returns({
        Metadata: { filesha256: 'JZ0oWM9ZWnYOxa3CRNeBRE5HAg+Q9RSwdxcKbik33d8=' },
      });

    s3HeadObjectStub
      .withArgs({
        Bucket: 's3-bucket-resource',
        Key: 'serverless/test-package-artifact/dev/1589988704359-2020-05-20T15:31:44.359Z/my-own.zip',
      })
      .returns({
        Metadata: { filesha256: 'T0qEYHOE4Xv2E8Ar03xGogAlElcdf/dQh/lh9ao7Glo=' },
      });

    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      S3: {
        headObject: s3HeadObjectStub,
        listObjectsV2: listObjectsV2Stub,
        upload: s3UploadStub,
        headBucket: {},
      },
      CloudFormation: {
        describeStacks: { Stacks: [{}] },
        describeStackEvents: {
          StackEvents: [
            {
              EventId: '1e2f3g4h',
              StackName: 'new-service-dev',
              LogicalResourceId: 'new-service-dev',
              ResourceType: 'AWS::CloudFormation::Stack',
              Timestamp: new Date(),
              ResourceStatus: 'UPDATE_COMPLETE',
            },
          ],
        },
        describeStackResource: {
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        },
        validateTemplate: {},
        listStackResources: {},
      },
    };

    const { serverless } = await runServerless({
      fixture: 'package-artifact-in-serverless-dir',
      command: 'deploy',
      awsRequestStubMap,
      configExt: {
        // Default, non-deterministic service-name invalidates this test
        service: 'test-aws-deploy-should-be-skipped',
      },
    });

    expect(serverless.service.provider.shouldNotDeploy).to.be.true;
    expect(s3UploadStub).to.not.be.called;
  });

  it('with existing stack - missing custom deployment bucket', async () => {
    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      ECR: {
        describeRepositories: sinon.stub().throws({
          providerError: { code: 'RepositoryNotFoundException' },
        }),
      },
      S3: {
        getBucketLocation: () => {
          throw new Error();
        },
      },
      CloudFormation: {
        describeStacks: { Stacks: [{}] },
        validateTemplate: {},
      },
    };

    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        lastLifecycleHookName: 'aws:deploy:deploy:checkForChanges',
        configExt: {
          provider: {
            deploymentBucket: 'bucket-name',
          },
        },
      })
    ).to.eventually.have.been.rejected.and.have.property('code', 'DEPLOYMENT_BUCKET_NOT_FOUND');
  });

  it('with existing stack - with custom deployment bucket in different region', async () => {
    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      ECR: {
        describeRepositories: sinon.stub().throws({
          providerError: { code: 'RepositoryNotFoundException' },
        }),
      },
      S3: {
        getBucketLocation: () => {
          return {
            LocationConstraint: 'us-west-1',
          };
        },
      },
      CloudFormation: {
        describeStacks: { Stacks: [{}] },
        validateTemplate: {},
      },
    };

    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        lastLifecycleHookName: 'aws:deploy:deploy:checkForChanges',
        configExt: {
          provider: {
            deploymentBucket: 'bucket-name',
          },
        },
      })
    ).to.eventually.have.been.rejected.and.have.property(
      'code',
      'DEPLOYMENT_BUCKET_INVALID_REGION'
    );
  });

  it('with existing stack - with deployment bucket from CloudFormation deleted manually', async () => {
    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      ECR: {
        describeRepositories: sinon.stub().throws({
          providerError: { code: 'RepositoryNotFoundException' },
        }),
      },
      S3: {
        headBucket: () => {
          const err = new Error();
          err.code = 'AWS_S3_HEAD_BUCKET_NOT_FOUND';
          throw err;
        },
      },
      CloudFormation: {
        describeStacks: { Stacks: [{}] },
        validateTemplate: {},
        describeStackResource: {
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        },
      },
    };

    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        lastLifecycleHookName: 'aws:deploy:deploy:checkForChanges',
      })
    ).to.eventually.have.been.rejected.and.have.property(
      'code',
      'DEPLOYMENT_BUCKET_REMOVED_MANUALLY'
    );
  });

  it('should throw when deployment bucket cannot be accessed', async () => {
    const awsRequestStubMap = {
      ...baseAwsRequestStubMap,
      ECR: {
        describeRepositories: sinon.stub().throws({
          providerError: { code: 'RepositoryNotFoundException' },
        }),
      },
      S3: {
        headBucket: () => {
          const err = new Error();
          err.code = 'AWS_S3_HEAD_BUCKET_FORBIDDEN';
          throw err;
        },
      },
      CloudFormation: {
        describeStacks: { Stacks: [{}] },
        validateTemplate: {},
        describeStackResource: {
          StackResourceDetail: { PhysicalResourceId: 's3-bucket-resource' },
        },
      },
    };

    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy',
        awsRequestStubMap,
        lastLifecycleHookName: 'aws:deploy:deploy:checkForChanges',
      })
    ).to.eventually.have.been.rejected.and.have.property('code', 'AWS_S3_HEAD_BUCKET_FORBIDDEN');
  });
});
