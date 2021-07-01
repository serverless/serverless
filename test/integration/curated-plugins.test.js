'use strict';

const { expect } = require('chai');
const spawn = require('child-process-ext/spawn');
const got = require('got');
const fixturesEngine = require('../fixtures/programmatic');

const serverlessExec = require('../serverlessBinary');

describe('test/integration/curated-plugins.test.js', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking npm install

  let serviceDir;
  let updateConfig;
  before(async () => {
    ({ servicePath: serviceDir, updateConfig } = await fixturesEngine.setup('curated-plugins'));
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
});
