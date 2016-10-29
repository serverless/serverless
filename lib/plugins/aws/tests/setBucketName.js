'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../provider/awsProvider');
const AwsDeploy = require('../deploy/index');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');

describe('#setBucketName()', () => {
  let serverless;
  let awsDeploy;
  let getServerlessDeploymentBucketNameStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);

    getServerlessDeploymentBucketNameStub = sinon
      .stub(awsDeploy.provider, 'getServerlessDeploymentBucketName')
      .returns(BbPromise.resolve('bucket-name'));
  });

  it('should store the name of the Serverless deployment bucket', () => awsDeploy
    .setBucketName().then(() => {
      expect(awsDeploy.bucketName).to.equal('bucket-name');
      expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(true);
      expect(getServerlessDeploymentBucketNameStub.calledWithExactly(
        awsDeploy.options.stage,
        awsDeploy.options.region
      )).to.be.equal(true);
      awsDeploy.provider.getServerlessDeploymentBucketName.restore();
    })
  );

  it('should resolve if no deploy', () => {
    awsDeploy.options.noDeploy = true;

    return awsDeploy.setBucketName().then(() => {
      expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(false);
      awsDeploy.provider.getServerlessDeploymentBucketName.restore();
    });
  });

  it('should resolve if the bucketName is already set', () => {
    const bucketName = 'someBucket';
    awsDeploy.bucketName = bucketName;
    return awsDeploy.setBucketName()
      .then(() => expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.false)
      .then(() => expect(awsDeploy.bucketName).to.equal(bucketName));
  });
});
