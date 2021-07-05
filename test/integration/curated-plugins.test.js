'use strict';

const { expect } = require('chai');
const path = require('path');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const got = require('got');
const { deployService, removeService } = require('../utils/integration');
const fixturesEngine = require('../fixtures/programmatic');

const serverlessExec = require('../serverlessBinary');

describe('test/integration/curated-plugins.test.js', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking npm install

  let serviceDir;
  let updateConfig;
  let serviceConfig;
  let isDeployed = false;
  before(async () => {
    ({
      servicePath: serviceDir,
      updateConfig,
      serviceConfig,
    } = await fixturesEngine.setup('curated-plugins'));
    // Needed to test "serverless-domain-manager"
    await deployService(serviceDir);
    isDeployed = true;
  });
  after(async () => {
    if (!isDeployed) return;
    await removeService(serviceDir);
  });

  afterEach(async () => updateConfig({ plugins: null }));

  it('should be extended by "serverless-offline"', async () => {
    await updateConfig({ plugins: ['serverless-offline'] });
    const slsProcessPromise = spawn(serverlessExec, ['offline'], {
      cwd: serviceDir,
    });
    const slsProcess = slsProcessPromise.child;
    let output = '';
    slsProcess.stdout.on('data', function self(data) {
      output += data;
      if (output.includes('server ready:')) {
        slsProcess.stdout.off('data', self);
        got('http://localhost:3000/dev/foo')
          .json()
          .then(async (responseBody) => {
            expect(responseBody.message).to.equal('Test');
          })
          .finally(() => slsProcess.kill('SIGINT'));
      }
    });
    await slsProcessPromise;
  });

  it('should be extended by "serverless-webpack"', async () => {
    await spawn(serverlessExec, ['package'], { cwd: serviceDir });
    const packagePath = path.resolve(serviceDir, '.serverless', `${serviceConfig.service}.zip`);
    const originalPackageSize = (await fsp.stat(packagePath)).size;
    await updateConfig({ plugins: ['serverless-webpack'] });
    await spawn(serverlessExec, ['package'], { cwd: serviceDir });
    const bundledPackageSize = (await fsp.stat(packagePath)).size;
    expect(originalPackageSize / 10).to.be.above(bundledPackageSize);
  });

  it('should be extended by "serverless-domain-manager"', async () => {
    await updateConfig({ plugins: ['serverless-domain-manager'] });
    const { stdoutBuffer } = await spawn(serverlessExec, ['info'], { cwd: serviceDir });
    expect(String(stdoutBuffer)).to.include('Serverless Domain Manager:');
  });

  it('should be extended by "serverless-prune-plugin"', async () => {
    await updateConfig({ plugins: ['serverless-prune-plugin'] });
    const { stdoutBuffer } = await spawn(serverlessExec, ['prune', '-n', '10'], {
      cwd: serviceDir,
    });
    expect(String(stdoutBuffer)).to.include('Prune: Pruning complete.');
  });
});
