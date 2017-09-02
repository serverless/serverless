'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fse = require('../../../utils/fs/fse');
const path = require('path');
const _ = require('lodash');
const userStats = require('../../../utils/userStats');
const yamlAstParser = require('../../../utils/yamlAstParser');
const pluginService = require('../lib/pluginService');
const fileExists = require('../../../utils/fs/fileExists');
const readFile = require('../../../utils/fs/readFile');
const fetch = require('node-fetch');
const url = require('url');

class PluginInstall {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      pluginService
    );

    this.commands = {
      plugin: {
        usage: 'Plugin management for Serverless',
        commands: {
          install: {
            usage: 'Install and add a plugin to your service',
            lifecycleEvents: [
              'install',
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
      'plugin:install:install': () => BbPromise.bind(this)
        .then(this.install)
        .then(this.trackPluginInstall),
    };
  }

  install() {
    if (this.options.name) {
      const pluginInfo = _.split(this.options.name, '@', 2);
      this.options.pluginName = pluginInfo[0];
      this.options.pluginVersion = pluginInfo[1] || 'latest';
    }

    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then((plugins) => {
        const plugin = plugins.find((item) => item.name === this.options.pluginName);
        if (plugin) {
          return BbPromise.bind(this)
          .then(this.pluginInstall)
          .then(this.addPluginToServerlessFile)
          .then(this.installPeerDependencies)
          .then(() => {
            const message = [
              'Successfully installed',
              `"${this.options.pluginName}@${this.options.pluginVersion}"`,
            ].join('');
            this.serverless.cli.log(message);
          });
        }
        const message = `Plugin "${this.options.pluginName}" not found. Did you spell it correct?`;
        throw new this.serverless.classes.Error(message);
      });
  }

  pluginInstall() {
    const servicePath = this.serverless.config.servicePath;
    const packageJsonFilePath = path.join(servicePath, 'package.json');

    return fileExists(packageJsonFilePath).then(exists => {
      // check if package.json is already present. Otherwise create one
      if (!exists) {
        this.serverless.cli
          .log('Creating an empty package.json file in your service directory');

        const packageJsonFileContent = {
          name: this.serverless.service.service,
          description: '',
          version: '0.1.0',
          dependencies: {},
          devDependencies: {},
        };

        return fse.writeJson(packageJsonFilePath, packageJsonFileContent);
      }
      return BbPromise.resolve();
    })
    .then(() => readFile(packageJsonFilePath))
    .then(content => {
      if (content.devDependencies && content.devDependencies[this.options.pluginName]) {
        return BbPromise.resolve().then(() => {
          if (this.options.pluginVersion === 'latest') {
            const registry = 'https://registry.npmjs.org/';
            return fetch(url.resolve(registry, this.options.pluginName))
            .then(result => result.json())
            .then(json => `^${json['dist-tags'].latest}`);
          }
          return `^${this.options.pluginVersion}`;
        }).then(version => {
          if (content.devDependencies[this.options.pluginName] === version) {
            return this.addPluginToServerlessFile().then(() => {
              const errorMessage = [
                `Plugin "${this.options.pluginName}@${this.options.pluginVersion}"`,
                ' has been already installed.',
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            });
          }
          return BbPromise.resolve();
        });
      }
      return BbPromise.resolve();
    })
    .then(() => {
      // install the package through npm
      const message = [
        `Installing plugin "${this.options.pluginName}@${this.options.pluginVersion}"`,
        ' (this might take a few seconds...)',
      ].join('');
      this.serverless.cli.log(message);
      return childProcess
        .execAsync(
          `npm install --save-dev ${this.options.pluginName}@${this.options.pluginVersion}`, {
            stdio: 'ignore',
          });
    })
    .then(() => readFile(packageJsonFilePath))
    .then(content => {
      if (!content.devDependencies[this.options.pluginName]) {
        const message = 'An error occurred while installing your plugin. Please try again...';
        throw new this.serverless.classes.Error(message);
      }
      return BbPromise.resolve();
    });
  }

  addPluginToServerlessFile() {
    return this.getServerlessFilePath().then(serverlessFilePath => {
      if (_.last(_.split(serverlessFilePath, '.')) === 'json') {
        return fse.readJsonAsync(serverlessFilePath).then(serverlessFileObj => {
          const newServerlessFileObj = serverlessFileObj;
          if (newServerlessFileObj.plugins) {
            newServerlessFileObj.plugins.push(this.options.pluginName);
          } else {
            newServerlessFileObj.plugins = [this.options.pluginName];
          }
          newServerlessFileObj.plugins = _.sortedUniq(newServerlessFileObj.plugins);
          return fse.writeJsonAsync(serverlessFilePath, newServerlessFileObj);
        });
      }
      return yamlAstParser.addNewArrayItem(serverlessFilePath, 'plugins', this.options.pluginName);
    });
  }

  installPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(this.serverless.config.servicePath,
      'node_modules', this.options.pluginName, 'package.json');
    const servicePackageJsonFilePath = path.join(this.serverless.config.servicePath,
      'package.json');
    return fse.readJsonAsync(pluginPackageJsonFilePath).then(pluginPackageJson => {
      if (pluginPackageJson.peerDependencies) {
        return fse.readJsonAsync(servicePackageJsonFilePath).then(servicePackageJson => {
          const newServicePackageJson = servicePackageJson;
          newServicePackageJson.devDependencies =
            _.merge(newServicePackageJson.devDependencies, pluginPackageJson.peerDependencies);
          return fse.writeJsonAsync(servicePackageJsonFilePath, newServicePackageJson);
        })
        .then(() => childProcess.execAsync('npm install', {
          stdio: 'ignore',
        }));
      }
      return BbPromise.resolve();
    });
  }

  trackPluginInstall() {
    userStats.track('service_pluginInstalled');
    return BbPromise.resolve();
  }
}

module.exports = PluginInstall;
