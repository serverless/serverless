'use strict';

const path = require('path');
const chalk = require('chalk');
const _ = require('lodash');
const CLI = require('../../lib/classes/CLI');
const ServerlessError = require('../../lib/serverless-error');

const cli = new CLI(undefined);

module.exports = {
  validate({ serviceDir }) {
    if (!serviceDir) {
      throw new ServerlessError(
        'This command can only be run inside a service directory',
        'MISSING_SERVICE_DIRECTORY'
      );
    }
  },

  getServerlessFilePath({ serviceDir, configurationFilename }) {
    if (configurationFilename) {
      return path.resolve(serviceDir, configurationFilename);
    }
    throw new ServerlessError(
      'Could not find any serverless service definition file.',
      'MISSING_SERVICE_CONFIGURATION_FILE'
    );
  },

  getPluginInfo(name_) {
    let name;
    let version;
    if (name_.startsWith('@')) {
      [, name, version] = name_.split('@', 3);
      name = `@${name}`;
    } else {
      [name, version] = name_.split('@', 2);
    }
    return { name, version };
  },

  async display(plugins) {
    let message = '';
    if (plugins && plugins.length) {
      // order plugins by name
      const orderedPlugins = _.orderBy(plugins, ['name'], ['asc']);
      orderedPlugins.forEach((plugin) => {
        message += `${chalk.yellow.underline(plugin.name)} - ${plugin.description}\n`;
      });
      // remove last two newlines for a prettier output
      message = message.slice(0, -2);
      cli.consoleLog(message);
      cli.consoleLog(`
To install a plugin run 'serverless plugin install --name plugin-name-here'

It will be automatically downloaded and added to your package.json and serverless.yml file
      `);
    } else {
      message = 'There are no plugins available to display';
      cli.consoleLog(message);
    }

    return Promise.resolve(message);
  },
};
