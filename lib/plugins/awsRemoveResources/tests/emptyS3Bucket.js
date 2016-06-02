'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsRemoveResources = require('../awsRemoveResources');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

describe('emptyS3Bucket', () => {
  const serverless = new Serverless();
  serverless.init();

  let awsRemoveResources;

  beforeEach(() => {
    awsRemoveResources = new AwsRemoveResources(serverless);

    awsRemoveResources.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    awsRemoveResources.S3 = new AWS.S3();
    BbPromise.promisifyAll(awsRemoveResources.S3, { suffix: 'Promised' });
  });

  describe('#listObjects()', () => {
    it('should list all objects in the S3 bucket', () => {
      const listObjectsStub = sinon.stub(awsRemoveResources.S3, 'listObjectsV2Promised')
        .returns(BbPromise.resolve());

      return awsRemoveResources.listObjects().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        awsRemoveResources.S3.listObjectsV2Promised.restore();
      });
    });
  });

  describe('#deleteObjects()', () => {
    it('should delete all objects in the S3 bucket', () => {
      const deleteObjectsStub = sinon.stub(awsRemoveResources.S3, 'deleteObjectsPromised')
        .returns(BbPromise.resolve());

      return awsRemoveResources.deleteObjects().then(() => {
        expect(deleteObjectsStub.calledOnce).to.be.equal(true);
        awsRemoveResources.S3.deleteObjectsPromised.restore();
      });
    });
  });
});
