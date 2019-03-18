'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../provider/awsProvider');
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');

describe('emptyS3Bucket', () => {
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  const serverless = new Serverless();
  serverless.service.service = 'emptyS3Bucket';
  serverless.setProvider('aws', new AwsProvider(serverless, options));

  let awsRemove;

  beforeEach(() => {
    awsRemove = new AwsRemove(serverless, options);
    awsRemove.serverless.cli = new serverless.classes.CLI();
  });

  describe('#setServerlessDeploymentBucketName()', () => {
    it('should store the name of the Serverless deployment bucket in the "this" variable', () => {
      const getServerlessDeploymentBucketNameStub = sinon
        .stub(awsRemove.provider, 'getServerlessDeploymentBucketName')
        .resolves('new-service-dev-us-east-1-12345678');

      return awsRemove.setServerlessDeploymentBucketName().then(() => {
        expect(awsRemove.bucketName).to.equal('new-service-dev-us-east-1-12345678');
        expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(true);
        expect(getServerlessDeploymentBucketNameStub.calledWithExactly()).to.be.equal(true);
        awsRemove.provider.getServerlessDeploymentBucketName.restore();
      });
    });
  });

  describe('#listObjects()', () => {
    it('should resolve if no objects are present', () => {
      const listObjectsStub = sinon.stub(awsRemove.provider, 'request')
        .resolves();

      const stage = awsRemove.provider.getStage();
      const prefix = awsRemove.provider.getDeploymentPrefix();

      return awsRemove.listObjects().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsRemove.bucketName,
            Prefix: `${prefix}/${serverless.service.service}/${stage}`,
          }
        )).to.be.equal(true);
        expect(awsRemove.objectsInBucket.length).to.equal(0);
        awsRemove.provider.request.restore();
      });
    });

    it('should push objects to the array if present', () => {
      const listObjectsStub = sinon.stub(awsRemove.provider, 'request')
        .resolves({
          Contents: [
            { Key: 'object1' },
            { Key: 'object2' },
          ],
        });

      const stage = awsRemove.provider.getStage();
      const prefix = awsRemove.provider.getDeploymentPrefix();

      return awsRemove.listObjects().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsRemove.bucketName,
            Prefix: `${prefix}/${serverless.service.service}/${stage}`,
          }
        )).to.be.equal(true);
        expect(awsRemove.objectsInBucket[0]).to.deep.equal({ Key: 'object1' });
        expect(awsRemove.objectsInBucket[1]).to.deep.equal({ Key: 'object2' });
        awsRemove.provider.request.restore();
      });
    });
  });

  describe('#deleteObjects()', () => {
    it('should delete all objects in the S3 bucket', () => {
      awsRemove.objectsInBucket = [{ Key: 'foo' }];

      const deleteObjectsStub = sinon.stub(awsRemove.provider, 'request')
        .resolves();

      return awsRemove.deleteObjects().then(() => {
        expect(deleteObjectsStub.calledOnce).to.be.equal(true);
        expect(deleteObjectsStub.calledWithExactly(
          'S3',
          'deleteObjects',
          {
            Bucket: awsRemove.bucketName,
            Delete: {
              Objects: awsRemove.objectsInBucket,
            },
          }
        )).to.be.equal(true);
        awsRemove.provider.request.restore();
      });
    });

    it('should resolve if objectsInBucket is empty', (done) => {
      awsRemove.objectsInBucket = [];

      awsRemove.deleteObjects().then(() => {
        done();
      });
    });
  });

  describe('#emptyS3Bucket()', () => {
    it('should run promise chain in order', () => {
      const setServerlessDeploymentBucketNameStub = sinon
        .stub(awsRemove, 'setServerlessDeploymentBucketName').resolves();
      const listObjectsStub = sinon
        .stub(awsRemove, 'listObjects').resolves();
      const deleteObjectsStub = sinon
        .stub(awsRemove, 'deleteObjects').resolves();

      return awsRemove.emptyS3Bucket().then(() => {
        expect(setServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledAfter(setServerlessDeploymentBucketNameStub))
          .to.be.equal(true);
        expect(deleteObjectsStub.calledAfter(listObjectsStub)).to.be.equal(true);

        awsRemove.setServerlessDeploymentBucketName.restore();
        awsRemove.listObjects.restore();
        awsRemove.deleteObjects.restore();
      });
    });
  });
});
