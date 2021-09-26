'use strict';

const chai = require('chai');
const sinon = require('sinon');
const yaml = require('js-yaml');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const fixturesEngine = require('../../fixtures/programmatic');
const resolveConfigurationPath = require('../../../lib/cli/resolve-configuration-path');
const { expect } = require('chai');

chai.use(require('chai-as-promised'));

const npmCommand = 'npm';

describe('test/unit/commands/plugin-install.test.js', async () => {
  let spawnFake;
  let serviceDir;
  let configurationFilePath;

  const pluginName = 'serverless-plugin-1';

  before(async () => {
    spawnFake = sinon.fake();
    const installPlugin = proxyquire('../../../commands/plugin-install', {
      'child-process-ext/spawn': spawnFake,
    });

    const fixture = await fixturesEngine.setup('function');

    const configuration = fixture.serviceConfig;
    serviceDir = fixture.servicePath;
    configurationFilePath = await resolveConfigurationPath({
      cwd: serviceDir,
    });
    const configurationFilename = configurationFilePath.slice(serviceDir.length + 1);
    const options = {
      name: pluginName,
    };

    await installPlugin({
      configuration,
      serviceDir,
      configurationFilename,
      options,
    });
  });

  it('should install plugin', () => {
    const firstCall = spawnFake.firstCall;
    const command = [firstCall.args[0], ...firstCall.args[1]].join(' ');
    const expectedCommand = `${npmCommand} install --save-dev ${pluginName}`;
    expect(command).to.have.string(expectedCommand);
  });

  it('should add plugin to serverless file', async () => {
    const serverlessFileObj = yaml.load(await fse.readFile(configurationFilePath, 'utf8'), {
      filename: configurationFilePath,
    });
    expect(serverlessFileObj.plugins).to.include(pluginName);
  });
});
