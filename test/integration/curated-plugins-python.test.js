'use strict';

const { expect } = require('chai');
const path = require('path');
const spawn = require('child-process-ext/spawn');
const fixturesEngine = require('../fixtures/programmatic');
const { listZipFiles } = require('../utils/fs');

const serverlessExec = require('../serverless-binary');

describe('test/integration/curated-plugins-python.test.js', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking npm install

  let serviceDir;
  let updateConfig;
  let serviceConfig;
  before(async () => {
    ({
      servicePath: serviceDir,
      updateConfig,
      serviceConfig,
    } = await fixturesEngine.setup('curated-plugins-python'));
  });

  afterEach(async () => updateConfig({ plugins: null }));

  it('should be extended by "serverless-python-requirements"', async () => {
    await updateConfig({ plugins: ['serverless-python-requirements'] });
    await spawn(serverlessExec, ['package'], { cwd: serviceDir });
    const packagePath = path.resolve(serviceDir, '.serverless', `${serviceConfig.service}.zip`);
    const filesInZip = await listZipFiles(packagePath);
    expect(filesInZip).to.include('requests/__init__.py');
  });
});
