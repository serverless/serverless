'use strict';

const expect = require('chai').expect;
const path = require('path');
const Package = require('../index');
const Serverless = require('../../../../lib/Serverless');
const testUtils = require('../../../../tests/utils');

describe('#cleanup()', () => {
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

    return packageService.cleanup().then(() => {
      expect(serverless.utils.dirExistsSync(path.join(packageService.serverless.config.servicePath,
        '.serverless'))).to.equal(false);
    });
  });

  it('should resolve if the .serverless directory is not present', (done) => {
    packageService.cleanup().then(() => {
      done();
    });
  });
});
