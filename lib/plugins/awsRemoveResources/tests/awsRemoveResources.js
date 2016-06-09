'use strict';

const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');
const AwsRemoveResources = require('../awsRemoveResources');
const Serverless = require('../../../Serverless');

describe('AwsRemoveResources', () => {
  const serverless = new Serverless();
  serverless.init();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  const awsRemoveResources = new AwsRemoveResources(serverless, options);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsRemoveResources.hooks).to.be.not.empty);

    it('should have access to the serverless instance', () => {
      expect(awsRemoveResources.serverless).to.deep.equal(serverless);
    });

    it('should run promise chain in order', () => {
      const validateInputStub = sinon
        .stub(awsRemoveResources, 'validateInput').returns(BbPromise.resolve());
      const emptyS3BucketStub = sinon
        .stub(awsRemoveResources, 'emptyS3Bucket').returns(BbPromise.resolve());
      const removeStackStub = sinon
        .stub(awsRemoveResources, 'removeStack').returns(BbPromise.resolve());

      return awsRemoveResources.hooks['remove:remove']()
        .then(() => {
          expect(validateInputStub.calledOnce).to.be.equal(true);
          expect(emptyS3BucketStub.calledAfter(validateInputStub)).to.be.equal(true);
          expect(removeStackStub.calledAfter(emptyS3BucketStub)).to.be.equal(true);

          awsRemoveResources.validateInput.restore();
          awsRemoveResources.emptyS3Bucket.restore();
          awsRemoveResources.removeStack.restore();
        });
    });
  });
});
