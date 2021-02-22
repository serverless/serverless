'use strict';

const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const chalk = require('chalk');
const _ = require('lodash');
const ServerlessError = require('../../../serverless-error');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new ServerlessError('This command can only be run inside a service directory');
    }
  },

  getServerlessFilePath() {
    if (this.serverless.configurationPath) return this.serverless.configurationPath;
    throw new ServerlessError('Could not find any serverless service definition file.');
  },

  async getPlugins() {
    const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';

    // Use HTTPS Proxy (Optional)
    const proxy =
      process.env.proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.HTTPS_PROXY ||
      process.env.https_proxy;

    const options = {};
    if (proxy) {
      options.agent = new HttpsProxyAgent(url.parse(proxy));
    }

    const result = await fetch(endpoint, options);
    return result.json();
  },

  getPluginInfo(name) {
    let pluginInfo;
    if (name.startsWith('@')) {
      pluginInfo = name.slice(1).split('@', 2);
      pluginInfo[0] = `@${pluginInfo[0]}`;
    } else {
      pluginInfo = name.split('@', 2);
    }
    return pluginInfo;
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
    return message;
  },
};
