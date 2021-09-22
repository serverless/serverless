'use strict';

const chai = require('chai');
const sinon = require('sinon');
const yaml = require('js-yaml');
const path = require('path');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const fixturesEngine = require('../../../fixtures/programmatic');
const resolveConfigurationPath = require('../../../../lib/cli/resolve-configuration-path');
const { expect } = require('chai');

chai.use(require('chai-as-promised'));

const npmCommand = 'npm';

describe('test/unit/commands/plugin/install.test.js', async () => {
  let execFake;
  let serviceDir;
  let configurationFilePath;

  const pluginName = 'serverless-plugin-1';

  before(async () => {
    execFake = sinon.fake(async (command, ...args) => {
      if (command.startsWith(`${npmCommand} install --save-dev`)) {
        const _pluginName = command.split(' ')[3];
        const pluginNameWithoutVersion = _pluginName.split('@')[0];

        if (pluginNameWithoutVersion) {
          const pluginPackageJsonFilePath = path.join(
            serviceDir,
            'node_modules',
            pluginName,
            'package.json'
          );
          const packageJsonFileContent = {};
          await fse.ensureFile(pluginPackageJsonFilePath);
          await fse.writeJson(pluginPackageJsonFilePath, packageJsonFileContent);
        }
      }
      const callback = args[args.length - 1];
      callback();
    });
    const installPlugin = proxyquire('../../../../commands/plugin/install', {
      child_process: {
        exec: execFake,
      },
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
    const command = execFake.firstArg;
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
