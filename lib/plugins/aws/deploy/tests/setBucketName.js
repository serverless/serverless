'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

describe('#setBucketName()', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
  });

  it('should store the name of the Serverless deployment bucket in the "this" variable', () => {
    const getServerlessDeploymentBucketNameStub = sinon
      .stub(awsDeploy.sdk, 'getServerlessDeploymentBucketName')
      .returns(BbPromise.resolve('bucket-name'));

    return awsDeploy.setBucketName().then(() => {
      expect(awsDeploy.bucketName).to.equal('bucket-name');
      expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(true);
      expect(getServerlessDeploymentBucketNameStub
        .calledWith(awsDeploy.options.stage, awsDeploy.options.region));
      awsDeploy.sdk.getServerlessDeploymentBucketName.restore();
    });
  });
});
