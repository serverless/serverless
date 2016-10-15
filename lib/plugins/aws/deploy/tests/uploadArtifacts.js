'use strict';

const sinon = require('sinon');
const path = require('path');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const AwsProvider = require('../../../awsProvider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

describe('uploadArtifacts', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
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
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());

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

        awsDeploy.provider.request.restore();
      });
    });
  });

  describe('#uploadZipFile()', () => {
    it('should throw for null artifact paths', () => {
      sinon.stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());
      expect(() => awsDeploy.uploadZipFile(null)).to.throw(Error);
    });

    it('should throw for empty artifact paths', () => {
      sinon.stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());
      expect(() => awsDeploy.uploadZipFile('')).to.throw(Error);
    });

    it('should upload the .zip file to the S3 bucket', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      const artifactFileBuffer = serverless.utils.readFileSync(artifactFilePath);

      const putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
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

        awsDeploy.provider.request.restore();
      });
    });
  });

  describe('#uploadFunctions()', () => {
    it('should upload the service artifact file to the S3 bucket', () => {
      const artifactFilePath = 'artifact.zip';

      awsDeploy.serverless.service.package.artifact = artifactFilePath;

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').returns(BbPromise.resolve());

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledOnce).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0]).to.be.equal(artifactFilePath);
      });
    });

    it('should upload the function .zip files to the S3 bucket', () => {
      awsDeploy.serverless.service.package.individually = true;
      awsDeploy.serverless.service.functions = {
        first: {
          artifact: 'first-artifact.zip',
        },
        second: {
          artifact: 'second-artifact.zip',
        },
      };

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').returns(BbPromise.resolve());

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0])
          .to.be.equal(awsDeploy.serverless.service.functions.first.artifact);
        expect(uploadZipFileStub.args[1][0])
          .to.be.equal(awsDeploy.serverless.service.functions.second.artifact);
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
