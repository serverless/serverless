'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const chalk = require('chalk');
const _ = require('lodash');
const { getServerlessConfigFilePath } = require('../../../utils/getServerlessConfigFile');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error(
        'This command can only be run inside a service directory'
      );
    }

    return BbPromise.resolve();
  },

  getServerlessFilePath() {
    return getServerlessConfigFilePath(this.serverless).then(filePath => {
      if (filePath) return filePath;
      throw new this.serverless.classes.Error(
        'Could not find any serverless service definition file.'
      );
    });
  },

  getPlugins() {
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

    return fetch(endpoint, options)
      .then(result => result.json())
      .then(json => json);
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
      orderedPlugins.forEach(plugin => {
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
