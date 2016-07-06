'use strict';

const expect = require('chai').expect;
const os = require('os');
const path = require('path');
const Package = require('../index');
const Serverless = require('../../../../lib/Serverless');

describe('#cleanup()', () => {
  let serverless;
  let packageService;

  beforeEach(() => {
    serverless = new Serverless();
    packageService = new Package(serverless);

    packageService.serverless.servicePath = path.join(os.tmpdir(), (new Date).getTime().toString());
  });

  it('should remove .serverless in the service directory', () => {
    const serverlessTmpDirPath = path.join(packageService.serverless.servicePath,
      '.serverless', 'README');
    serverless.utils.writeFileSync(serverlessTmpDirPath,
      'This directory can be ignored as its used for packaging and deployment');

    return packageService.cleanup().then(() => {
      expect(serverless.utils.dirExistsSync(path.join(packageService.serverless.servicePath,
        '.serverless'))).to.equal(false);
    });
  });

  it('should resolve if the .serverless directory is not present', (done) => packageService
    .cleanup().then(() => {
      done();
    })
  );
});
