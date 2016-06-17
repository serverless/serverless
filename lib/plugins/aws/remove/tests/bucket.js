'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

describe('emptyS3Bucket', () => {
  const serverless = new Serverless();
  serverless.init();

  let awsRemove;

  beforeEach(() => {
    awsRemove = new AwsRemove(serverless);

    awsRemove.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    awsRemove.S3 = new AWS.S3();
    BbPromise.promisifyAll(awsRemove.S3, { suffix: 'Promised' });
  });

  describe('#listObjects()', () => {
    it('should list all objects in the S3 bucket', () => {
      const listObjectsStub = sinon.stub(awsRemove.S3, 'listObjectsV2Promised')
        .returns(BbPromise.resolve());

      return awsRemove.listObjects().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        awsRemove.S3.listObjectsV2Promised.restore();
      });
    });
  });

  describe('#deleteObjects()', () => {
    it('should delete all objects in the S3 bucket', () => {
      awsRemove.objectsInBucket = [{ Key: 'foo' }];

      const deleteObjectsStub = sinon.stub(awsRemove.S3, 'deleteObjectsPromised')
        .returns(BbPromise.resolve());

      return awsRemove.deleteObjects().then(() => {
        expect(deleteObjectsStub.calledOnce).to.be.equal(true);
        awsRemove.S3.deleteObjectsPromised.restore();
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
