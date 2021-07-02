'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fsp = require('fs').promises;
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const yaml = require('js-yaml');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const log = require('@serverless/utils/log');
const cliCommandsSchema = require('../../cli/commands-schema');
const yamlAstParser = require('../../utils/yamlAstParser');
const pluginUtils = require('./lib/utils');

const requestManualUpdate = (serverlessFilePath) =>
  log(`
  Can't automatically add plugin into "${path.basename(serverlessFilePath)}" file.
  Please make it manually.
`);

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
          },
        },
      },
    };

    this.hooks = {
      'plugin:uninstall:uninstall': async () => BbPromise.bind(this).then(this.uninstall),
    };
  }

  async uninstall() {
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

  async pluginUninstall() {
    this.serverless.cli.log(
      `Uninstalling plugin "${this.options.pluginName}" (this might take a few seconds...)`
    );
    return this.npmUninstall(this.options.pluginName);
  }

  async removePluginFromServerlessFile() {
    const serverlessFilePath = this.getServerlessFilePath();
    const fileExtension = path.extname(serverlessFilePath);
    if (fileExtension === '.js' || fileExtension === '.ts') {
      requestManualUpdate(serverlessFilePath);
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
    await yamlAstParser.removeExistingArrayItem(
      serverlessFilePath,
      Array.isArray(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
      this.options.pluginName
    );
  }

  async uninstallPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(
      this.serverless.serviceDir,
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

  async npmUninstall(name) {
    return childProcess.execAsync(`npm uninstall --save-dev ${name}`, {
      stdio: 'ignore',
    });
  }
}

module.exports = PluginUninstall;
