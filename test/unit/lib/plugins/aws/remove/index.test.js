'use strict';

const chai = require('chai');
const sinon = require('sinon');
const runServerless = require('../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('test/unit/lib/plugins/aws/remove/index.test.js', () => {
  const deleteObjectsStub = sinon.stub().resolves();
  const deleteStackStub = sinon.stub().resolves();
  const describeStackEventsStub = sinon.stub().resolves({
    StackEvents: [
      {
        EventId: '1e2f3g4h',
        StackName: 'new-service-dev',
        LogicalResourceId: 'new-service-dev',
        ResourceType: 'AWS::CloudFormation::Stack',
        Timestamp: new Date(),
        ResourceStatus: 'DELETE_COMPLETE',
      },
    ],
  });
  const describeRepositoriesStub = sinon.stub();
  const deleteRepositoryStub = sinon.stub().resolves();
  const awsRequestStubMap = {
    ECR: {
      deleteRepository: deleteRepositoryStub,
      describeRepositories: describeRepositoriesStub,
    },
    S3: {
      deleteObjects: deleteObjectsStub,
      listObjectsV2: { Contents: [{ Key: 'first' }, { Key: 'second' }] },
    },
    CloudFormation: {
      describeStackEvents: describeStackEventsStub,
      deleteStack: deleteStackStub,
      describeStackResource: { StackResourceDetail: { PhysicalResourceId: 'resource-id' } },
    },
    STS: {
      getCallerIdentity: {
        ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
        UserId: 'XXXXXXXXXXXXXXXXXXXXX',
        Account: '999999999999',
        Arn: 'arn:aws:iam::999999999999:user/test',
      },
    },
  };

  beforeEach(() => {
    deleteObjectsStub.resetHistory();
    deleteStackStub.resetHistory();
    describeStackEventsStub.resetHistory();
    describeRepositoriesStub.reset();
    deleteRepositoryStub.resetHistory();
  });

  it('executes expected operations during removal when repository does not exist', async () => {
    describeRepositoriesStub.throws({ providerError: { code: 'RepositoryNotFoundException' } });

    const { awsNaming } = await runServerless({
      fixture: 'function',
      command: 'remove',
      awsRequestStubMap,
    });

    expect(deleteObjectsStub).to.be.calledWithExactly({
      Bucket: 'resource-id',
      Delete: {
        Objects: [{ Key: 'first' }, { Key: 'second' }],
      },
    });
    expect(deleteStackStub).to.be.calledWithExactly({ StackName: awsNaming.getStackName() });
    expect(describeStackEventsStub).to.be.calledWithExactly({
      StackName: awsNaming.getStackName(),
    });
    expect(deleteStackStub.calledAfter(deleteObjectsStub)).to.be.true;
    expect(describeStackEventsStub.calledAfter(deleteStackStub)).to.be.true;
    expect(deleteRepositoryStub).not.to.be.called;
  });

  it('executes expected operations during removal when repository cannot be accessed due to denied access', async () => {
    describeRepositoriesStub.throws({ providerError: { code: 'AccessDeniedException' } });

    const { awsNaming } = await runServerless({
      fixture: 'function',
      command: 'remove',
      awsRequestStubMap,
    });

    expect(deleteObjectsStub).to.be.calledWithExactly({
      Bucket: 'resource-id',
      Delete: {
        Objects: [{ Key: 'first' }, { Key: 'second' }],
      },
    });
    expect(deleteStackStub).to.be.calledWithExactly({ StackName: awsNaming.getStackName() });
    expect(describeStackEventsStub).to.be.calledWithExactly({
      StackName: awsNaming.getStackName(),
    });
    expect(deleteStackStub.calledAfter(deleteObjectsStub)).to.be.true;
    expect(describeStackEventsStub.calledAfter(deleteStackStub)).to.be.true;
    expect(deleteRepositoryStub).not.to.be.called;
  });

  it('removes ECR repository if it exists', async () => {
    describeRepositoriesStub.resolves();
    const { awsNaming } = await runServerless({
      fixture: 'function',
      command: 'remove',
      awsRequestStubMap,
    });

    expect(deleteRepositoryStub).to.be.calledWithExactly({
      repositoryName: awsNaming.getEcrRepositoryName(),
      registryId: '999999999999',
      force: true,
    });
  });
});
