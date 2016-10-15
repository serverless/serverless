'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const AwsProvider = require('../../../awsProvider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('cleanupS3Bucket', () => {
  let serverless;
  let awsDeploy;
  let s3Key;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'cleanupS3Bucket';
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    s3Key = `serverless/${serverless.service.service}/${options.stage}`;
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#getObjectsToRemove()', () => {
    it('should resolve if no objects are found', () => {
      const serviceObjects = {
        Contents: [],
      };

      const listObjectsStub = sinon
        .stub(awsDeploy.aws, 'request').returns(BbPromise.resolve(serviceObjects));

      return awsDeploy.getObjectsToRemove().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.args[0][0]).to.be.equal('S3');
        expect(listObjectsStub.args[0][1]).to.be.equal('listObjectsV2');
        expect(listObjectsStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(listObjectsStub.args[0][2].Prefix).to.be.equal(`${s3Key}`);
        expect(listObjectsStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.aws.request.restore();
      });
    });

    it('should return all to be removed service objects (except the last 4)', () => {
      const serviceObjects = {
        Contents: [
          { Key: `${s3Key}/151224711231-2016-08-18T15:42:00/artifact.zip` },
          { Key: `${s3Key}/151224711231-2016-08-18T15:42:00/cloudformation.json` },
          { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/artifact.zip` },
          { Key: `${s3Key}/141264711231-2016-08-18T15:42:00/cloudformation.json` },
          { Key: `${s3Key}/141321321541-2016-08-18T11:23:02/artifact.zip` },
          { Key: `${s3Key}/141321321541-2016-08-18T11:23:02/cloudformation.json` },
          { Key: `${s3Key}/142003031341-2016-08-18T12:46:04/artifact.zip` },
          { Key: `${s3Key}/142003031341-2016-08-18T12:46:04/cloudformation.json` },
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip` },
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/cloudformation.json` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/artifact.zip` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/cloudformation.json` },
        ],
      };

      const listObjectsStub = sinon
        .stub(awsDeploy.aws, 'request').returns(BbPromise.resolve(serviceObjects));

      return awsDeploy.getObjectsToRemove().then((objectsToRemove) => {
        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/141321321541-2016-08-18T11:23:02/artifact.zip` });

        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/141321321541-2016-08-18T11:23:02/cloudformation.json` });

        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/142003031341-2016-08-18T12:46:04/artifact.zip` });

        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/142003031341-2016-08-18T12:46:04/cloudformation.json` });

        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/151224711231-2016-08-18T15:42:00/artifact.zip` });

        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/151224711231-2016-08-18T15:42:00/cloudformation.json` });

        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/903940390431-2016-08-18T23:42:08/artifact.zip` });

        expect(objectsToRemove).to.not
          .include(
            { Key: `${s3Key}${s3Key}/903940390431-2016-08-18T23:42:08/cloudformation.json` });

        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.args[0][0]).to.be.equal('S3');
        expect(listObjectsStub.args[0][1]).to.be.equal('listObjectsV2');
        expect(listObjectsStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(listObjectsStub.args[0][2].Prefix).to.be.equal(`${s3Key}`);
        expect(listObjectsStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.aws.request.restore();
      });
    });

    it('should return an empty array if there are less than 4 directories available', () => {
      const serviceObjects = {
        Contents: [
          { Key: `${s3Key}151224711231-2016-08-18T15:42:00/artifact.zip` },
          { Key: `${s3Key}151224711231-2016-08-18T15:42:00/cloudformation.json` },
          { Key: `${s3Key}141264711231-2016-08-18T15:42:00/artifact.zip` },
          { Key: `${s3Key}141264711231-2016-08-18T15:42:00/cloudformation.json` },
          { Key: `${s3Key}141321321541-2016-08-18T11:23:02/artifact.zip` },
          { Key: `${s3Key}141321321541-2016-08-18T11:23:02/cloudformation.json` },
        ],
      };

      const listObjectsStub = sinon
        .stub(awsDeploy.aws, 'request').returns(BbPromise.resolve(serviceObjects));

      return awsDeploy.getObjectsToRemove().then((objectsToRemove) => {
        expect(objectsToRemove.length).to.equal(0);
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.args[0][0]).to.be.equal('S3');
        expect(listObjectsStub.args[0][1]).to.be.equal('listObjectsV2');
        expect(listObjectsStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(listObjectsStub.args[0][2].Prefix).to.be.equal(`${s3Key}`);
        expect(listObjectsStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.aws.request.restore();
      });
    });

    it('should resolve if there are exactly 4 directories available', () => {
      const serviceObjects = {
        Contents: [
          { Key: `${s3Key}151224711231-2016-08-18T15:42:00/artifact.zip` },
          { Key: `${s3Key}151224711231-2016-08-18T15:42:00/cloudformation.json` },
          { Key: `${s3Key}141264711231-2016-08-18T15:42:00/artifact.zip` },
          { Key: `${s3Key}141264711231-2016-08-18T15:42:00/cloudformation.json` },
          { Key: `${s3Key}141321321541-2016-08-18T11:23:02/artifact.zip` },
          { Key: `${s3Key}141321321541-2016-08-18T11:23:02/cloudformation.json` },
          { Key: `${s3Key}142003031341-2016-08-18T12:46:04/artifact.zip` },
          { Key: `${s3Key}142003031341-2016-08-18T12:46:04/cloudformation.json` },
        ],
      };

      const listObjectsStub = sinon
        .stub(awsDeploy.aws, 'request').returns(BbPromise.resolve(serviceObjects));

      return awsDeploy.getObjectsToRemove().then((objectsToRemove) => {
        expect(objectsToRemove.length).to.equal(0);
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.args[0][0]).to.be.equal('S3');
        expect(listObjectsStub.args[0][1]).to.be.equal('listObjectsV2');
        expect(listObjectsStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(listObjectsStub.args[0][2].Prefix).to.be.equal(`${s3Key}`);
        expect(listObjectsStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.aws.request.restore();
      });
    });
  });

  describe('#removeObjects()', () => {
    let deleteObjectsStub;

    beforeEach(() => {
      deleteObjectsStub = sinon
        .stub(awsDeploy.aws, 'request').returns(BbPromise.resolve());
    });

    it('should resolve if no service objects are found in the S3 bucket', () => awsDeploy
      .removeObjects().then(() => {
        expect(deleteObjectsStub.calledOnce).to.be.equal(false);
        awsDeploy.aws.request.restore();
      })
    );

    it('should remove all old service files from the S3 bucket if available', () => {
      const objectsToRemove = [
        { Key: `${s3Key}113304333331-2016-08-18T13:40:06/artifact.zip` },
        { Key: `${s3Key}113304333331-2016-08-18T13:40:06/cloudformation.json` },
        { Key: `${s3Key}141264711231-2016-08-18T15:42:00/artifact.zip` },
        { Key: `${s3Key}141264711231-2016-08-18T15:42:00/cloudformation.json` },
      ];

      return awsDeploy.removeObjects(objectsToRemove).then(() => {
        expect(deleteObjectsStub.calledOnce).to.be.equal(true);
        expect(deleteObjectsStub.args[0][0]).to.be.equal('S3');
        expect(deleteObjectsStub.args[0][1]).to.be.equal('deleteObjects');
        expect(deleteObjectsStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(deleteObjectsStub.args[0][2].Delete.Objects).to.be.equal(objectsToRemove);
        expect(deleteObjectsStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.aws.request.restore();
      });
    });
  });

  describe('#cleanupS3Bucket()', () => {
    it('should resolve if no deploy', () => {
      awsDeploy.options.noDeploy = true;

      const getObjectsToRemoveStub = sinon
        .stub(awsDeploy, 'getObjectsToRemove').returns(BbPromise.resolve());
      const removeObjectsStub = sinon
        .stub(awsDeploy, 'removeObjects').returns(BbPromise.resolve());

      return awsDeploy.cleanupS3Bucket().then(() => {
        expect(getObjectsToRemoveStub.called).to.be.equal(false);
        expect(removeObjectsStub.called).to.be.equal(false);

        awsDeploy.getObjectsToRemove.restore();
        awsDeploy.removeObjects.restore();
      });
    });

    it('should run promise chain in order', () => {
      const getObjectsToRemoveStub = sinon
        .stub(awsDeploy, 'getObjectsToRemove').returns(BbPromise.resolve());
      const removeObjectsStub = sinon
        .stub(awsDeploy, 'removeObjects').returns(BbPromise.resolve());

      return awsDeploy.cleanupS3Bucket().then(() => {
        expect(getObjectsToRemoveStub.calledOnce).to.be.equal(true);
        expect(removeObjectsStub.calledAfter(getObjectsToRemoveStub))
          .to.be.equal(true);

        awsDeploy.getObjectsToRemove.restore();
        awsDeploy.removeObjects.restore();
      });
    });
  });
});
