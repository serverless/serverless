'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const chai = require('chai');
const proxyquire = require('proxyquire');
const normalizeFiles = require('../../../../../../../lib/plugins/aws/lib/normalizeFiles');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider');
const AwsDeploy = require('../../../../../../../lib/plugins/aws/deploy/index');
const Serverless = require('../../../../../../../lib/Serverless');
const { getTmpDirPath, createTmpDir } = require('../../../../../../utils/fs');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('uploadArtifacts', () => {
  let serverless;
  let awsDeploy;
  let cryptoStub;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    serverless.serviceDir = 'foo';
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
      createHash() {
        return this;
      },
      update() {
        return this;
      },
      digest: sinon.stub(),
    };
    const uploadArtifacts = proxyquire(
      '../../../../../../../lib/plugins/aws/deploy/lib/uploadArtifacts.js',
      {
        crypto: cryptoStub,
      }
    );
    Object.assign(awsDeploy, uploadArtifacts);
  });

  describe('#uploadCloudFormationFile()', () => {
    let normalizeCloudFormationTemplateStub;
    let uploadStub;

    beforeEach(() => {
      normalizeCloudFormationTemplateStub = sinon
        .stub(normalizeFiles, 'normalizeCloudFormationTemplate')
        .returns();
      uploadStub = sinon.stub(awsDeploy.provider, 'request').resolves();
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
        expect(uploadStub).to.have.been.calledWithExactly('S3', 'upload', {
          Bucket: awsDeploy.bucketName,
          Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/compiled-cloudformation-template.json`,
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
        expect(uploadStub).to.have.been.calledWithExactly('S3', 'upload', {
          Bucket: awsDeploy.bucketName,
          Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/compiled-cloudformation-template.json`,
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
      readFileSyncStub = sinon.stub(fs, 'readFileSync').returns();
      uploadStub = sinon.stub(awsDeploy.provider, 'request').resolves();
    });

    afterEach(() => {
      readFileSyncStub.restore();
      uploadStub.restore();
    });

    it('should throw for null artifact paths', async () => {
      await expect(awsDeploy.uploadZipFile(null)).to.be.rejectedWith(Error);
    });

    it('should upload the .zip file to the S3 bucket', () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-zip-file');

      const tmpDirPath = getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
        expect(uploadStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledWithExactly('S3', 'upload', {
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

      const tmpDirPath = getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');
      awsDeploy.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'AES256',
      };

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
        expect(uploadStub).to.have.been.calledOnce;
        expect(readFileSyncStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledWithExactly('S3', 'upload', {
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

  describe('#uploadFunctionsAndLayers()', () => {
    let uploadZipFileStub;

    beforeEach(() => {
      sinon.stub(fs.promises, 'stat').resolves({ size: 1024 });
      uploadZipFileStub = sinon.stub(awsDeploy, 'uploadZipFile').resolves();
    });

    afterEach(() => {
      fs.promises.stat.restore();
      uploadZipFileStub.restore();
    });

    it('should upload the service artifact file to the S3 bucket', () => {
      awsDeploy.serverless.serviceDir = 'some/path';
      awsDeploy.serverless.service.service = 'new-service';

      return awsDeploy.uploadFunctionsAndLayers().then(() => {
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

      return awsDeploy.uploadFunctionsAndLayers().then(() => {
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

      return awsDeploy.uploadFunctionsAndLayers().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0]).to.be.equal(
          awsDeploy.serverless.service.functions.first.package.artifact
        );
        expect(uploadZipFileStub.args[1][0]).to.be.equal(
          awsDeploy.serverless.service.functions.second.package.artifact
        );
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

      return awsDeploy.uploadFunctionsAndLayers().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0]).to.be.equal(
          awsDeploy.serverless.service.functions.first.package.artifact
        );
        expect(uploadZipFileStub.args[1][0]).to.be.equal(
          awsDeploy.serverless.service.package.artifact
        );
      });
    });
  });

  describe('#uploadCustomResources()', () => {
    let uploadStub;
    let serviceDirPath;
    let customResourcesFilePath;

    beforeEach(() => {
      uploadStub = sinon.stub(awsDeploy.provider, 'request').resolves();
      serviceDirPath = createTmpDir();
      customResourcesFilePath = path.join(serviceDirPath, '.serverless', 'custom-resources.zip');
      // Ensure no file stream is created, as by having provider.request mocked it'll be not consumed.
      // File stream points file in temporary home folder which is cleaned after this test file is run.
      // There were observed race conditions (mostly in Node.js v6) where this temporary home
      // folder was cleaned before stream initialized fully, hence throwing uncaught
      // ENOENT exception into the air.
      sinon.stub(fs, 'createReadStream').returns({ path: customResourcesFilePath, on: () => {} });
      serverless.serviceDir = serviceDirPath;
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should not attempt to upload a custom resources if the artifact does not exist', () => {
      return expect(awsDeploy.uploadCustomResources()).to.eventually.be.fulfilled.then(() => {
        expect(uploadStub).not.to.be.calledOnce;
      });
    });

    it('should upload the custom resources .zip file to the S3 bucket', () => {
      fse.ensureFileSync(customResourcesFilePath);

      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-zip-file');

      return expect(awsDeploy.uploadCustomResources()).to.eventually.be.fulfilled.then(() => {
        expect(uploadStub).to.have.been.calledOnce;
        expect(uploadStub).to.have.been.calledWithExactly('S3', 'upload', {
          Bucket: awsDeploy.bucketName,
          Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/custom-resources.zip`,
          Body: sinon.match.object.and(sinon.match.has('path', customResourcesFilePath)),
          ContentType: 'application/zip',
          Metadata: {
            filesha256: 'local-hash-zip-file',
          },
        });
      });
    });
  });
});
