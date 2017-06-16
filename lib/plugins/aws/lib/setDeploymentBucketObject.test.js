'use strict';

const chai = require('chai');
const Serverless = require('../../../Serverless');
const ServerlessPlugin = require('../../../../tests/utils').ServerlessPlugin;
const setDeploymentBucketObject = require('./setDeploymentBucketObject');

// Configure chai
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('#setDeploymentBucketObject()', () => {
  let serverless;
  let serverlessPlugin;

  beforeEach(() => {
    serverless = new Serverless();
    serverlessPlugin = new ServerlessPlugin(serverless, {}, setDeploymentBucketObject);
  });

  describe('#setDeploymentBucketObject()', () => {
    it('should resolve if the deploymentBucket config is not given', () => expect(
      serverlessPlugin.setDeploymentBucketObject()).to.be.fulfilled
    );

    it('should do nothing if the deploymentBucket config is a string', () => {
      serverlessPlugin.serverless.service.provider.deploymentBucket = 'my.deployment.bucket';

      return expect(serverlessPlugin.setDeploymentBucketObject())
        .to.be.fulfilled.then(() => {
          expect(serverlessPlugin.serverless.service.provider.deploymentBucket)
            .to.equal('my.deployment.bucket');
        });
    });

    it('should save the object and use the name for the deploymentBucket config', () => {
      const deploymentBucketObject = {
        name: 'my.deployment.bucket',
        serverSideEncryption: 'AES256',
      };
      serverlessPlugin.serverless.service.provider.deploymentBucket = deploymentBucketObject;

      return expect(serverlessPlugin.setDeploymentBucketObject())
        .to.be.fulfilled.then(() => {
          expect(serverlessPlugin.serverless.service.provider.deploymentBucket)
            .to.equal('my.deployment.bucket');
          expect(serverlessPlugin.serverless.service.provider.deploymentBucketObject)
            .to.deep.equal(deploymentBucketObject);
        });
    });
  });
});
