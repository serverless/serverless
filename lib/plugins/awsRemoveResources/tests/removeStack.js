'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsRemoveResources = require('../awsRemoveResources');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

describe('removeStack', () => {
  const serverless = new Serverless();
  serverless.init();

  let awsRemoveResources;

  beforeEach(() => {
    awsRemoveResources = new AwsRemoveResources(serverless);

    awsRemoveResources.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    awsRemoveResources.CloudFormation = new AWS.CloudFormation({ region: 'us-east-1' });
    BbPromise.promisifyAll(awsRemoveResources.CloudFormation, { suffix: 'Promised' });
  });

  describe('#remove()', () => {
    it('should remove a stack', () => {
      const removeStackStub = sinon
        .stub(awsRemoveResources.CloudFormation, 'deleteStackPromised')
        .returns(BbPromise.resolve());

      return awsRemoveResources.remove().then(() => {
        expect(removeStackStub.calledOnce).to.be.equal(true);
        awsRemoveResources.CloudFormation.deleteStackPromised.restore();
      });
    });
  });

  describe('#monitorRemove()', () => {
    it('should keep monitoring until DELETE_COMPLETE stack status', () => {
      const describeStub = sinon.stub(awsRemoveResources.CloudFormation, 'describeStacksPromised');

      const cfDataMock = {
        StackId: 'existing-service-dev',
      };

      const DescribeReturn = {
        Stacks: [
          {
            StackStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };

      const finalDescribeReturn = {
        Stacks: [
          {
            StackStatus: 'DELETE_COMPLETE',
          },
        ],
      };

      describeStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

      return awsRemoveResources.monitorRemove(cfDataMock, 10).then((stack) => {
        expect(describeStub.callCount).to.be.equal(3);
        expect(stack.StackStatus).to.be.equal('DELETE_COMPLETE');
        awsRemoveResources.CloudFormation.describeStacksPromised.restore();
      });
    });

    it('should throw an error if CloudFormation returned unusual stack status', () => {
      const describeStub = sinon.stub(awsRemoveResources.CloudFormation, 'describeStacksPromised');

      const cfDataMock = {
        StackId: 'existing-service-dev',
      };

      const DescribeReturn = {
        Stacks: [
          {
            StackStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      };

      const finalDescribeReturn = {
        Stacks: [
          {
            StackStatus: 'UNUSUAL_STATUS',
          },
        ],
      };

      describeStub.onCall(0).returns(BbPromise.resolve(DescribeReturn));
      describeStub.onCall(1).returns(BbPromise.resolve(DescribeReturn));
      describeStub.onCall(2).returns(BbPromise.resolve(finalDescribeReturn));

      return awsRemoveResources.monitorRemove(cfDataMock, 10).catch((e) => {
        expect(e.name).to.be.equal('ServerlessError');
        expect(describeStub.callCount).to.be.equal(3);
        awsRemoveResources.CloudFormation.describeStacksPromised.restore();
      });
    });
  });
});
