'use strict';

const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const sinon = require('sinon');

describe('AwsDeploy', () => {
  const serverless = new Serverless();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  const awsDeploy = new AwsDeploy(serverless, options);
  awsDeploy.serverless.cli = new serverless.classes.CLI();

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeploy.hooks).to.be.not.empty);

    it('should set the provider variable to "aws"', () => expect(awsDeploy.provider)
      .to.equal('aws'));

    it('should run "before:deploy:initialize" hook promise chain in order', () => {
      const validateStub = sinon
        .stub(awsDeploy, 'validate').returns(BbPromise.resolve());

      return awsDeploy.hooks['before:deploy:initialize']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        awsDeploy.validate.restore();
      });
    });

    it('should run "deploy:setupProviderConfiguration" hook promise chain in order', () => {
      const createStackStub = sinon
        .stub(awsDeploy, 'createStack').returns(BbPromise.resolve());

      return awsDeploy.hooks['deploy:setupProviderConfiguration']().then(() => {
        expect(createStackStub.calledOnce).to.be.equal(true);
        awsDeploy.createStack.restore();
      });
    });

    it('should run "before:deploy:compileFunctions" promise chain in order', () => {
      const generateArtifactDirectoryNameStub = sinon
        .stub(awsDeploy, 'generateArtifactDirectoryName').returns(BbPromise.resolve());

      return awsDeploy.hooks['before:deploy:compileFunctions']().then(() => {
        expect(generateArtifactDirectoryNameStub.calledOnce).to.be.equal(true);
        awsDeploy.generateArtifactDirectoryName.restore();
      });
    });

    it('should run "before:deploy:deploy" promise chain in order', () => {
      const mergeCustomProviderResourcesStub = sinon
        .stub(awsDeploy, 'mergeCustomProviderResources').returns(BbPromise.resolve());

      return awsDeploy.hooks['before:deploy:deploy']().then(() => {
        expect(mergeCustomProviderResourcesStub.calledOnce).to.be.equal(true);
        awsDeploy.mergeCustomProviderResources.restore();
      });
    });

    it('should run "deploy:deploy" promise chain in order', () => {
      const getServerlessDeploymentBucketNameStub = sinon
        .stub(awsDeploy.sdk, 'getServerlessDeploymentBucketName').returns(BbPromise.resolve());
      const cleanupS3BucketStub = sinon
        .stub(awsDeploy, 'cleanupS3Bucket').returns(BbPromise.resolve());
      const uploadArtifactsStub = sinon
        .stub(awsDeploy, 'uploadArtifacts').returns(BbPromise.resolve());
      const deployFunctionsStub = sinon
        .stub(awsDeploy, 'deployFunctions').returns(BbPromise.resolve());
      const updateStackStub = sinon
        .stub(awsDeploy, 'updateStack').returns(BbPromise.resolve());

      return awsDeploy.hooks['deploy:deploy']().then(() => {
        expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(true);
        expect(cleanupS3BucketStub.calledAfter(getServerlessDeploymentBucketNameStub))
          .to.be.equal(true);
        expect(uploadArtifactsStub.calledAfter(cleanupS3BucketStub))
          .to.be.equal(true);
        expect(deployFunctionsStub.calledAfter(uploadArtifactsStub)).to.be.equal(true);
        expect(updateStackStub.calledAfter(deployFunctionsStub)).to.be.equal(true);

        awsDeploy.sdk.getServerlessDeploymentBucketName.restore();
        awsDeploy.cleanupS3Bucket.restore();
        awsDeploy.uploadArtifacts.restore();
        awsDeploy.deployFunctions.restore();
        awsDeploy.updateStack.restore();
      });
    });
  });
});
