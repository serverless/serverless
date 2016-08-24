'use strict';

const sinon = require('sinon');
const os = require('os');
const path = require('path');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('uploadArtifacts', () => {
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
    awsDeploy.serverless.service.package.artifactDirectoryName = 'somedir';
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#uploadCloudFormationFile()', () => {
    it('should upload the CloudFormation file to the S3 bucket', () => {
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { key: 'value' };

      const putObjectStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.uploadCloudFormationFile().then(() => {
        expect(putObjectStub.calledOnce).to.be.equal(true);
        expect(putObjectStub.args[0][0]).to.be.equal('S3');
        expect(putObjectStub.args[0][1]).to.be.equal('putObject');
        expect(putObjectStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(putObjectStub.args[0][2].Key)
          .to.be.equal(`${awsDeploy.serverless.service.package
          .artifactDirectoryName}/compiled-cloudformation-template.json`);
        expect(putObjectStub.args[0][2].Body)
          .to.be.equal(JSON.stringify(awsDeploy.serverless.service
          .provider.compiledCloudFormationTemplate));
        expect(putObjectStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));

        awsDeploy.sdk.request.restore();
      });
    });
  });

  describe('#uploadFunctions()', () => {
    it('should upload the .zip file to the S3 bucket', () => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      const artifactFileBuffer = serverless.utils.readFileSync(artifactFilePath);

      awsDeploy.serverless.service.package.artifact = artifactFilePath;

      const putObjectStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.uploadFunctions().then(() => {
        expect(putObjectStub.calledOnce).to.be.equal(true);
        expect(putObjectStub.args[0][0]).to.be.equal('S3');
        expect(putObjectStub.args[0][1]).to.be.equal('putObject');
        expect(putObjectStub.args[0][2].Bucket).to.be.equal(awsDeploy.bucketName);
        expect(putObjectStub.args[0][2].Key)
          .to.be.equal(`${awsDeploy.serverless.service.package
          .artifactDirectoryName}/artifact.zip`);
        expect(putObjectStub.args[0][2].Body.toString())
          .to.be.equal(artifactFileBuffer.toString());
        expect(putObjectStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));

        awsDeploy.sdk.request.restore();
      });
    });
  });

  describe('#uploadArtifacts()', () => {
    it('should resolve if no deploy', () => {
      awsDeploy.options.noDeploy = true;

      const uploadCloudFormationFileStub = sinon
        .stub(awsDeploy, 'uploadCloudFormationFile').returns(BbPromise.resolve());
      const uploadFunctionsStub = sinon
        .stub(awsDeploy, 'uploadFunctions').returns(BbPromise.resolve());

      return awsDeploy.uploadArtifacts().then(() => {
        expect(uploadCloudFormationFileStub.called).to.be.equal(false);
        expect(uploadFunctionsStub.called).to.be.equal(false);

        awsDeploy.uploadCloudFormationFile.restore();
        awsDeploy.uploadFunctions.restore();
      });
    });

    it('should run promise chain in order', () => {
      const uploadCloudFormationFileStub = sinon
        .stub(awsDeploy, 'uploadCloudFormationFile').returns(BbPromise.resolve());
      const uploadFunctionsStub = sinon
        .stub(awsDeploy, 'uploadFunctions').returns(BbPromise.resolve());

      return awsDeploy.uploadArtifacts().then(() => {
        expect(uploadCloudFormationFileStub.calledOnce)
          .to.be.equal(true);
        expect(uploadFunctionsStub.calledAfter(uploadCloudFormationFileStub)).to.be.equal(true);

        awsDeploy.uploadCloudFormationFile.restore();
        awsDeploy.uploadFunctions.restore();
      });
    });
  });
});
