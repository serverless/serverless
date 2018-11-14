'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
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
    const ymlFilePath = path.join(servicePath, 'serverless.yml');
    const yamlFilePath = path.join(servicePath, 'serverless.yaml');
    const jsonFilePath = path.join(servicePath, 'serverless.json');
    const jsFilePath = path.join(servicePath, 'serverless.js');

    return BbPromise.props({
      json: fileExists(jsonFilePath),
      yml: fileExists(ymlFilePath),
      yaml: fileExists(yamlFilePath),
      js: fileExists(jsFilePath),
    }).then((exists) => {
      if (exists.yml) {
        return ymlFilePath;
      } else if (exists.yaml) {
        return yamlFilePath;
      } else if (exists.json) {
        return jsonFilePath;
      } else if (exists.js) {
        return jsFilePath;
      }
      return BbPromise.reject(
          new this.serverless.classes.Error(
            'Could not find any serverless service definition file.'
          )
        );
    });
  },

  getPlugins() {
    const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';

    // Use HTTPS Proxy (Optional)
    const proxy = process.env.proxy
      || process.env.HTTP_PROXY
      || process.env.http_proxy
      || process.env.HTTPS_PROXY
      || process.env.https_proxy;

    const options = {};
    if (proxy) {
      options.agent = new HttpsProxyAgent(url.parse(proxy));
    }

    return fetch(endpoint, options).then((result) => result.json()).then((json) => json);
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
