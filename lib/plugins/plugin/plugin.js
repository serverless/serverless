'use strict';

const BbPromise = require('bluebird');
const childProcess = require('child_process');
const fetch = require('node-fetch');
const chalk = require('chalk');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const YAML = require('js-yaml');

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
      'plugin:install:install': () => BbPromise.bind(this).then(this.install),
      'plugin:uninstall:uninstall': () => BbPromise.bind(this).then(this.uninstall),
      'plugin:list:list': () => BbPromise.bind(this).then(this.list),
      'plugin:search:search': () => BbPromise.bind(this).then(this.search),
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

          // install the package through npm
          this.serverless.cli
            .log(`Installing plugin "${pluginName}" (this might take a few seconds...)`);

          childProcess
            .execSync(`npm install --prefix ${servicePath} --save-dev ${pluginName}`, {
              stdio: 'ignore',
            });

          // check if plugin was installed correctly
          const pluginInstalled = !!JSON.parse(
            fs.readFileSync(packageJsonFilePath).toString()
          ).devDependencies[pluginName];

          if (pluginInstalled) {
            const serverlessFilePath = this.getServerlessFilePath();
            let serverlessFileContent = fs.readFileSync(serverlessFilePath).toString();

            const newPluginsArray = {
              plugins: [],
            };

            // load the service and parse it to JSON
            const parsedYaml = YAML.load(serverlessFileContent);

            if (parsedYaml.plugins) {
              newPluginsArray.plugins = parsedYaml.plugins;
            }

            newPluginsArray.plugins = _.union(newPluginsArray.plugins, [pluginName]);

            if (parsedYaml.plugins) {
              // replace the plugins definition in the serverless file
              serverlessFileContent = serverlessFileContent
                .replace(
                  /(plugins:)+(\s)*(- .*\s*)*(\[\])*/, // eslint-disable-line no-useless-escape
                  YAML.dump(newPluginsArray)
                );
            } else {
              serverlessFileContent = serverlessFileContent
                .concat(`\n${YAML.dump(newPluginsArray)}`);
            }

            // write the file back to the disc
            fs.writeFileSync(serverlessFilePath, serverlessFileContent);
            this.serverless.cli.log(`Successfully installed "${pluginName}"`);
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
      .then(() => {
        const pluginName = this.options.name;

        const servicePath = this.serverless.config.servicePath;
        const packageJsonFilePath = path.join(servicePath, 'package.json');

        // uninstall the package through npm
        this.serverless.cli
          .log(`Uninstalling plugin "${pluginName}" (this might take a few seconds...)`);

        childProcess
          .execSync(`npm uninstall --prefix ${servicePath} --save-dev ${pluginName}`, {
            stdio: 'ignore',
          });

        // check if plugin was uninstalled correctly
        const pluginStillAvailable = !!JSON.parse(
          fs.readFileSync(packageJsonFilePath).toString()
        ).devDependencies[pluginName];

        if (!pluginStillAvailable) {
          const serverlessFilePath = this.getServerlessFilePath();
          let serverlessFileContent = fs.readFileSync(serverlessFilePath).toString();

          // load the service and parse it to JSON
          const parsedYaml = YAML.load(serverlessFileContent);

          // remove the plugin from the array if the plugins array is available
          if (parsedYaml.plugins) {
            const newPluginsArray = {
              plugins: [],
            };

            newPluginsArray.plugins = _.pull(parsedYaml.plugins, pluginName);

            // replace the plugins definition in the serverless file
            serverlessFileContent = serverlessFileContent
              .replace(/(plugins:)+(\s)+(- .*\s*)+/, YAML.dump(newPluginsArray));

            // write the file back to the disc
            fs.writeFileSync(serverlessFilePath, serverlessFileContent);
            this.serverless.cli.log(`Successfully uninstalled "${pluginName}"`);
          }
        } else {
          const message = 'An error occurred while uninstalling your plugin. Please try again...';
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

    let serverlessFilePath;
    if (fs.existsSync(serverlessYmlFilePath)) {
      serverlessFilePath = serverlessYmlFilePath;
    } else {
      serverlessFilePath = serverlessYamlFilePath;
    }

    return serverlessFilePath;
  }

  getPlugins() {
    const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';

    return fetch(endpoint).then((result) => result.json()).then((json) => json);
  }

  display(plugins) {
    let message = '';
    if (plugins && plugins.length) {
      // order plugins by name
      const orderedPlugins = _.orderBy(plugins, ['name'], ['asc']);
      orderedPlugins.forEach((plugin) => {
        message += `${chalk.yellow.underline(plugin.name)}\n`;
        message += `${plugin.description}\n\n`;
      });
      // remove last two newlines for a prettier output
      message = message.slice(0, -2);
      this.serverless.cli.consoleLog(message);
    } else {
      message = 'There are no plugins available to display';
      this.serverless.cli.consoleLog(message);
    }
    return BbPromise.resolve(message);
  }
}

module.exports = Plugin;
