'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsPackage = require('../../../../../../../lib/plugins/aws/package/index');
const Serverless = require('../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider');

describe('#saveServiceState()', () => {
  let serverless;
  let awsPackage;
  let getServiceStateFileNameStub;
  let writeFileSyncStub;

  beforeEach(() => {
    const options = {};
    serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsPackage = new AwsPackage(serverless, options);
    serverless.serviceDir = 'my-service';
    serverless.service = {
      provider: {
        compiledCloudFormationTemplate: 'compiled content',
      },
      package: {
        individually: false,
        artifactDirectoryName: 'artifact-directory',
        artifact: 'service.zip',
      },
    };
    getServiceStateFileNameStub = sinon
      .stub(awsPackage.provider.naming, 'getServiceStateFileName')
      .returns('service-state.json');
    writeFileSyncStub = sinon.stub(awsPackage.serverless.utils, 'writeFileSync').returns();
  });

  afterEach(() => {
    awsPackage.provider.naming.getServiceStateFileName.restore();
    awsPackage.serverless.utils.writeFileSync.restore();
  });

  it('should write the service state file template to disk', async () => {
    const filePath = path.join(
      awsPackage.serverless.serviceDir,
      '.serverless',
      'service-state.json'
    );

    await awsPackage.saveServiceState();
    const expectedStateFileContent = {
      service: {
        provider: {
          compiledCloudFormationTemplate: 'compiled content',
        },
      },
      package: {
        individually: false,
        artifactDirectoryName: 'artifact-directory',
        artifact: 'service.zip',
      },
    };

    expect(getServiceStateFileNameStub.calledOnce).to.equal(true);
    expect(writeFileSyncStub.calledWithExactly(filePath, expectedStateFileContent, true)).to.equal(
      true
    );
  });
});
