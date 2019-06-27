'use strict';

const sinon = require('sinon');
const chai = require('chai');
const AwsProvider = require('../../provider/awsProvider');
const Serverless = require('../../../../Serverless');
const existsDeploymentBucket = require('./existsDeploymentBucket');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('#existsDeploymentBucket()', () => {
  let serverless;
  let awsPluginStub;
  const awsPlugin = {};

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless, options);

    Object.assign(awsPlugin, existsDeploymentBucket);
  });

  it('should validate the region for the given S3 bucket', () => {
    const bucketName = 'com.serverless.deploys';

    awsPluginStub = sinon.stub(awsPlugin.provider, 'request').resolves({
      LocationConstraint: awsPlugin.provider.options.region,
    });

    return expect(awsPlugin.existsDeploymentBucket(bucketName)).to.be.fulfilled.then(() => {
      expect(awsPluginStub.args[0][0]).to.equal('S3');
      expect(awsPluginStub.args[0][1]).to.equal('getBucketLocation');
      expect(awsPluginStub.args[0][2].Bucket).to.equal(bucketName);
    });
  });

  it('should reject an S3 bucket that does not exist', () => {
    const bucketName = 'com.serverless.deploys';
    const errorObj = { message: 'Access Denied' };

    sinon.stub(awsPlugin.provider, 'request').throws(errorObj);
    return expect(awsPlugin.existsDeploymentBucket(bucketName)).to.be.rejected.then(err => {
      expect(awsPluginStub.args[0][0]).to.equal('S3');
      expect(awsPluginStub.args[0][1]).to.equal('getBucketLocation');
      expect(awsPluginStub.args[0][2].Bucket).to.equal(bucketName);
      expect(err.message).to.contain(errorObj.message);
      expect(err.message).to.contain('Could not locate deployment bucket');
    });
  });

  it('should reject an S3 bucket in the wrong region', () => {
    const bucketName = 'com.serverless.deploys';

    sinon.stub(awsPlugin.provider, 'request').resolves({
      LocationConstraint: 'us-west-1',
    });

    return expect(awsPlugin.existsDeploymentBucket(bucketName)).to.be.rejected.then(err => {
      expect(awsPluginStub.args[0][0]).to.equal('S3');
      expect(awsPluginStub.args[0][1]).to.equal('getBucketLocation');
      expect(awsPluginStub.args[0][2].Bucket).to.equal(bucketName);
      expect(err.message).to.contain('not in the same region');
    });
  });

  [{ region: 'eu-west-1', response: 'EU' }, { region: 'us-east-1', response: '' }].forEach(
    value => {
      it(`should handle inconsistent getBucketLocation responses for ${value.region} region`, () => {
        const bucketName = 'com.serverless.deploys';

        awsPlugin.provider.options.region = value.region;

        sinon.stub(awsPlugin.provider, 'request').resolves({
          LocationConstraint: value.response,
        });

        awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
        return expect(awsPlugin.existsDeploymentBucket(bucketName)).to.be.fulfilled.then(() => {
          expect(awsPluginStub.args[0][0]).to.equal('S3');
          expect(awsPluginStub.args[0][1]).to.equal('getBucketLocation');
          expect(awsPluginStub.args[0][2].Bucket).to.equal(bucketName);
        });
      });
    }
  );
});
