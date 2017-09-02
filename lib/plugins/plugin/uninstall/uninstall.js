'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fse = require('../../../utils/fs/fse');
const path = require('path');
const _ = require('lodash');
const readFile = require('../../../utils/fs/readFile');
const pluginService = require('../lib/pluginService');
const userStats = require('../../../utils/userStats');
const yamlAstParser = require('../../../utils/yamlAstParser');

class PluginUninstall {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      pluginService
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
    if (this.options.name) {
      const pluginInfo = _.split(this.options.name, '@', 2);
      this.options.pluginName = pluginInfo[0];
    }

    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then(plugins => {
        const plugin = plugins.find((item) => item.name === this.options.pluginName);
        if (plugin) {
          return BbPromise.bind(this)
          .then(this.uninstallPeerDependencies)
          .then(this.pluginUninstall)
          .then(pluginStillAvailable => {
            if (!pluginStillAvailable) {
              return this.removePluginFromServerlessFile()
              .then(() => {
                this.serverless.cli.log(`Successfully uninstalled "${this.options.pluginName}"`);
              });
            }
            const message = 'An error occurred while uninstalling your plugin. Please try again...';
            this.serverless.cli.log(message);
            return BbPromise.resolve();
          });
        }
        const message = `Plugin "${this.options.pluginName}" not found. Did you spell it correct?`;
        this.serverless.cli.log(message);
        return BbPromise.resolve();
      });
  }

  pluginUninstall() {
    const servicePath = this.serverless.config.servicePath;
    const packageJsonFilePath = path.join(servicePath, 'package.json');
    return readFile(packageJsonFilePath).then(content => {
      if (!content.devDependencies || !content.devDependencies[this.options.pluginName]) {
        return this.removePluginFromServerlessFile().then(() => {
          const errorMessage = `Plugin "${this.options.pluginName}" has been already uninstalled.`;
          throw new this.serverless.classes.Error(errorMessage);
        });
      }
      return BbPromise.resolve();
    })
    .then(() => {
      this.serverless.cli
        .log(`Uninstalling plugin "${this.options.pluginName}" (this might take a few seconds...)`);
      return this.npmUninstall(this.options.pluginName);
    })
    .then(() => readFile(packageJsonFilePath))
    .then(content => {
      // check if plugin was uninstalled correctly
      if (content.devDependencies[this.options.pluginName]) {
        const message = 'An error occurred while uninstalling your plugin. Please try again...';
        throw new this.serverless.classes.Error(message);
      }
      return this.removePluginFromServerlessFile();
    });
  }

  removePluginFromServerlessFile() {
    return this.getServerlessFilePath().then(serverlessFilePath => {
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
