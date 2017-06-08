'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../provider/awsProvider');
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');

describe('removeStack', () => {
  const serverless = new Serverless();
  serverless.service.service = 'removeStack';
  serverless.service.provider.apiKeys = ['api-key'];
  serverless.setProvider('aws', new AwsProvider(serverless));

  let awsRemove;
  let removeStackStub;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsRemove = new AwsRemove(serverless, options);
    awsRemove.serverless.cli = new serverless.classes.CLI();
    removeStackStub = sinon.stub(awsRemove.provider, 'request');
    removeStackStub.withArgs('CloudFormation', 'deleteStack').resolves();
    removeStackStub.withArgs('CloudFormation', 'describeStackResource')
      .resolves({ StackResourceDetail: { PhysicalResourceId: 'resource-id' } });
    removeStackStub.withArgs('APIGateway', 'getUsagePlans')
      .resolves({
        items: [{
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
        }],
      });
    removeStackStub.withArgs('APIGateway', 'updateUsagePlan').resolves();
  });

  describe('#remove()', () => {
    it('should remove a stack', () => awsRemove.remove().then(() => {
      expect(removeStackStub.calledOnce).to.be.equal(true);
      expect(removeStackStub.calledWithExactly(
        'CloudFormation',
        'deleteStack',
        {
          StackName: `${serverless.service.service}-${awsRemove.options.stage}`,
        },
        awsRemove.options.stage,
        awsRemove.options.region
      )).to.be.equal(true);
      awsRemove.provider.request.restore();
    }));

    it('should use CloudFormation service role if it is specified', () => {
      awsRemove.serverless.service.provider.cfnRole = 'arn:aws:iam::123456789012:role/myrole';

      return awsRemove.remove().then(() => {
        expect(removeStackStub.args[0][2].RoleARN)
          .to.equal('arn:aws:iam::123456789012:role/myrole');
        awsRemove.provider.request.restore();
      });
    });
  });

  describe('#disassociateUsagePlan()', () => {
    it('should remove association from the usage plan', () => awsRemove
      .disassociateUsagePlan().then(() => {
        expect(removeStackStub.callCount).to.be.equal(3);

        expect(removeStackStub.calledWithExactly(
          'CloudFormation',
          'describeStackResource',
          {
            StackName: `${serverless.service.service}-${awsRemove.options.stage}`,
            LogicalResourceId: 'ApiGatewayRestApi',
          },
          awsRemove.options.stage,
          awsRemove.options.region
        )).to.be.equal(true);

        expect(removeStackStub.calledWithExactly(
          'APIGateway',
          'getUsagePlans',
          {},
          awsRemove.options.stage,
          awsRemove.options.region
        )).to.be.equal(true);

        expect(removeStackStub.calledWithExactly(
          'APIGateway',
          'updateUsagePlan',
          {
            usagePlanId: 'usage-plan-id',
            patchOperations: [{
              op: 'remove',
              path: '/apiStages',
              value: 'resource-id:dev',
            }],
          },
          awsRemove.options.stage,
          awsRemove.options.region
        )).to.be.equal(true);

        awsRemove.provider.request.restore();
      }));
  });

  describe('#removeStack()', () => {
    it('should run promise chain in order', () => {
      const disassociateUsagePlanStub = sinon
        .stub(awsRemove, 'disassociateUsagePlan').resolves();
      const removeStub = sinon
        .stub(awsRemove, 'remove').resolves();

      return awsRemove.removeStack().then(() => {
        expect(disassociateUsagePlanStub.calledOnce).to.be.equal(true);
        expect(removeStub.calledOnce).to.be.equal(true);
        awsRemove.remove.restore();
      });
    });
  });
});
