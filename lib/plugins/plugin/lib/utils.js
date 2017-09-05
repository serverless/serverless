'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');
const path = require('path');
const chalk = require('chalk');
const _ = require('lodash');
const fileExists = require('../../../utils/fs/fileExists');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes
        .Error('This command can only be run inside a service directory');
    }

    return BbPromise.resolve();
  },

  getServerlessFilePath() {
    const servicePath = this.serverless.config.servicePath;
    const serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
    const serverlessYamlFilePath = path.join(servicePath, 'serverless.yaml');
    const serverlessJsonFilePath = path.join(servicePath, 'serverless.json');

    return fileExists(serverlessYmlFilePath)
    .then(ymlExists => {
      if (!ymlExists) {
        return fileExists(serverlessYamlFilePath)
        .then(yamlExists => {
          if (!yamlExists) {
            return serverlessJsonFilePath;
          }
          return serverlessYamlFilePath;
        });
      }
      return serverlessYmlFilePath;
    });
  },

  getPlugins() {
    const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';
    return fetch(endpoint).then((result) => result.json()).then((json) => json);
  },

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
To install a plugin run 'serverless plugin install --name plugin-name-here'

It will be automatically downloaded and added to your package.json and serverless.yml file
      `);
    } else {
      message = 'There are no plugins available to display';
      this.serverless.cli.consoleLog(message);
    }
    return BbPromise.resolve(message);
  },
};
