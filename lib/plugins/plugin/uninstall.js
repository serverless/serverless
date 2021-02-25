'use strict';

const { promisify } = require('util');
const { exec } = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const yamlAstParser = require('../../utils/yamlAstParser');
const pluginUtils = require('./lib/utils');

const execAsync = promisify(exec);

class PluginUninstall {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(this, pluginUtils);

    this.commands = {
      plugin: {
        commands: {
          uninstall: {
            usage: 'Uninstall and remove a plugin from your service',
            lifecycleEvents: ['uninstall'],
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
      'plugin:uninstall:uninstall': async () => this.uninstall(this),
    };
  }

  async uninstall() {
    const pluginInfo = pluginUtils.getPluginInfo(this.options.name);
    this.options.pluginName = pluginInfo[0];

    this.validate();
    const plugins = await this.getPlugins();
    const plugin = plugins.find((item) => item.name === this.options.pluginName);
    if (!plugin) {
      this.serverless.cli.log('Plugin not found in serverless registry, continuing to uninstall');
    }
    await this.uninstallPeerDependencies();
    await this.pluginUninstall();
    await this.removePluginFromServerlessFile();
    this.serverless.cli.log(`Successfully uninstalled "${this.options.pluginName}"`);
  }

  async pluginUninstall() {
    this.serverless.cli.log(
      `Uninstalling plugin "${this.options.pluginName}" (this might take a few seconds...)`
    );
    await this.npmUninstall(this.options.pluginName);
  }

  async removePluginFromServerlessFile() {
    const serverlessFilePath = this.getServerlessFilePath();
    const fileExtension = path.extname(serverlessFilePath);
    if (fileExtension === '.js' || fileExtension === '.ts') {
      this.serverless.cli.log(`
          Can't automatically remove plugin from "serverless.js" file.
          Please make it manually.
        `);
      return;
    }

    if (_.last(serverlessFilePath.split('.')) === 'json') {
      const serverlessFileObj = await fse.readJson(serverlessFilePath);
      const isArrayPluginsObject = Array.isArray(serverlessFileObj.plugins);
      const plugins = isArrayPluginsObject
        ? serverlessFileObj.plugins
        : serverlessFileObj.plugins && serverlessFileObj.plugins.modules;

      if (plugins) {
        _.pull(plugins, this.options.pluginName);
        if (!plugins.length) {
          if (isArrayPluginsObject) {
            delete serverlessFileObj.plugins;
          } else {
            delete serverlessFileObj.plugins.modules;
          }
        }
        await fse.writeJson(serverlessFilePath, serverlessFileObj);
      }
      return;
    }

    const serverlessFileObj = await this.serverless.yamlParser.parse(serverlessFilePath);
    await yamlAstParser.removeExistingArrayItem(
      serverlessFilePath,
      Array.isArray(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
      this.options.pluginName
    );
  }

  async uninstallPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(
      this.serverless.config.servicePath,
      'node_modules',
      this.options.pluginName,
      'package.json'
    );
    try {
      const pluginPackageJson = await fse.readJson(pluginPackageJsonFilePath);
      if (pluginPackageJson.peerDependencies) {
        const pluginsArray = Object.keys(pluginPackageJson.peerDependencies);
        await Promise.all(pluginsArray.map(this.npmUninstall));
      }
    } catch {
      // fail silently
    }
  }

  async npmUninstall(name) {
    await execAsync(`npm uninstall --save-dev ${name}`, { stdio: 'ignore' });
  }
}

module.exports = PluginUninstall;
