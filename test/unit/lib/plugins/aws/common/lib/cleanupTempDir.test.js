'use strict';

const expect = require('chai').expect;
const path = require('path');
const Package = require('../../../../../../../lib/plugins/aws/common/index');
const Serverless = require('../../../../../../../lib/Serverless');
const { getTmpDirPath } = require('../../../../../../utils/fs');

describe('#cleanupTempDir()', () => {
  let serverless;
  let packageService;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    packageService = new Package(serverless);

    serverless.serviceDir = getTmpDirPath();
  });

  it('should remove .serverless in the service directory', () => {
    const serverlessTmpDirPath = path.join(
      packageService.serverless.serviceDir,
      '.serverless',
      'README'
    );
    serverless.utils.writeFileSync(serverlessTmpDirPath, 'Some README content');

    return packageService.cleanupTempDir().then(() => {
      expect(
        serverless.utils.dirExistsSync(
          path.join(packageService.serverless.serviceDir, '.serverless')
        )
      ).to.equal(false);
    });
  });

  it('should resolve if servicePath is not present', (done) => {
    delete serverless.serviceDir;
    packageService.cleanupTempDir().then(() => {
      done();
    });
  });

  it('should resolve if the .serverless directory is not present', (done) => {
    packageService.cleanupTempDir().then(() => {
      done();
    });
  });
});
