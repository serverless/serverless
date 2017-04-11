'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#saveServiceState()', () => {
  let serverless;
  let pkg;
  let getServiceStateFileNameStub;
  let writeFileSyncStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    pkg = new AwsPackage(serverless, {});
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
    getServiceStateFileNameStub = sinon
      .stub(pkg.provider.naming, 'getServiceStateFileName')
      .returns('service-state.json');
    writeFileSyncStub = sinon
      .stub(pkg.serverless.utils, 'writeFileSync').returns();
  });

  afterEach(() => {
    pkg.provider.naming.getServiceStateFileName.restore();
    pkg.serverless.utils.writeFileSync.restore();
  });

  it('should write the service state file template to disk', () => {
    const filePath = path.join(
      pkg.serverless.config.servicePath,
      '.serverless',
      'service-state.json'
    );

    return pkg.saveServiceState().then(() => {
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
