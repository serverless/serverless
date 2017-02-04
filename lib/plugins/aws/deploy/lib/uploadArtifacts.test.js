'use strict';

const sinon = require('sinon');
const path = require('path');
const BbPromise = require('bluebird');
const expect = require('chai').expect;
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');
const fs = require('fs');

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
        expect(putObjectStub.calledWithExactly(
          'S3',
          'putObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package
              .artifactDirectoryName}/compiled-cloudformation-template.json`,
            Body: JSON.stringify(awsDeploy.serverless.service.provider
              .compiledCloudFormationTemplate),
            ContentType: 'application/json',
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
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

      const putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').returns(BbPromise.resolve());

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
        expect(putObjectStub.calledOnce).to.be.equal(true);
        expect(putObjectStub.calledWithExactly(
          'S3',
          'putObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/artifact.zip`,
            Body: sinon.match.object.and(sinon.match.has('path', artifactFilePath)),
            ContentType: 'application/zip',
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
        awsDeploy.provider.request.restore();
      });
    });
  });

  describe('#uploadFunctions()', () => {
    it('should upload the service artifact file to the S3 bucket', () => {
      sinon.stub(fs, 'statSync').returns({ size: 0 });
      const artifactFilePath = 'artifact.zip';

      awsDeploy.serverless.service.package.artifact = artifactFilePath;

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').returns(BbPromise.resolve());

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledOnce).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0]).to.be.equal(artifactFilePath);
        fs.statSync.restore();
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

    it('should log artifact size', () => {
      sinon.stub(fs, 'statSync').returns({ size: 1024 });
      sinon.stub(awsDeploy, 'uploadZipFile').returns(BbPromise.resolve());
      sinon.spy(awsDeploy.serverless.cli, 'log');

      return awsDeploy.uploadFunctions().then(() => {
        const expected = 'Uploading service .zip file to S3 (1 KB)...';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);

        fs.statSync.restore();
        awsDeploy.uploadZipFile.restore();
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
