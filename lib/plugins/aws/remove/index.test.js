'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../provider/awsProvider');
const AwsRemove = require('./index');
const Serverless = require('../../../Serverless');

describe('AwsRemove', () => {
  const serverless = new Serverless();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  serverless.setProvider('aws', new AwsProvider(serverless, options));
  const awsRemove = new AwsRemove(serverless, options);
  awsRemove.serverless.cli = new serverless.classes.CLI();

  describe('#constructor()', () => {
    let validateStub;
    let emptyS3BucketStub;
    let removeStackStub;
    let monitorStackStub;

    beforeEach(() => {
      validateStub = sinon.stub(awsRemove, 'validate').resolves();
      emptyS3BucketStub = sinon.stub(awsRemove, 'emptyS3Bucket').resolves();
      removeStackStub = sinon.stub(awsRemove, 'removeStack').resolves();
      monitorStackStub = sinon.stub(awsRemove, 'monitorStack').resolves();
    });

    afterEach(() => {
      awsRemove.validate.restore();
      awsRemove.emptyS3Bucket.restore();
      awsRemove.removeStack.restore();
      awsRemove.monitorStack.restore();
    });

    it('should have hooks', () => expect(awsRemove.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsRemove.provider).to.be.instanceof(AwsProvider));

    it('should have access to the serverless instance', () => {
      expect(awsRemove.serverless).to.deep.equal(serverless);
    });

    it('should run promise chain in order', () => {
      return awsRemove.hooks['remove:remove']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(emptyS3BucketStub.calledAfter(validateStub)).to.be.equal(true);
        expect(removeStackStub.calledAfter(emptyS3BucketStub)).to.be.equal(true);
        expect(monitorStackStub.calledAfter(emptyS3BucketStub)).to.be.equal(true);
      });
    });
  });
});
