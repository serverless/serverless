'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const saveServiceState = require('./saveServiceState');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#saveServiceState()', () => {
  let serverless;
  let awsProvider;
  let getServiceStateFileNameStub;
  let writeFileSyncStub;

  beforeEach(() => {
    serverless = new Serverless();
    awsProvider = new AwsProvider(serverless);
    serverless.setProvider('aws', awsProvider);
    serverless.config.servicePath = 'my-service';
    serverless.service = {
      provider: {
        compiledCloudFormationTemplate: 'compiled content',
      },
      package: {
        individually: false,
        artifactDirectoryName: 'artifact-directory',
      },
    };
    saveServiceState.serverless = serverless;
    saveServiceState.provider = awsProvider;
    getServiceStateFileNameStub = sinon
      .stub(saveServiceState.provider.naming, 'getServiceStateFileName')
      .returns('service-state.json');
    writeFileSyncStub = sinon
      .stub(saveServiceState.serverless.utils, 'writeFileSync').returns();
  });

  afterEach(() => {
    saveServiceState.provider.naming.getServiceStateFileName.restore();
    saveServiceState.serverless.utils.writeFileSync.restore();
  });

  it('should write the service state file template to disk', () => {
    const filePath = path.join(
      saveServiceState.serverless.config.servicePath,
      '.serverless',
      'service-state.json'
    );

    return saveServiceState.saveServiceState().then(() => {
      const expectedStateFileContent = {
        service: {
          provider: {
            compiledCloudFormationTemplate: 'compiled content',
          },
        },
        package: {
          individually: false,
          artifactDirectoryName: 'artifact-directory',
        },
      };

      expect(getServiceStateFileNameStub.calledOnce).to.equal(true);
      expect(writeFileSyncStub.calledWithExactly(filePath, expectedStateFileContent))
        .to.equal(true);
    });
  });
});
