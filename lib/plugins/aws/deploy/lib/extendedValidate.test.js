'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

describe('extendedValidate', () => {
  let awsDeploy;
  const tmpDirPath = testUtils.getTmpDirPath();

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
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.utils.writeFileSync(serverlessYmlPath, serverlessYml);
    serverless.config.servicePath = tmpDirPath;
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.service.service = `service-${(new Date()).getTime().toString()}`;
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('extendedValidate()', () => {
    let fileExistsSyncStub;
    let readFileSyncStub;

    beforeEach(() => {
      fileExistsSyncStub = sinon
        .stub(awsDeploy.serverless.utils, 'fileExistsSync');
      readFileSyncStub = sinon
        .stub(awsDeploy.serverless.utils, 'readFileSync');
      awsDeploy.serverless.service.package.individually = false;
    });

    afterEach(() => {
      awsDeploy.serverless.utils.fileExistsSync.restore();
      awsDeploy.serverless.utils.readFileSync.restore();
    });

    it('should throw error if state file does not exist', () => {
      fileExistsSyncStub.returns(false);

      expect(() => awsDeploy.extendedValidate()).to.throw(Error);
    });

    it('should throw error if packaged individually but functions packages do not exist', () => {
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      readFileSyncStub.returns(stateFileMock);

      awsDeploy.serverless.service.package.individually = true;

      expect(() => awsDeploy.extendedValidate()).to.throw(Error);
    });

    it('should throw error if service package does not exist', () => {
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      readFileSyncStub.returns(stateFileMock);

      expect(() => awsDeploy.extendedValidate()).to.throw(Error);
    });

    it('should not throw error if service has no functions and no service package', () => {
      stateFileMock.service.functions = {};
      fileExistsSyncStub.returns(true);
      readFileSyncStub.returns(stateFileMock);

      return awsDeploy.extendedValidate().then(() => {
        expect(fileExistsSyncStub.calledOnce).to.equal(true);
        expect(readFileSyncStub.calledOnce).to.equal(true);
      });
    });

    it('should not throw error if service has no functions and no function packages', () => {
      stateFileMock.service.functions = {};
      awsDeploy.serverless.service.package.individually = true;
      fileExistsSyncStub.returns(true);
      readFileSyncStub.returns(stateFileMock);

      return awsDeploy.extendedValidate().then(() => {
        expect(fileExistsSyncStub.calledOnce).to.equal(true);
        expect(readFileSyncStub.calledOnce).to.equal(true);
      });
    });

    it('should use function package level artifact when provided', () => {
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

      return awsDeploy.extendedValidate().then(() => {
        expect(fileExistsSyncStub.calledTwice).to.equal(true);
        expect(readFileSyncStub.calledOnce).to.equal(true);
        expect(fileExistsSyncStub).to.have.been.calledWithExactly('artifact.zip');
      });
    });

    it('should throw error if specified package artifact does not exist', () => {
      // const fileExistsSyncStub = sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync');
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      readFileSyncStub.returns(stateFileMock);
      awsDeploy.serverless.service.package.artifact = 'some/file.zip';
      expect(() => awsDeploy.extendedValidate()).to.throw(Error);
      delete awsDeploy.serverless.service.package.artifact;
    });

    it('should not throw error if specified package artifact exists', () => {
      // const fileExistsSyncStub = sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync');
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(true);
      readFileSyncStub.returns(stateFileMock);
      awsDeploy.serverless.service.package.artifact = 'some/file.zip';
      return awsDeploy.extendedValidate().then(() => {
        delete awsDeploy.serverless.service.package.artifact;
      });
    });
  });
});
