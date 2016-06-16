'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsRemove = require('../');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

describe('removeStack', () => {
  const serverless = new Serverless();
  serverless.init();

  let awsRemove;

  beforeEach(() => {
    awsRemove = new AwsRemove(serverless);

    awsRemove.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    awsRemove.CloudFormation = new AWS.CloudFormation({ region: 'us-east-1' });
    BbPromise.promisifyAll(awsRemove.CloudFormation, { suffix: 'Promised' });
  });

  describe('#remove()', () => {
    it('should remove a stack', () => {
      const removeStackStub = sinon
        .stub(awsRemove.CloudFormation, 'deleteStackPromised')
        .returns(BbPromise.resolve());

      return awsRemove.remove().then(() => {
        expect(removeStackStub.calledOnce).to.be.equal(true);
        awsRemove.CloudFormation.deleteStackPromised.restore();
      });
    });
  });

  describe('#monitorRemove()', () => {
    it('should keep monitoring until DELETE_COMPLETE stack status', () => {
      const listStub = sinon.stub(awsRemove.CloudFormation, 'listStacksPromised');

      const stackName = 'existing-service-dev';

      const ListReturn = {
        StackSummaries: [
          {
            StackStatus: 'DELETE_IN_PROGRESS',
            StackName: stackName,
          },
        ],
      };

      const finalListReturn = {
        StackSummaries: [
          {
            StackStatus: 'DELETE_COMPLETE',
            StackName: stackName,
          },
        ],
      };

      listStub.onCall(0).returns(BbPromise.resolve(ListReturn));
      listStub.onCall(1).returns(BbPromise.resolve(ListReturn));
      listStub.onCall(2).returns(BbPromise.resolve(finalListReturn));

      return awsRemove.monitorRemove(stackName, 10).then((stack) => {
        expect(listStub.callCount).to.be.equal(3);
        expect(stack.StackStatus).to.be.equal('DELETE_COMPLETE');
        awsRemove.CloudFormation.listStacksPromised.restore();
      });
    });
  });
});
