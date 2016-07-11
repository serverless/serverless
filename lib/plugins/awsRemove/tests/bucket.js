'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsRemove = require('../index');
const Serverless = require('../../../Serverless');
const RegisterAwsProvider = require('../../awsProvider/index');
const BbPromise = require('bluebird');

describe('emptyS3Bucket', () => {
  const serverless = new Serverless();
  new RegisterAwsProvider(serverless);

  let awsRemove;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsRemove = new AwsRemove(serverless, options);
    awsRemove.serverless.cli = new serverless.classes.CLI();
  });

  describe('#listObjects()', () => {
    it('should list all objects in the S3 bucket', () => {
      const listObjectsStub = sinon.stub(awsRemove.aws, 'request')
        .returns(BbPromise.resolve());

      return awsRemove.listObjects().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWith(awsRemove.options.stage, awsRemove.options.region));
        awsRemove.aws.request.restore();
      });
    });
  });

  describe('#deleteObjects()', () => {
    it('should delete all objects in the S3 bucket', () => {
      awsRemove.objectsInBucket = [{ Key: 'foo' }];

      const deleteObjectsStub = sinon.stub(awsRemove.aws, 'request')
        .returns(BbPromise.resolve());

      return awsRemove.deleteObjects().then(() => {
        expect(deleteObjectsStub.calledOnce).to.be.equal(true);
        expect(deleteObjectsStub.calledWith(awsRemove.options.stage, awsRemove.options.region));
        awsRemove.aws.request.restore();
      });
    });

    it('should resolve if objectsInBucket is empty', (done) => {
      awsRemove.objectsInBucket = [];

      return awsRemove.deleteObjects().then(() => {
        done();
      });
    });
  });
});
