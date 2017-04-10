'use strict';

const expect = require('chai').expect;
const path = require('path');
const Package = require('../index');
const Serverless = require('../../../../../lib/Serverless');
const testUtils = require('../../../../../tests/utils');

describe('#cleanupTempDir()', () => {
  let serverless;
  let packageService;

  beforeEach(() => {
    serverless = new Serverless();
    packageService = new Package(serverless);

    serverless.config.servicePath = testUtils.getTmpDirPath();
  });

  it('should remove .serverless in the service directory', () => {
    const serverlessTmpDirPath = path.join(packageService.serverless.config.servicePath,
      '.serverless', 'README');
    serverless.utils.writeFileSync(serverlessTmpDirPath,
      'Some README content');

    return packageService.cleanupTempDir().then(() => {
      expect(serverless.utils.dirExistsSync(path.join(packageService.serverless.config.servicePath,
        '.serverless'))).to.equal(false);
    });
  });

  it('should resolve if servicePath is not present', (done) => {
    delete serverless.config.servicePath;
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
