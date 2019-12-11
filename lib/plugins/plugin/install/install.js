'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fse = require('../../../utils/fs/fse');
const path = require('path');
const _ = require('lodash');
const userStats = require('../../../utils/userStats');
const yamlAstParser = require('../../../utils/yamlAstParser');
const fileExists = require('../../../utils/fs/fileExists');
const pluginUtils = require('../lib/utils');
const npmCommandDeferred = require('../../../utils/npm-command-deferred');

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
      'plugin:install:install': () =>
        BbPromise.bind(this)
          .then(this.install)
          .then(this.trackPluginInstall),
    };
  }

  install() {
    const pluginInfo = pluginUtils.getPluginInfo(this.options.name);
    this.options.pluginName = pluginInfo[0];
    this.options.pluginVersion = pluginInfo[1] || 'latest';

    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then(plugins => {
        const plugin = plugins.find(item => item.name === this.options.pluginName);
        if (!plugin) {
          this.serverless.cli.log('Plugin not found in serverless registry, continuing to install');
        }
        return BbPromise.bind(this)
          .then(this.pluginInstall)
          .then(this.addPluginToServerlessFile)
          .then(this.installPeerDependencies)
          .then(() => {
            const message = [
              'Successfully installed',
              ` "${this.options.pluginName}@${this.options.pluginVersion}"`,
            ].join('');
            this.serverless.cli.log(message);
          });
      });
  }

  pluginInstall() {
    const servicePath = this.serverless.config.servicePath;
    const packageJsonFilePath = path.join(servicePath, 'package.json');

    return fileExists(packageJsonFilePath)
      .then(exists => {
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
          return fse.writeJsonAsync(packageJsonFilePath, packageJsonFileContent);
        }
        return BbPromise.resolve();
      })
      .then(() => {
        // install the package through npm
        const pluginFullName = `${this.options.pluginName}@${this.options.pluginVersion}`;
        const message = [
          `Installing plugin "${pluginFullName}"`,
          ' (this might take a few seconds...)',
        ].join('');
        this.serverless.cli.log(message);
        return this.npmInstall(pluginFullName);
      });
  }

  addPluginToServerlessFile() {
    return this.getServerlessFilePath().then(serverlessFilePath => {
      if (_.last(_.split(serverlessFilePath, '.')) === 'js') {
        this.serverless.cli.log(`
          Can't automatically add plugin into "serverless.js" file.
          Please make it manually.
        `);
        return BbPromise.resolve();
      }

      const checkIsArrayPluginsObject = pluginsObject =>
        _.isNil(pluginsObject) || _.isArray(pluginsObject);
      // pluginsObject type determined based on the value loaded during the serverless init.
      if (_.last(_.split(serverlessFilePath, '.')) === 'json') {
        return fse.readJsonAsync(serverlessFilePath).then(serverlessFileObj => {
          const newServerlessFileObj = serverlessFileObj;
          const isArrayPluginsObject = checkIsArrayPluginsObject(newServerlessFileObj.plugins);
          // null modules property is not supported
          let plugins = isArrayPluginsObject
            ? newServerlessFileObj.plugins || []
            : newServerlessFileObj.plugins.modules;

          if (_.isNil(plugins)) {
            throw new Error('plugins modules property must be present');
          }

          plugins.push(this.options.pluginName);
          plugins = _.sortedUniq(plugins);

          if (isArrayPluginsObject) {
            newServerlessFileObj.plugins = plugins;
          } else {
            newServerlessFileObj.plugins.modules = plugins;
          }

          return fse.writeJsonAsync(serverlessFilePath, newServerlessFileObj);
        });
      }

      return this.serverless.yamlParser
        .parse(serverlessFilePath)
        .then(serverlessFileObj =>
          yamlAstParser.addNewArrayItem(
            serverlessFilePath,
            checkIsArrayPluginsObject(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
            this.options.pluginName
          )
        );
    });
  }

  installPeerDependencies() {
    const pluginPackageJsonFilePath = path.join(
      this.serverless.config.servicePath,
      'node_modules',
      this.options.pluginName,
      'package.json'
    );
    return fse.readJsonAsync(pluginPackageJsonFilePath).then(pluginPackageJson => {
      if (pluginPackageJson.peerDependencies) {
        const pluginsArray = [];
        _.forEach(pluginPackageJson.peerDependencies, (v, k) => {
          pluginsArray.push(`${k}@"${v}"`);
        });
        return BbPromise.map(pluginsArray, this.npmInstall);
      }
      return BbPromise.resolve();
    });
  }

  npmInstall(name) {
    return npmCommandDeferred.then(npmCommand =>
      childProcess.execAsync(`${npmCommand} install --save-dev ${name}`, {
        stdio: 'ignore',
      })
    );
  }

  trackPluginInstall() {
    userStats.track('service_pluginInstalled');
    return BbPromise.resolve();
  }
}

module.exports = PluginInstall;
