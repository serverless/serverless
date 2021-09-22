'use strict';

const childProcess = require('child_process');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const yaml = require('js-yaml');
const { promisify } = require('util');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const log = require('@serverless/utils/log');
const ServerlessError = require('../../lib/serverless-error');
const yamlAstParser = require('../../lib/utils/yamlAstParser');
const fileExists = require('../../lib/utils/fs/fileExists');
const pluginUtils = require('../../lib/commands/plugin-management');
const npmCommandDeferred = require('../../lib/utils/npm-command-deferred');
const CLI = require('../../lib/classes/CLI');

const execAsync = promisify(childProcess.exec);

module.exports = async ({ configuration, serviceDir, configurationFilename, options }) => {
  await new PluginInstall({
    configuration,
    serviceDir,
    configurationFilename,
    options,
  }).install();
};

const requestManualUpdate = (serverlessFilePath) =>
  log(`
  Can't automatically add plugin into "${path.basename(serverlessFilePath)}" file.
  Please make it manually.
`);

class PluginInstall {
  constructor({ configuration, serviceDir, configurationFilename, options }) {
    this.configuration = configuration;
    this.serviceDir = serviceDir;
    this.configurationFilename = configurationFilename;
    this.options = options;

    this.cli = new CLI(undefined);

    Object.assign(this, pluginUtils);
  }

  async install() {
    const pluginInfo = pluginUtils.getPluginInfo(this.options.name);
    this.options.pluginName = pluginInfo[0];
    this.options.pluginVersion = pluginInfo[1] || 'latest';

    await this.validate();
    const plugins = await this.getPlugins();
    const plugin = plugins.find((item) => item.name === this.options.pluginName);
    if (!plugin) {
      this.cli.log('Plugin not found in serverless registry, continuing to install');
    }

    await this.pluginInstall();
    await this.addPluginToServerlessFile();
    await this.installPeerDependencies();

    const message = [
      'Successfully installed',
      ` "${this.options.pluginName}@${this.options.pluginVersion}"`,
    ].join('');
    this.cli.log(message);
  }

  async pluginInstall() {
    const serviceDir = this.serviceDir;
    const packageJsonFilePath = path.join(serviceDir, 'package.json');

    // check if package.json is already present. Otherwise create one
    const exists = await fileExists(packageJsonFilePath);
    if (!exists) {
      this.cli.log('Creating an empty package.json file in your service directory');

      const packageJsonFileContent = {
        name: this.configuration.service,
        description: '',
        version: '0.1.0',
        dependencies: {},
        devDependencies: {},
      };
      await fse.writeJson(packageJsonFilePath, packageJsonFileContent);
    }

    // install the package through npm
    const pluginFullName = `${this.options.pluginName}@${this.options.pluginVersion}`;
    const message = [
      `Installing plugin "${pluginFullName}"`,
      ' (this might take a few seconds...)',
    ].join('');
    this.cli.log(message);
    await this.npmInstall(pluginFullName);
  }

  async addPluginToServerlessFile() {
    const serverlessFilePath = this.getServerlessFilePath();
    const fileExtension = path.extname(serverlessFilePath);
    if (fileExtension === '.js' || fileExtension === '.ts') {
      requestManualUpdate(serverlessFilePath);
      return;
    }

    const checkIsArrayPluginsObject = (pluginsObject) =>
      pluginsObject == null || Array.isArray(pluginsObject);
    // pluginsObject type determined based on the value loaded during the serverless init.
    if (_.last(serverlessFilePath.split('.')) === 'json') {
      const serverlessFileObj = await fse.readJson(serverlessFilePath);
      const newServerlessFileObj = serverlessFileObj;
      const isArrayPluginsObject = checkIsArrayPluginsObject(newServerlessFileObj.plugins);
      // null modules property is not supported
      let plugins = isArrayPluginsObject
        ? newServerlessFileObj.plugins || []
        : newServerlessFileObj.plugins.modules;

      if (plugins == null) {
        throw new ServerlessError(
          'plugins modules property must be present',
          'PLUGINS_MODULES_MISSING'
        );
      }

      plugins.push(this.options.pluginName);
      plugins = _.sortedUniq(plugins);

      if (isArrayPluginsObject) {
        newServerlessFileObj.plugins = plugins;
      } else {
        newServerlessFileObj.plugins.modules = plugins;
      }

      await fse.writeJson(serverlessFilePath, newServerlessFileObj);
      return;
    }

    const serverlessFileObj = yaml.load(await fsp.readFile(serverlessFilePath, 'utf8'), {
      filename: serverlessFilePath,
      schema: cloudformationSchema,
    });
    if (serverlessFileObj.plugins != null) {
      // Plugins section can be behind veriables, opt-out in such case
      if (isPlainObject(serverlessFileObj.plugins)) {
        if (
          serverlessFileObj.plugins.modules != null &&
          !Array.isArray(serverlessFileObj.plugins.modules)
        ) {
          requestManualUpdate(serverlessFilePath);
          return;
        }
      } else if (!Array.isArray(serverlessFileObj.plugins)) {
        requestManualUpdate(serverlessFilePath);
        return;
      }
    }
    await yamlAstParser.addNewArrayItem(
      serverlessFilePath,
      checkIsArrayPluginsObject(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
      this.options.pluginName
    );
  }

  async installPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(
      this.serviceDir,
      'node_modules',
      this.options.pluginName,
      'package.json'
    );
    return fse.readJson(pluginPackageJsonFilePath).then((pluginPackageJson) => {
      if (pluginPackageJson.peerDependencies) {
        const pluginsArray = [];
        Object.entries(pluginPackageJson.peerDependencies).forEach(([k, v]) => {
          pluginsArray.push(`${k}@"${v}"`);
        });
        return Promise.all(pluginsArray.map((plugin) => this.npmInstall(plugin)));
      }
      return Promise.resolve();
    });
  }

  async npmInstall(name) {
    const npmCommand = await npmCommandDeferred;
    return execAsync(`${npmCommand} install --save-dev ${name}`, {
      cwd: this.serviceDir,
      stdio: 'ignore',
    });
  }
}
