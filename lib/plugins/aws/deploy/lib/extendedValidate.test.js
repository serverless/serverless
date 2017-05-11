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
    it('should throw error if state file does not exist', () => {
      sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync').returns(false);
      expect(() => awsDeploy.extendedValidate()).to.throw(Error);
      awsDeploy.serverless.utils.fileExistsSync.restore();
    });

    it('should throw error if packaged individually but functions packages do not exist', () => {
      const fileExistsSyncStub = sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync');
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      sinon.stub(awsDeploy.serverless.utils, 'readFileSync').returns(stateFileMock);
      awsDeploy.serverless.service.package.individually = true;
      expect(() => awsDeploy.extendedValidate()).to.throw(Error);
      awsDeploy.serverless.service.package.individually = false;
      awsDeploy.serverless.utils.fileExistsSync.restore();
      awsDeploy.serverless.utils.readFileSync.restore();
    });

    it('should throw error if service package does not exist', () => {
      const fileExistsSyncStub = sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync');
      fileExistsSyncStub.onCall(0).returns(true);
      fileExistsSyncStub.onCall(1).returns(false);
      sinon.stub(awsDeploy.serverless.utils, 'readFileSync').returns(stateFileMock);
      expect(() => awsDeploy.extendedValidate()).to.throw(Error);
      awsDeploy.serverless.utils.fileExistsSync.restore();
      awsDeploy.serverless.utils.readFileSync.restore();
    });

    it('should not throw error if service has no functions and no service package available', () => { // eslint-disable-line max-len
      const functionsTmp = stateFileMock.service.functions;
      stateFileMock.service.functions = {};
      sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync').returns(true);
      sinon.stub(awsDeploy.serverless.utils, 'readFileSync').returns(stateFileMock);
      return awsDeploy.extendedValidate().then(() => {
        stateFileMock.service.functions = functionsTmp;
        awsDeploy.serverless.utils.fileExistsSync.restore();
        awsDeploy.serverless.utils.readFileSync.restore();
      });
    });

    it('should not throw error if service has no functions and no function packages available', () => { // eslint-disable-line max-len
      const functionsTmp = stateFileMock.service.functions;
      stateFileMock.service.functions = {};
      awsDeploy.serverless.service.package.individually = true;
      sinon.stub(awsDeploy.serverless.utils, 'fileExistsSync').returns(true);
      sinon.stub(awsDeploy.serverless.utils, 'readFileSync').returns(stateFileMock);
      return awsDeploy.extendedValidate().then(() => {
        awsDeploy.serverless.service.package.individually = false;
        stateFileMock.service.functions = functionsTmp;
        awsDeploy.serverless.utils.fileExistsSync.restore();
        awsDeploy.serverless.utils.readFileSync.restore();
      });
    });
  });
});
