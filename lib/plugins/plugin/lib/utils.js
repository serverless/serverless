'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const chalk = require('chalk');
const _ = require('lodash');
const { legacy, log, writeText, style } = require('@serverless/utils/log');

module.exports = {
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
      // not relying on recommended WHATWG URL
      // due to missing support for it in https-proxy-agent
      // https://github.com/TooTallNate/node-https-proxy-agent/issues/117
      options.agent = new HttpsProxyAgent(url.parse(proxy));
    }

    return fetch(endpoint, options)
      .then((result) => result.json())
      .then((json) => json);
  },

  async display(plugins) {
    let message = '';
    if (plugins && plugins.length) {
      // order plugins by name
      const orderedPlugins = _.orderBy(plugins, ['name'], ['asc']);
      orderedPlugins.forEach((plugin) => {
        message += `${chalk.yellow.underline(plugin.name)} - ${plugin.description}\n`;
        writeText(`${style.title(plugin.name)} ${style.aside(plugin.description)}`);
      });
      // remove last two newlines for a prettier output
      message = message.slice(0, -2);
      legacy.consoleLog(message);
      legacy.consoleLog(`
To install a plugin run 'serverless plugin install --name plugin-name-here'

It will be automatically downloaded and added to your package.json and serverless.yml file
      `);
      writeText(
        null,
        'Install a plugin by running:',
        '  serverless plugin install --name ...',
        null,
        'It will be automatically downloaded and added to package.json and serverless.yml'
      );
    } else {
      message = 'There are no plugins available to display';
      legacy.consoleLog(message);
      log.notice.skip('There are no plugins available to display');
    }

    return BbPromise.resolve(message);
  },
};
