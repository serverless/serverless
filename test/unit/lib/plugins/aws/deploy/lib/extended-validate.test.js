'use strict';

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider');
const AwsDeploy = require('../../../../../../../lib/plugins/aws/deploy/index');
const Serverless = require('../../../../../../../lib/serverless');
const { getTmpDirPath } = require('../../../../../../utils/fs');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('extendedValidate', () => {
  let awsDeploy;
  const tmpDirPath = getTmpDirPath();

  const serverlessYmlPath = path.join(tmpDirPath, 'serverless.yml');
  const serverlessYml = {
    service: 'first-service',
    provider: 'aws',
    functions: {
      first: {
        handler: 'sample.handler',
      },
    },
  };
  const stateFileMock = {
    service: serverlessYml,
    package: {
      individually: true,
      artifactDirectoryName: 'some/path',
      artifact: '',
    },
  };

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    const serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.utils.writeFileSync(serverlessYmlPath, serverlessYml);
    serverless.serviceDir = tmpDirPath;
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.service.service = `service-${new Date().getTime().toString()}`;
    awsDeploy.serverless.cli = {
      log: sinon.spy(),
    };
  });

  describe('extendedValidate()', () => {
    let fileExistsSyncStub;
    let readFileSyncStub;

    beforeEach(() => {
      fileExistsSyncStub = sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync');
      readFileSyncStub = sinon.stub(awsDeploy.serverless.utils, 'readFileSync');
      awsDeploy.serverless.service.package.individually = false;
    });

    afterEach(() => {
      fileExistsSyncStub.restore();
      readFileSyncStub.restore();
    });

    it('should throw error if state file does not exist', async () => {
      fileExistsSyncStub.returns(false);

      await expect(awsDeploy.extendedValidate()).to.eventually.be.rejectedWith(Error);
    });

    it('should throw error if packaged individually but functions packages do not exist', async () => {
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      readFileSyncStub.returns(stateFileMock);

      awsDeploy.serverless.service.package.individually = true;

      await expect(awsDeploy.extendedValidate()).to.eventually.be.rejectedWith(Error);
    });

    it('should throw error if service package does not exist', async () => {
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      readFileSyncStub.returns(stateFileMock);

      await expect(awsDeploy.extendedValidate()).to.eventually.be.rejectedWith(Error);
    });

    it('should not throw error if service has no functions and no service package', async () => {
      stateFileMock.service.functions = {};
      fileExistsSyncStub.returns(true);
      readFileSyncStub.returns(stateFileMock);

      await awsDeploy.extendedValidate();
      expect(fileExistsSyncStub.calledOnce).to.equal(true);
      expect(readFileSyncStub.calledOnce).to.equal(true);
    });

    it('should not throw error if service has no functions and no function packages', async () => {
      stateFileMock.service.functions = {};
      awsDeploy.serverless.service.package.individually = true;
      fileExistsSyncStub.returns(true);
      readFileSyncStub.returns(stateFileMock);

      await awsDeploy.extendedValidate();
      expect(fileExistsSyncStub.calledOnce).to.equal(true);
      expect(readFileSyncStub.calledOnce).to.equal(true);
    });

    it('should not throw error if individual packaging defined on a function level', async () => {
      awsDeploy.serverless.service.package.individually = false;
      stateFileMock.service.functions = {
        first: {
          package: {
            individually: true,
          },
        },
      };
      fileExistsSyncStub.returns(true);
      readFileSyncStub.returns(stateFileMock);
      return awsDeploy.extendedValidate();
    });

    it('should use function package level artifact when provided', async () => {
      stateFileMock.service.functions = {
        first: {
          package: {
            artifact: 'artifact.zip',
          },
        },
      };
      awsDeploy.serverless.service.package.individually = true;
      fileExistsSyncStub.returns(true);
      readFileSyncStub.returns(stateFileMock);

      await awsDeploy.extendedValidate();
      expect(fileExistsSyncStub.calledTwice).to.equal(true);
      expect(readFileSyncStub.calledOnce).to.equal(true);
      expect(fileExistsSyncStub).to.have.been.calledWithExactly('artifact.zip');
    });

    it('should throw error if specified package artifact does not exist', async () => {
      // const fileExistsSyncStub = sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync');
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      readFileSyncStub.returns(stateFileMock);
      awsDeploy.serverless.service.package.artifact = 'some/file.zip';
      await expect(awsDeploy.extendedValidate()).to.eventually.be.rejectedWith(Error);
      delete awsDeploy.serverless.service.package.artifact;
    });

    it('should not throw error if specified package artifact exists', async () => {
      // const fileExistsSyncStub = sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync');
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(true);
      readFileSyncStub.returns(stateFileMock);
      awsDeploy.serverless.service.package.artifact = 'some/file.zip';
      await awsDeploy.extendedValidate();
      delete awsDeploy.serverless.service.package.artifact;
    });
  });
});
