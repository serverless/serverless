'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fse = require('../../../utils/fs/fse');
const path = require('path');
const _ = require('lodash');
const pluginUtils = require('../lib/utils');
const userStats = require('../../../utils/userStats');
const yamlAstParser = require('../../../utils/yamlAstParser');

class PluginUninstall {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      pluginUtils
    );

    this.commands = {
      plugin: {
        commands: {
          uninstall: {
            usage: 'Uninstall and remove a plugin from your service',
            lifecycleEvents: [
              'uninstall',
            ],
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
      'plugin:uninstall:uninstall': () => BbPromise.bind(this)
        .then(this.uninstall)
        .then(this.trackPluginUninstall),
    };
  }

  uninstall() {
    const pluginInfo = _.split(this.options.name, '@', 2);
    this.options.pluginName = pluginInfo[0];

    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then(plugins => {
        const plugin = plugins.find((item) => item.name === this.options.pluginName);
        if (plugin) {
          return BbPromise.bind(this)
          .then(this.uninstallPeerDependencies)
          .then(this.pluginUninstall)
          .then(this.removePluginFromServerlessFile)
          .then(() => {
            this.serverless.cli.log(`Successfully uninstalled "${this.options.pluginName}"`);
            return BbPromise.resolve();
          });
        }
        const message = `Plugin "${this.options.pluginName}" not found. Did you spell it correct?`;
        throw new this.serverless.classes.Error(message);
      });
  }

  pluginUninstall() {
    this.serverless.cli
      .log(`Uninstalling plugin "${this.options.pluginName}" (this might take a few seconds...)`);
    return this.npmUninstall(this.options.pluginName);
  }

  removePluginFromServerlessFile() {
    return this.getServerlessFilePath().then(serverlessFilePath => {
      if (_.last(_.split(serverlessFilePath, '.')) === 'js') {
        this.serverless.cli.log(`
          Can't automatically remove plugin from "serverless.js" file.
          Please make it manually.
        `);
        return BbPromise.resolve();
      }

      if (_.last(_.split(serverlessFilePath, '.')) === 'json') {
        return fse.readJsonAsync(serverlessFilePath).then(serverlessFileObj => {
          if (serverlessFileObj.plugins) {
            _.pull(serverlessFileObj.plugins, this.options.pluginName);
            if (_.isEmpty(serverlessFileObj.plugins)) {
              _.unset(serverlessFileObj, 'plugins');
            }
          }
          return fse.writeJsonAsync(serverlessFilePath, serverlessFileObj);
        });
      }
      return yamlAstParser.removeExistingArrayItem(
        serverlessFilePath, 'plugins', this.options.pluginName);
    });
  }

  uninstallPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(this.serverless.config.servicePath,
      'node_modules', this.options.pluginName, 'package.json');
    return fse.readJsonAsync(pluginPackageJsonFilePath).then(pluginPackageJson => {
      if (pluginPackageJson.peerDependencies) {
        const pluginsArray = [];
        _.forEach(pluginPackageJson.peerDependencies, (v, k) => {
          pluginsArray.push(k);
        });
        return BbPromise.map(pluginsArray, this.npmUninstall);
      }
      return BbPromise.resolve();
    }).catch(() => BbPromise.resolve());
  }

  npmUninstall(name) {
    return childProcess
      .execAsync(`npm uninstall --save-dev ${name}`, {
        stdio: 'ignore',
      });
  }

  trackPluginUninstall() {
    userStats.track('service_pluginUninstalled');
    return BbPromise.resolve();
  }
}

module.exports = PluginUninstall;
