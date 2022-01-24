'use strict';

const path = require('path');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const fixturesEngine = require('../fixtures/programmatic');

const serverlessExec = require('../serverless-binary');

describe('test/integration/plugin-install.test.js', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking npm install

  let serviceDir;
  before(async () => {
    serviceDir = (
      await fixturesEngine.setup('function', {
        // Unresolved variables should not block "plugin install" command
        configExt: { custom: { foo: '${foo:bar}' } },
      })
    ).servicePath;
    await spawn(serverlessExec, ['plugin', 'install', '-n', 'serverless-offline'], {
      cwd: serviceDir,
    });
  });

  it('should install plugin', async () => {
    await fsp.access(path.resolve(serviceDir, 'node_modules/serverless-offline'));
  });
});
