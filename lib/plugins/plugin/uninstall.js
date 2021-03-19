'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const cliCommandsSchema = require('../../cli/commands-schema');
const yamlAstParser = require('../../utils/yamlAstParser');
const pluginUtils = require('./lib/utils');

class PluginUninstall {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(this, pluginUtils);

    this.commands = {
      plugin: {
        commands: {
          uninstall: {
            ...cliCommandsSchema.get('plugin uninstall'),
            lifecycleEvents: ['uninstall'],
          },
        },
      },
    };

    this.hooks = {
      'plugin:uninstall:uninstall': () => BbPromise.bind(this).then(this.uninstall),
    };
  }

  uninstall() {
    const pluginInfo = pluginUtils.getPluginInfo(this.options.name);
    this.options.pluginName = pluginInfo[0];

    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then((plugins) => {
        const plugin = plugins.find((item) => item.name === this.options.pluginName);
        if (!plugin) {
          this.serverless.cli.log(
            'Plugin not found in serverless registry, continuing to uninstall'
          );
        }
        return BbPromise.bind(this)
          .then(this.uninstallPeerDependencies)
          .then(this.pluginUninstall)
          .then(this.removePluginFromServerlessFile)
          .then(() => {
            this.serverless.cli.log(`Successfully uninstalled "${this.options.pluginName}"`);
            return BbPromise.resolve();
          });
      });
  }

  pluginUninstall() {
    this.serverless.cli.log(
      `Uninstalling plugin "${this.options.pluginName}" (this might take a few seconds...)`
    );
    return this.npmUninstall(this.options.pluginName);
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

  uninstallPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(
      this.serverless.config.servicePath,
      'node_modules',
      this.options.pluginName,
      'package.json'
    );
    return fse
      .readJson(pluginPackageJsonFilePath)
      .then((pluginPackageJson) => {
        if (pluginPackageJson.peerDependencies) {
          const pluginsArray = [];
          Object.keys(pluginPackageJson.peerDependencies).forEach((k) => {
            pluginsArray.push(k);
          });
          return BbPromise.map(pluginsArray, this.npmUninstall);
        }
        return BbPromise.resolve();
      })
      .catch(() => BbPromise.resolve());
  }

  npmUninstall(name) {
    return childProcess.execAsync(`npm uninstall --save-dev ${name}`, {
      stdio: 'ignore',
    });
  }
}

module.exports = PluginUninstall;
