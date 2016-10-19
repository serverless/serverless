'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../provider/awsProvider');
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

describe('removeStack', () => {
  const serverless = new Serverless();
  serverless.setProvider('aws', new AwsProvider(serverless));

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
        .stub(awsRemove.provider, 'request').returns(BbPromise.resolve());

      return awsRemove.remove().then(() => {
        expect(removeStackStub.calledOnce).to.be.equal(true);
        expect(removeStackStub.calledWith(awsRemove.options.stage, awsRemove.options.region));
        awsRemove.provider.request.restore();
      });
    });
  });

  describe('#removeStack()', () => {
    it('should run promise chain in order', () => {
      const removeStub = sinon
        .stub(awsRemove, 'remove').returns(BbPromise.resolve());

      return awsRemove.removeStack().then(() => {
        expect(removeStub.calledOnce).to.be.equal(true);
        awsRemove.remove.restore();
      });
    });
  });
});
