'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');
const platform = require('@serverless/platform-sdk');
const fs = require('fs');
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('createDeployment', () => {
  let awsDeploy;
  let serverless;
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
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.utils.writeFileSync(serverlessYmlPath, serverlessYml);
    serverless.config.servicePath = tmpDirPath;
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.service.service = `service-${(new Date()).getTime().toString()}`;
    awsDeploy.serverless.cli = {
      log: sinon.spy(),
    };
  });


  describe('#createDeployment', () => {
    let fileExistsSyncStub;
    let platformStub;
    let getArtifactPathSpy;
    let fsStub;

    beforeEach(() => {
      fileExistsSyncStub = sinon
        .stub(awsDeploy.serverless.utils, 'fileExistsSync');
      awsDeploy.serverless.service.package.individually = false;
      platformStub = sinon.stub(platform, 'createDeployment').resolves({ id: 'abc123' });
      getArtifactPathSpy = sinon.spy(serverless, 'getArtifactPath');
      stateFileMock.service.functions = {};
      fileExistsSyncStub.returns(true);
      fsStub = sinon.stub(fs, 'readFileSync').returns(JSON.stringify(stateFileMock));
    });

    afterEach(() => {
      fileExistsSyncStub.restore();
      platformStub.restore();
      getArtifactPathSpy.restore();
      fsStub.restore();
    });

    it('should call createDeployment', () => {
      process.env.SERVERLESS_ACCESS_KEY = 'abc123';

      awsDeploy.serverless.service.tenant = 'aws';
      awsDeploy.serverless.service.app = 'myService';

      awsDeploy.createDeployment()
        .then(() => {
          expect(getArtifactPathSpy.calledOnce).to.equal(true);
          expect(platformStub.calledOnce).to.equal(true);
        });
      process.env.SERVERLESS_ACCESS_KEY = undefined;
    });

    it('should not create a deployment', () => {
      awsDeploy.createDeployment()
        .then(() => {
          expect(getArtifactPathSpy.calledOnce).to.equal(true);
          expect(platformStub.calledOnce).to.equal(false);
        });
    });
  });
});
