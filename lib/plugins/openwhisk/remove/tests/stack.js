'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

describe('removeStack', () => {
  const serverless = new Serverless();

  let awsRemove;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsRemove = new AwsRemove(serverless, options);
    awsRemove.serverless.cli = new serverless.classes.CLI();
  });

  describe('#remove()', () => {
    it('should remove a stack', () => {
      const removeStackStub = sinon
        .stub(awsRemove.sdk, 'request').returns(BbPromise.resolve());

      return awsRemove.remove().then(() => {
        expect(removeStackStub.calledOnce).to.be.equal(true);
        expect(removeStackStub.calledWith(awsRemove.options.stage, awsRemove.options.region));
        awsRemove.sdk.request.restore();
      });
    });
  });

  describe('#monitorRemove()', () => {
    it('should keep monitoring until DELETE_COMPLETE stack status', () => {
      const listStacksStub = sinon.stub(awsRemove.sdk, 'request');

      const stackName = 'existing-service-dev';

      const ListReturn = {
        StackSummaries: [
          {
            StackStatus: 'DELETE_IN_PROGRESS',
            StackName: stackName,
          },
        ],
      };

      const FinalListReturn = {
        StackSummaries: [
          {
            StackStatus: 'DELETE_COMPLETE',
            StackName: stackName,
          },
        ],
      };

      listStacksStub.onCall(0).returns(BbPromise.resolve(ListReturn));
      listStacksStub.onCall(1).returns(BbPromise.resolve(ListReturn));
      listStacksStub.onCall(2).returns(BbPromise.resolve(FinalListReturn));

      return awsRemove.monitorRemove(stackName, 10).then((stack) => {
        expect(listStacksStub.callCount).to.be.equal(3);
        expect(listStacksStub.calledWith(awsRemove.options.stage, awsRemove.options.region));
        expect(stack.StackStatus).to.be.equal('DELETE_COMPLETE');
        awsRemove.sdk.request.restore();
      });
    });

    it('should throw an error if CloudFormation returned unusual stack status', () => {
      const listStacksStub = sinon.stub(awsRemove.sdk, 'request');

      const stackName = 'existing-service-dev';

      const ListReturn = {
        StackSummaries: [
          {
            StackStatus: 'DELETE_IN_PROGRESS',
            StackName: stackName,
          },
        ],
      };

      const FinalListReturn = {
        StackSummaries: [
          {
            StackStatus: 'UNUSUAL_STATUS',
            StackName: stackName,
          },
        ],
      };

      listStacksStub.onCall(0).returns(BbPromise.resolve(ListReturn));
      listStacksStub.onCall(1).returns(BbPromise.resolve(ListReturn));
      listStacksStub.onCall(2).returns(BbPromise.resolve(FinalListReturn));

      return awsRemove.monitorRemove(stackName, 10).catch((e) => {
        expect(e.name).to.be.equal('ServerlessError');
        expect(listStacksStub.callCount).to.be.equal(3);
        expect(listStacksStub.calledWith(awsRemove.options.stage, awsRemove.options.region));
        awsRemove.sdk.request.restore();
      });
    });
  });
});
