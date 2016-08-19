'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#uploadCloudFormationTemplate()', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  it('should upload the CloudFormation template file to the S3 bucket', () => {
    awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { key: 'value' };

    const putObjectStub = sinon
      .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

    return awsDeploy.uploadCloudFormationTemplate().then(() => {
      expect(putObjectStub.calledOnce).to.be.equal(true);
      expect(putObjectStub.args[0][0]).to.be.equal('S3');
      expect(putObjectStub.args[0][1]).to.be.equal('putObject');
      expect(putObjectStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
      expect(putObjectStub.args[0][2].Key).to.be.equal('compiled-cloudformation-template.json');
      expect(putObjectStub.args[0][2].Body)
        .to.be.equal(JSON.stringify(awsDeploy.serverless.service
          .provider.compiledCloudFormationTemplate));

      expect(putObjectStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
      awsDeploy.sdk.request.restore();
    });
  });

  it('should resolve if no deploy', () => {
    awsDeploy.options.noDeploy = true;

    const putObjectStub = sinon
      .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

    return awsDeploy.uploadCloudFormationTemplate().then(() => {
      expect(putObjectStub.called).to.be.equal(false);

      awsDeploy.sdk.request.restore();
    });
  });
});
