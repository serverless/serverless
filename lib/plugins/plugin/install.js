'use strict';

const { promisify } = require('util');
const { exec } = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const yamlAstParser = require('../../utils/yamlAstParser');
const fileExists = require('../../utils/fs/fileExists');
const pluginUtils = require('./lib/utils');
const npmCommandDeferred = require('../../utils/npm-command-deferred');

const execAsync = promisify(exec);

class PluginInstall {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(this, pluginUtils);

    this.commands = {
      plugin: {
        commands: {
          install: {
            usage: 'Install and add a plugin to your service',
            lifecycleEvents: ['install'],
            options: {
              name: {
                usage: 'The plugin name',
                required: true,
                shortcut: 'n',
              },
            },
          },
        },
      },
    };
    this.hooks = {
      'plugin:install:install': async () => this.install(),
    };
  }

  async install() {
    const pluginInfo = pluginUtils.getPluginInfo(this.options.name);
    this.options.pluginName = pluginInfo[0];
    this.options.pluginVersion = pluginInfo[1] || 'latest';

    this.validate();
    const plugins = await this.getPlugins();

    const plugin = plugins.find((item) => item.name === this.options.pluginName);
    if (!plugin) {
      this.serverless.cli.log('Plugin not found in serverless registry, continuing to install');
    }

    await this.pluginInstall();
    await this.addPluginToServerlessFile();
    await this.installPeerDependencies();

    this.serverless.cli.log(
      `Successfully installed "${this.options.pluginName}@${this.options.pluginVersion}"`
    );
  }

  async pluginInstall() {
    const servicePath = this.serverless.config.servicePath;
    const packageJsonFilePath = path.join(servicePath, 'package.json');

    const exists = await fileExists(packageJsonFilePath);
    // check if package.json is already present. Otherwise create one
    if (!exists) {
      this.serverless.cli.log('Creating an empty package.json file in your service directory');

      const packageJsonFileContent = {
        name: this.serverless.service.service,
        description: '',
        version: '0.1.0',
        dependencies: {},
        devDependencies: {},
      };
      await fse.writeJson(packageJsonFilePath, packageJsonFileContent);
    }

    // install the package through npm
    const pluginFullName = `${this.options.pluginName}@${this.options.pluginVersion}`;

    this.serverless.cli.log(
      `Installing plugin "${pluginFullName}" (this might take a few seconds...)`
    );
    await this.npmInstall(pluginFullName);
  }

  async addPluginToServerlessFile() {
    const serverlessFilePath = this.getServerlessFilePath();
    const fileExtension = path.extname(serverlessFilePath);
    if (fileExtension === '.js' || fileExtension === '.ts') {
      this.serverless.cli.log(`
          Can't automatically add plugin into "${path.basename(serverlessFilePath)}" file.
          Please make it manually.
        `);
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
        throw new Error('plugins modules property must be present');
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

    const serverlessFileObj = await this.serverless.yamlParser.parse(serverlessFilePath);
    await yamlAstParser.addNewArrayItem(
      serverlessFilePath,
      checkIsArrayPluginsObject(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
      this.options.pluginName
    );
  }

  async installPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(
      this.serverless.config.servicePath,
      'node_modules',
      this.options.pluginName,
      'package.json'
    );
    const pluginPackageJson = await fse.readJson(pluginPackageJsonFilePath);
    if (pluginPackageJson.peerDependencies) {
      const pluginsArray = Object.entries(pluginPackageJson.peerDependencies).map(
        ([k, v]) => `${k}@"${v}"`
      );
      await Promise.all(pluginsArray.map(this.npmInstall));
    }
  }

  async npmInstall(name) {
    const npmCommand = await npmCommandDeferred;
    await execAsync(`${npmCommand} install --save-dev ${name}`, { stdio: 'ignore' });
  }
}

module.exports = PluginInstall;
