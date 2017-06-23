'use strict';

const sinon = require('sinon');
const path = require('path');
const expect = require('chai').expect;
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');
const fs = require('fs');
const fse = require('fs-extra');

describe('uploadArtifacts', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.config.servicePath = 'foo';
    serverless.setProvider('aws', new AwsProvider(serverless));
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.service.package.artifactDirectoryName = 'somedir';
    awsDeploy.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };

    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#uploadCloudFormationFiles()', () => {
    it('should upload all CloudFormation files to the S3 bucket', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const serverlessDirPath = path.join(tmpDirPath, '.serverless');
      fse.mkdirsSync(serverlessDirPath);
      awsDeploy.serverless.config.servicePath = tmpDirPath;
      const cfFile1Name = 'cloudformation-1.json';
      const cfFile2Name = 'cloudformation-2.json';
      const cfFile1Path = path.join(serverlessDirPath, cfFile1Name);
      const cfFile2Path = path.join(serverlessDirPath, cfFile2Name);
      fse.writeJsonSync(cfFile1Path, { foo: 'bar' });
      fse.writeJsonSync(cfFile2Path, { baz: 'qux' });

      const putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();

      return awsDeploy.uploadCloudFormationFiles().then(() => {
        expect(putObjectStub.callCount).to.be.equal(2);

        // the Body value of the putObject call is unpredictable
        // we'll just test the other parts to ensure that this call is correct
        const Key1 = path.join(
          awsDeploy.serverless.service.package.artifactDirectoryName, cfFile1Name);
        const Key2 = path.join(
          awsDeploy.serverless.service.package.artifactDirectoryName, cfFile2Name);

        expect(putObjectStub.firstCall.args[0]).to.equal('S3');
        expect(putObjectStub.firstCall.args[1]).to.equal('putObject');
        expect(putObjectStub.firstCall.args[2].Bucket).to.equal(awsDeploy.bucketName);
        expect(putObjectStub.firstCall.args[2].Key).to.equal(Key1);
        expect(putObjectStub.firstCall.args[2].ContentType).to.equal('application/json');
        expect(putObjectStub.firstCall.args[3]).to.equal(awsDeploy.options.stage);
        expect(putObjectStub.firstCall.args[4]).to.equal(awsDeploy.options.region);

        expect(putObjectStub.secondCall.args[0]).to.equal('S3');
        expect(putObjectStub.secondCall.args[1]).to.equal('putObject');
        expect(putObjectStub.secondCall.args[2].Bucket).to.equal(awsDeploy.bucketName);
        expect(putObjectStub.secondCall.args[2].Key).to.equal(Key2);
        expect(putObjectStub.secondCall.args[2].ContentType).to.equal('application/json');
        expect(putObjectStub.secondCall.args[3]).to.equal(awsDeploy.options.stage);
        expect(putObjectStub.secondCall.args[4]).to.equal(awsDeploy.options.region);

        awsDeploy.provider.request.restore();
      });
    });

    it('should upload to a bucket with server side encryption bucket policy', () => {
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { key: 'value' };
      awsDeploy.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'AES256',
      };

      const putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();

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
            ServerSideEncryption: 'AES256',
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
      sinon.stub(awsDeploy.provider, 'request').resolves();
      expect(() => awsDeploy.uploadZipFile(null)).to.throw(Error);
    });

    it('should upload the .zip file to the S3 bucket', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      const putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();

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

    it('should upload to a bucket with server side encryption bucket policy', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');
      awsDeploy.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'AES256',
      };
      const putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();

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
            ServerSideEncryption: 'AES256',
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
      awsDeploy.serverless.config.servicePath = 'some/path';
      awsDeploy.serverless.service.service = 'new-service';

      sinon.stub(fs, 'statSync').returns({ size: 0 });

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').resolves();

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledOnce).to.be.equal(true);
        fs.statSync.restore();
        awsDeploy.uploadZipFile.restore();
      });
    });

    it('should upload the function .zip files to the S3 bucket', () => {
      awsDeploy.serverless.service.package.individually = true;
      awsDeploy.serverless.service.functions = {
        first: {
          package: {
            artifact: 'first-artifact.zip',
          },
        },
        second: {
          package: {
            artifact: 'second-artifact.zip',
          },
        },
      };

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').resolves();

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0])
          .to.be.equal(awsDeploy.serverless.service.functions.first.package.artifact);
        expect(uploadZipFileStub.args[1][0])
          .to.be.equal(awsDeploy.serverless.service.functions.second.package.artifact);
        awsDeploy.uploadZipFile.restore();
      });
    });

    it('should upload single function artifact and service artifact', () => {
      awsDeploy.serverless.service.package.artifact = 'second-artifact.zip';
      awsDeploy.serverless.service.functions = {
        first: {
          handler: 'bar',
          package: {
            artifact: 'first-artifact.zip',
            individually: true,
          },
        },
        second: {
          handler: 'foo',
        },
      };

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').resolves();
      sinon.stub(fs, 'statSync').returns({ size: 1024 });

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0])
          .to.be.equal(awsDeploy.serverless.service.functions.first.package.artifact);
        expect(uploadZipFileStub.args[1][0])
          .to.be.equal(awsDeploy.serverless.service.package.artifact);
        awsDeploy.uploadZipFile.restore();
        fs.statSync.restore();
      });
    });

    it('should log artifact size', () => {
      awsDeploy.serverless.config.servicePath = 'some/path';
      awsDeploy.serverless.service.service = 'new-service';

      sinon.stub(fs, 'statSync').returns({ size: 1024 });
      sinon.stub(awsDeploy, 'uploadZipFile').resolves();
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
    it('should run promise chain in order', () => {
      const uploadCloudFormationFilesStub = sinon
        .stub(awsDeploy, 'uploadCloudFormationFiles').resolves();
      const uploadFunctionsStub = sinon
        .stub(awsDeploy, 'uploadFunctions').resolves();

      return awsDeploy.uploadArtifacts().then(() => {
        expect(uploadCloudFormationFilesStub.calledOnce)
          .to.be.equal(true);
        expect(uploadFunctionsStub.calledAfter(uploadCloudFormationFilesStub)).to.be.equal(true);

        awsDeploy.uploadCloudFormationFiles.restore();
        awsDeploy.uploadFunctions.restore();
      });
    });
  });
});
