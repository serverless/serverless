'use strict';

const chai = require('chai');
chai.use(require('chai-as-promised'));

const expect = require('chai').expect;
const sinon = require('sinon');
const Serverless = require('../../../../../../../../../../../lib/Serverless');
const runServerless = require('../../../../../../../../../../../test/utils/run-serverless');
const AwsProvider = require('../../../../../../../../../../../lib/plugins/aws/provider');
const disassociateUsagePlan = require('../../../../../../../../../../../lib/plugins/aws/package/compile/events/apiGateway/lib/hack/disassociateUsagePlan');

describe('#disassociateUsagePlan()', () => {
  let serverless;
  let options;
  let awsProvider;
  let providerRequestStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.service = 'my-service';
    serverless.cli = {
      log: sinon.spy(),
    };
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsProvider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', awsProvider);
    providerRequestStub = sinon.stub(awsProvider, 'request');
    disassociateUsagePlan.serverless = serverless;
    disassociateUsagePlan.options = options;
    disassociateUsagePlan.provider = awsProvider;
    providerRequestStub
      .withArgs('CloudFormation', 'describeStackResource')
      .resolves({ StackResourceDetail: { PhysicalResourceId: 'resource-id' } });
    providerRequestStub.withArgs('APIGateway', 'getUsagePlans').resolves({
      items: [
        {
          apiStages: [
            {
              apiId: 'resource-id',
              stage: 'dev',
            },
          ],
          id: 'usage-plan-id',
        },
        {
          apiStages: [
            {
              apiId: 'another-resource-id',
              stage: 'dev',
            },
          ],
          id: 'another-usage-plan-id',
        },
      ],
    });
    providerRequestStub.withArgs('APIGateway', 'updateUsagePlan').resolves();
  });

  afterEach(() => {
    awsProvider.request.restore();
  });

  it('should remove association from the usage plan', async () => {
    disassociateUsagePlan.serverless.service.provider.apiGateway = { apiKeys: ['apiKey1'] };

    await disassociateUsagePlan.disassociateUsagePlan();

    expect(providerRequestStub.callCount).to.be.equal(3);

    expect(
      providerRequestStub.calledWithExactly('CloudFormation', 'describeStackResource', {
        StackName: `${awsProvider.naming.getStackName()}`,
        LogicalResourceId: 'ApiGatewayRestApi',
      })
    ).to.be.true;

    expect(providerRequestStub.calledWithExactly('APIGateway', 'getUsagePlans', {})).to.be.true;

    expect(
      providerRequestStub.calledWithExactly('APIGateway', 'updateUsagePlan', {
        usagePlanId: 'usage-plan-id',
        patchOperations: [
          {
            op: 'remove',
            path: '/apiStages',
            value: 'resource-id:dev',
          },
        ],
      })
    ).to.be.true;
  });

  it('should resolve if no api keys are given', async () => {
    disassociateUsagePlan.serverless.service.provider.apiGateway = { apiKeys: [] };

    await disassociateUsagePlan.disassociateUsagePlan();
    expect(providerRequestStub.callCount).to.be.equal(0);
  });

  it('should resolve if stack is not available', async () => {
    const updateUsagePlan = sinon.stub().resolves();

    const describeStackResource = sinon
      .stub()
      .onFirstCall()
      .throws({
        code: 'AWS_CLOUD_FORMATION_DESCRIBE_STACK_RESOURCE_VALIDATION_ERROR',
        providerError: {
          message: "Stack 'my-missing-stackname' does not exist",
          code: 'ValidationError',
          time: '2021-10-16T10:41:09.706Z',
          requestId: 'afed43d8-c03a-4be8-a15b-a202dda76401',
          statusCode: 400,
          retryable: false,
          retryDelay: 75.03958549651621,
        },
        providerErrorCodeExtension: 'VALIDATION_ERROR',
      })
      .returns({ StackResourceDetail: { PhysicalResourceId: 'resource-id' } });
    const deleteStackStub = sinon.stub().resolves();

    await runServerless({
      command: 'remove',
      config: {
        service: 'test',
        provider: {
          name: 'aws',
          stage: 'dev',
          apiGateway: {
            apiKeys: ['api-key-1'],
          },
          region: 'us-east-1',
        },
      },
      awsRequestStubMap: {
        STS: {
          getCallerIdentity: {
            ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
            UserId: 'XXXXXXXXXXXXXXXXXXXXX',
            Account: '999999999999',
            Arn: 'arn:aws:iam::999999999999:user/test',
          },
        },
        ECR: {
          describeRepositories: sinon.stub().throws({
            providerError: { code: 'RepositoryNotFoundException' },
          }),
        },
        S3: {
          deleteStack: deleteStackStub,
          deleteObjects: {},
          listObjectsV2: { Contents: [{ Key: 'first' }, { Key: 'second' }] },
          headObject: {},
        },
        APIGateway: {
          getApiKey: {
            value: 'test-key-value',
            name: 'test-key-name',
          },
          getUsagePlans: sinon.stub().resolves(),
          updateUsagePlan,
        },
        CloudFormation: {
          describeStacks: {},
          deleteStack: {},
          describeStackEvents: {
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
          },
          describeStackResource,
        },
      },
    });

    expect(updateUsagePlan.notCalled).to.be.true;
    expect(describeStackResource.called).to.be.true;
  });

  it('should still fail if a different error manifests', async () => {
    const updateUsagePlan = sinon.stub().resolves();
    const describeStackResource = sinon
      .stub()
      .onFirstCall()
      .throws({
        code: 'SOME_OTHER_ERROR',
        providerError: {
          message: "Stack 'my-missing-stackname' does not exist",
          code: 'SOME_ERROR',
          time: '2021-10-16T10:41:09.706Z',
          requestId: 'afed43d8-c03a-4be8-a15b-a202dda76401',
          statusCode: 400,
          retryable: false,
          retryDelay: 75.03958549651621,
        },
        providerErrorCodeExtension: 'SOME_ERROR',
      })
      .returns({ StackResourceDetail: { PhysicalResourceId: 'resource-id' } });
    const deleteStackStub = sinon.stub().resolves();

    expect(
      runServerless({
        command: 'remove',
        config: {
          service: 'test',
          provider: {
            name: 'aws',
            stage: 'dev',
            apiGateway: {
              apiKeys: ['api-key-1'],
            },
            region: 'us-east-1',
          },
        },
        awsRequestStubMap: {
          STS: {
            getCallerIdentity: {
              ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
              UserId: 'XXXXXXXXXXXXXXXXXXXXX',
              Account: '999999999999',
              Arn: 'arn:aws:iam::999999999999:user/test',
            },
          },
          ECR: {
            describeRepositories: sinon.stub().throws({
              providerError: { code: 'RepositoryNotFoundException' },
            }),
          },
          S3: {
            deleteStack: deleteStackStub,
            deleteObjects: {},
            listObjectsV2: { Contents: [{ Key: 'first' }, { Key: 'second' }] },
            headObject: {},
          },
          APIGateway: {
            getApiKey: {
              value: 'test-key-value',
              name: 'test-key-name',
            },
            getUsagePlans: sinon.stub().resolves(),
            updateUsagePlan,
          },
          CloudFormation: {
            describeStacks: {},
            deleteStack: {},
            describeStackEvents: {
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
            },
            describeStackResource,
          },
        },
      })
    ).eventually.rejected;
  });
});
