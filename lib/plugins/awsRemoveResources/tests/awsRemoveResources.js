'use strict';

const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');
const AwsRemoveResources = require('../awsRemoveResources');
const Serverless = require('../../../Serverless');

const serverless = new Serverless();
serverless.init();
const awsRemoveResources = new AwsRemoveResources(serverless);

describe('AwsRemoveResources', () => {
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

      return awsRemoveResources.hooks['remove:resources:removeResources']()
        .then(() => {
          expect(validateInputStub.calledOnce).to.be.equal(true);
          expect(emptyS3BucketStub.calledAfter(validateInputStub)).to.be.equal(true);

          awsRemoveResources.validateInput.restore();
          awsRemoveResources.emptyS3Bucket.restore();
        });
    });
  });
});
