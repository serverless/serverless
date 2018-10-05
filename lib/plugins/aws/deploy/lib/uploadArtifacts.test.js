'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const chai = require('chai');
const proxyquire = require('proxyquire');
const normalizeFiles = require('../../lib/normalizeFiles');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('uploadArtifacts', () => {
  let serverless;
  let awsDeploy;
  let cryptoStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.config.servicePath = 'foo';
    serverless.setProvider('aws', new AwsProvider(serverless, {}));
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
    awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = {
      foo: 'bar',
    };
    awsDeploy.serverless.cli = new serverless.classes.CLI();
    cryptoStub = {
      createHash: function () { return this; }, // eslint-disable-line
      update: function () { return this; }, // eslint-disable-line
      digest: sinon.stub(),
    };
    const uploadArtifacts = proxyquire('./uploadArtifacts.js', {
      crypto: cryptoStub,
    });
    Object.assign(
      awsDeploy,
      uploadArtifacts
    );
  });

  describe('#uploadArtifacts()', () => {
    it('should run promise chain in order', () => {
      const uploadCloudFormationFileStub = sinon
        .stub(awsDeploy, 'uploadCloudFormationFile').resolves();
      const uploadFunctionsStub = sinon
        .stub(awsDeploy, 'uploadFunctions').resolves();

      return awsDeploy.uploadArtifacts().then(() => {
        expect(uploadCloudFormationFileStub.calledOnce)
          .to.be.equal(true);

        expect(uploadFunctionsStub.calledAfter(uploadCloudFormationFileStub)).to.be.equal(true);

        awsDeploy.uploadCloudFormationFile.restore();
        awsDeploy.uploadFunctions.restore();
      });
    });
  });

  describe('#uploadCloudFormationFile()', () => {
    let normalizeCloudFormationTemplateStub;
    let uploadStub;

    beforeEach(() => {
      normalizeCloudFormationTemplateStub = sinon
        .stub(normalizeFiles, 'normalizeCloudFormationTemplate')
        .returns();
      uploadStub = sinon
        .stub(awsDeploy.provider, 'request')
        .resolves();
    });

    afterEach(() => {
      normalizeCloudFormationTemplateStub.restore();
      uploadStub.restore();
    });

    it('should upload the CloudFormation file to the S3 bucket', () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-cf-template');

      return awsDeploy.uploadCloudFormationFile().then(() => {
        expect(normalizeCloudFormationTemplateStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledWithExactly(
          'S3',
          'upload',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package
              .artifactDirectoryName}/compiled-cloudformation-template.json`,
            Body: JSON.stringify({ foo: 'bar' }),
            ContentType: 'application/json',
            Metadata: {
              filesha256: 'local-hash-cf-template',
            },
          });
        expect(normalizeCloudFormationTemplateStub).to.have.been.calledWithExactly({ foo: 'bar' });
      });
    });

    it('should upload the CloudFormation file to a bucket with SSE bucket policy', () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-cf-template');
      awsDeploy.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'AES256',
      };

      return awsDeploy.uploadCloudFormationFile().then(() => {
        expect(normalizeCloudFormationTemplateStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledWithExactly(
          'S3',
          'upload',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package
              .artifactDirectoryName}/compiled-cloudformation-template.json`,
            Body: JSON.stringify({ foo: 'bar' }),
            ContentType: 'application/json',
            ServerSideEncryption: 'AES256',
            Metadata: {
              filesha256: 'local-hash-cf-template',
            },
          });
        expect(normalizeCloudFormationTemplateStub).to.have.been.calledWithExactly({ foo: 'bar' });
      });
    });
  });

  describe('#uploadZipFile()', () => {
    let readFileSyncStub;
    let uploadStub;

    beforeEach(() => {
      readFileSyncStub = sinon
        .stub(fs, 'readFileSync')
        .returns();
      uploadStub = sinon
        .stub(awsDeploy.provider, 'request')
        .resolves();
    });

    afterEach(() => {
      readFileSyncStub.restore();
      uploadStub.restore();
    });

    it('should throw for null artifact paths', () => {
      expect(() => awsDeploy.uploadZipFile(null)).to.throw(Error);
    });

    it('should upload the .zip file to the S3 bucket', () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-zip-file');

      const tmpDirPath = testUtils.getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
        expect(uploadStub).to.have.been.calledOnce;
        expect(readFileSyncStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledWithExactly(
          'S3',
          'upload',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/artifact.zip`,
            Body: sinon.match.object.and(sinon.match.has('path', artifactFilePath)),
            ContentType: 'application/zip',
            Metadata: {
              filesha256: 'local-hash-zip-file',
            },
          });
        expect(readFileSyncStub).to.have.been.calledWithExactly(artifactFilePath);
      });
    });

    it('should upload the .zip file to a bucket with SSE bucket policy', () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-zip-file');

      const tmpDirPath = testUtils.getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');
      awsDeploy.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'AES256',
      };

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
        expect(uploadStub).to.have.been.calledOnce;
        expect(readFileSyncStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledWithExactly(
          'S3',
          'upload',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/artifact.zip`,
            Body: sinon.match.object.and(sinon.match.has('path', artifactFilePath)),
            ContentType: 'application/zip',
            ServerSideEncryption: 'AES256',
            Metadata: {
              filesha256: 'local-hash-zip-file',
            },
          });
        expect(readFileSyncStub).to.have.been.calledWithExactly(artifactFilePath);
      });
    });
  });

  describe('#uploadFunctions()', () => {
    let uploadZipFileStub;

    beforeEach(() => {
      sinon.stub(fs, 'statSync').returns({ size: 1024 });
      uploadZipFileStub = sinon.stub(awsDeploy, 'uploadZipFile').resolves();
    });

    afterEach(() => {
      fs.statSync.restore();
      uploadZipFileStub.restore();
    });

    it('should upload the service artifact file to the S3 bucket', () => {
      awsDeploy.serverless.config.servicePath = 'some/path';
      awsDeploy.serverless.service.service = 'new-service';

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledOnce).to.be.equal(true);
        const expectedPath = path.join('foo', '.serverless', 'new-service.zip');
        expect(uploadZipFileStub.args[0][0]).to.be.equal(expectedPath);
      });
    });

    it('should upload a single .zip file to the S3 bucket when not packaging individually', () => {
      awsDeploy.serverless.service.functions = {
        first: {
          package: {
            artifact: 'artifact.zip',
          },
        },
        second: {
          package: {
            artifact: 'artifact.zip',
          },
        },
      };

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledOnce).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0]).to.be.equal('artifact.zip');
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

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0])
          .to.be.equal(awsDeploy.serverless.service.functions.first.package.artifact);
        expect(uploadZipFileStub.args[1][0])
          .to.be.equal(awsDeploy.serverless.service.functions.second.package.artifact);
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

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0])
          .to.be.equal(awsDeploy.serverless.service.functions.first.package.artifact);
        expect(uploadZipFileStub.args[1][0])
          .to.be.equal(awsDeploy.serverless.service.package.artifact);
      });
    });

    it('should log artifact size', () => {
      awsDeploy.serverless.config.servicePath = 'some/path';
      awsDeploy.serverless.service.service = 'new-service';

      sinon.spy(awsDeploy.serverless.cli, 'log');

      return awsDeploy.uploadFunctions().then(() => {
        const expected = 'Uploading service .zip file to S3 (1 KB)...';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);
      });
    });
  });
});
