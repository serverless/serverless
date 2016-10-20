'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../provider/awsProvider');
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

describe('emptyS3Bucket', () => {
  const serverless = new Serverless();
  serverless.service.service = 'emptyS3Bucket';
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

  describe('#setServerlessDeploymentBucketName()', () => {
    it('should store the name of the Serverless deployment bucket in the "this" variable', () => {
      const getServerlessDeploymentBucketNameStub = sinon
        .stub(awsRemove.provider, 'getServerlessDeploymentBucketName')
        .returns(BbPromise.resolve('new-service-dev-us-east-1-12345678'));

      return awsRemove.setServerlessDeploymentBucketName().then(() => {
        expect(awsRemove.bucketName).to.equal('new-service-dev-us-east-1-12345678');
        expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(true);
        expect(getServerlessDeploymentBucketNameStub.calledWithExactly(
          awsRemove.options.stage,
          awsRemove.options.region
        )).to.be.equal(true);
        awsRemove.provider.getServerlessDeploymentBucketName.restore();
      });
    });
  });

  describe('#listObjects()', () => {
    it('should resolve if no objects are present', () => {
      const listObjectsStub = sinon.stub(awsRemove.provider, 'request')
        .returns(BbPromise.resolve());

      return awsRemove.listObjects().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsRemove.bucketName,
            Prefix: `serverless/${serverless.service.service}/${awsRemove.options.stage}`,
          },
          awsRemove.options.stage,
          awsRemove.options.region
        )).to.be.equal(true);
        expect(awsRemove.objectsInBucket.length).to.equal(0);
        awsRemove.provider.request.restore();
      });
    });

    it('should push objects to the array if present', () => {
      const listObjectsStub = sinon.stub(awsRemove.provider, 'request')
        .returns(BbPromise.resolve({
          Contents: [
            { Key: 'object1' },
            { Key: 'object2' },
          ],
        }));

      return awsRemove.listObjects().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsRemove.bucketName,
            Prefix: `serverless/${serverless.service.service}/${awsRemove.options.stage}`,
          },
          awsRemove.options.stage,
          awsRemove.options.region
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
        .returns(BbPromise.resolve());

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
          },
          awsRemove.options.stage,
          awsRemove.options.region
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
        .stub(awsRemove, 'setServerlessDeploymentBucketName').returns(BbPromise.resolve());
      const listObjectsStub = sinon
        .stub(awsRemove, 'listObjects').returns(BbPromise.resolve());
      const deleteObjectsStub = sinon
        .stub(awsRemove, 'deleteObjects').returns(BbPromise.resolve());

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
