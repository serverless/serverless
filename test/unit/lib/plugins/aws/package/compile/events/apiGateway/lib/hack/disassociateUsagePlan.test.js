'use strict';

const chai = require('chai');
chai.use(require('chai-as-promised'));

const expect = require('chai').expect;
const sinon = require('sinon');
const Serverless = require('../../../../../../../../../../../lib/Serverless');
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
    providerRequestStub.withArgs('CloudFormation', 'describeStackResource').rejects({
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
    });

    disassociateUsagePlan.serverless.service.provider.apiGateway = { apiKeys: ['apiKey1'] };

    await disassociateUsagePlan.disassociateUsagePlan();

    expect(providerRequestStub.calledWith('CloudFormation', 'describeStackResource')).to.be.true;
    expect(providerRequestStub.calledWith('APIGateway', 'updateUsagePlan')).to.be.false;
  });

  it('should still fail on error', async () => {
    providerRequestStub.withArgs('CloudFormation', 'describeStackResource').rejects({
      code: 'SOME_OTHER_ERROR',
      providerError: {
        message: 'SomeOtherError',
        code: 'SomeOtherError',
        time: '2021-10-16T10:41:09.706Z',
        requestId: 'afed43d8-c03a-4be8-a15b-a202dda76401',
        statusCode: 400,
        retryable: false,
        retryDelay: 75.03958549651621,
      },
      providerErrorCodeExtension: 'SomeOtherError',
    });

    disassociateUsagePlan.serverless.service.provider.apiGateway = { apiKeys: ['apiKey1'] };

    expect(
      disassociateUsagePlan.disassociateUsagePlan()
    ).to.eventually.be.rejected.and.have.property('code', 'SOME_OTHER_ERROR');
  });
});
