
'use strict';

const BbPromise = require('bluebird');
const childProcess = require('child_process');
const fetch = require('node-fetch');
const chalk = require('chalk');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const userStats = require('../../utils/userStats');
const yamlAstParser = require('../../utils/yamlAstParser');

class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

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
              version: {
                usage: 'The plugin version',
                shortcut: 'v',
              },
            },
          },
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
          list: {
            usage: 'Lists all available plugins',
            lifecycleEvents: [
              'list',
            ],
          },
          search: {
            usage: 'Search for plugins',
            lifecycleEvents: [
              'search',
            ],
            options: {
              query: {
                usage: 'Search query',
                required: true,
                shortcut: 'q',
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
      'plugin:uninstall:uninstall': () => BbPromise.bind(this)
        .then(this.uninstall)
        .then(this.trackPluginUninstall),
      'plugin:list:list': () => BbPromise.bind(this)
        .then(this.list)
        .then(this.trackPluginList),
      'plugin:search:search': () => BbPromise.bind(this)
        .then(this.search)
        .then(this.trackPluginSearch),
    };
  }

  install() {
    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then((plugins) => {
        const pluginName = this.options.name;
        const plugin = plugins.find((item) => item.name === pluginName);

        if (plugin) {
          const servicePath = this.serverless.config.servicePath;
          const packageJsonFilePath = path.join(servicePath, 'package.json');

          // check if package.json is already present. Otherwise create one
          if (!fs.existsSync(packageJsonFilePath)) {
            this.serverless.cli
              .log('Creating an empty package.json file in your service directory');

            const packageJsonFileContent = {
              name: this.serverless.service.service,
              description: '',
              version: '0.1.0',
              dependencies: {},
              devDependencies: {},
            };

            fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);
          }

          // decide the plugin version
          const pluginVersion = this.options.version || 'latest';

          // install the package through npm
          this.serverless.cli.log(
            `Installing plugin "${pluginName}@${pluginVersion}" (this might take a few seconds...)`
          );

          childProcess
            .execSync(`npm install --save-dev ${pluginName}@${pluginVersion}`, {
              stdio: 'ignore',
            });

          // check if plugin was installed correctly
          const pluginInstalled = !!JSON.parse(
            fs.readFileSync(packageJsonFilePath).toString()
          ).devDependencies[pluginName];

          if (pluginInstalled) {
            this.addPluginToServerlessFile(pluginName);
            this.serverless.cli.log(`Successfully installed "${pluginName}@${pluginVersion}"`);
          } else {
            const message = 'An error occurred while installing your plugin. Please try again...';
            this.serverless.cli.log(message);
          }
        } else {
          const message = `Plugin "${pluginName}" not found. Did you spell it correct?`;
          this.serverless.cli.log(message);
        }
      });
  }

  uninstall() {
    return BbPromise.bind(this)
      .then(this.validate)
      .then(this.getPlugins)
      .then(plugins => {
        const pluginName = this.options.name;

        const servicePath = this.serverless.config.servicePath;
        const packageJsonFilePath = path.join(servicePath, 'package.json');

        const plugin = plugins.find((item) => item.name === pluginName);
        if (plugin) {
          // uninstall the package through npm
          this.serverless.cli
            .log(`Uninstalling plugin "${pluginName}" (this might take a few seconds...)`);

          childProcess
            .execSync(`npm uninstall --save-dev ${pluginName}`, {
              stdio: 'ignore',
            });

          // check if plugin was uninstalled correctly
          const pluginStillAvailable = !!JSON.parse(
            fs.readFileSync(packageJsonFilePath).toString()
          ).devDependencies[pluginName];

          if (!pluginStillAvailable) {
            this.removePluginFromServerlessFile(pluginName);
            this.serverless.cli.log(`Successfully uninstalled "${pluginName}"`);
          } else {
            const message = 'An error occurred while uninstalling your plugin. Please try again...';
            this.serverless.cli.log(message);
          }
        } else {
          const message = `Plugin "${pluginName}" not found. Did you spell it correct?`;
          this.serverless.cli.log(message);
        }
      });
  }

  list() {
    return BbPromise.bind(this)
      .then(this.getPlugins)
      .then((plugins) => this.display(plugins));
  }

  search() {
    return BbPromise.bind(this)
      .then(this.getPlugins)
      .then((plugins) => {
        // filter out plugins which match the query
        const regex = new RegExp(this.options.query);

        const filteredPlugins = plugins.filter((plugin) =>
          (plugin.name.match(regex) || plugin.description.match(regex))
        );

        // print a message with the search result
        const pluginCount = filteredPlugins.length;
        const query = this.options.query;
        const message = `${pluginCount} plugin(s) found for your search query "${query}"\n`;
        this.serverless.cli.consoleLog(chalk.yellow(message));

        return filteredPlugins;
      })
      .then((plugins) => {
        this.display(plugins);
      });
  }

  // helper methods
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes
        .Error('This command can only be run inside a service directory');
    }

    return BbPromise.resolve();
  }

  getServerlessFilePath() {
    const servicePath = this.serverless.config.servicePath;
    const serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
    const serverlessYamlFilePath = path.join(servicePath, 'serverless.yaml');
    const serverlessJsonFilePath = path.join(servicePath, 'serverless.json');

    let serverlessFilePath;
    if (fs.existsSync(serverlessYmlFilePath)) {
      serverlessFilePath = serverlessYmlFilePath;
    } else if (fs.existsSync(serverlessYamlFilePath)) {
      serverlessFilePath = serverlessYamlFilePath;
    } else {
      serverlessFilePath = serverlessJsonFilePath;
    }

    return serverlessFilePath;
  }

  getPlugins() {
    const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';

    return fetch(endpoint).then((result) => result.json()).then((json) => json);
  }

  addPluginToServerlessFile(pluginName) {
    const serverlessFilePath = this.getServerlessFilePath();
    if (_.last(_.split(serverlessFilePath, '.')) === 'json') {
      const serverlessFileObj = fse.readJsonSync(serverlessFilePath);
      if (serverlessFileObj.plugins) {
        serverlessFileObj.plugins.push(pluginName);
      } else {
        serverlessFileObj.plugins = [pluginName];
      }
      serverlessFileObj.plugins = _.sortedUniq(serverlessFileObj.plugins);
      fse.writeJsonSync(serverlessFilePath, serverlessFileObj);
    } else {
      yamlAstParser.addNewArrayItem(serverlessFilePath, 'plugins', pluginName);
    }
  }

  removePluginFromServerlessFile(pluginName) {
    const serverlessFilePath = this.getServerlessFilePath();
    if (_.last(_.split(serverlessFilePath, '.')) === 'json') {
      const serverlessFileObj = fse.readJsonSync(serverlessFilePath);
      if (serverlessFileObj.plugins) {
        serverlessFileObj.plugins.pop(pluginName);
        if (_.isEmpty(serverlessFileObj.plugins)) {
          _.unset(serverlessFileObj, 'plugins');
        }
      }
      fse.writeJsonSync(serverlessFilePath, serverlessFileObj);
    } else {
      yamlAstParser.removeExistingArrayItem(this.getServerlessFilePath(), 'plugins', pluginName);
    }
  }

  display(plugins) {
    let message = '';
    if (plugins && plugins.length) {
      // order plugins by name
      const orderedPlugins = _.orderBy(plugins, ['name'], ['asc']);
      orderedPlugins.forEach((plugin) => {
        message += `${chalk.yellow.underline(plugin.name)} - ${plugin.description}\n`;
      });
      // remove last two newlines for a prettier output
      message = message.slice(0, -2);
      this.serverless.cli.consoleLog(message);
      this.serverless.cli.consoleLog(`
To install a plugin run 'sls plugin install --name plugin-name-here'

It will be automatically downloaded, added to package.json & added to serverless.yml
      `);
    } else {
      message = 'There are no plugins available to display';
      this.serverless.cli.consoleLog(message);
    }
    return BbPromise.resolve(message);
  }

  trackPluginInstall() {
    userStats.track('service_pluginInstalled');
    return BbPromise.resolve();
  }

  trackPluginUninstall() {
    userStats.track('service_pluginUninstalled');
    return BbPromise.resolve();
  }

  trackPluginList() {
    userStats.track('service_pluginListed');
    return BbPromise.resolve();
  }

  trackPluginSearch() {
    userStats.track('service_pluginSearched');
    return BbPromise.resolve();
  }
}

module.exports = Plugin;
