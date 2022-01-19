'use strict';

const fetch = require('node-fetch');
const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const _ = require('lodash');
const { log, writeText, style } = require('@serverless/utils/log');

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
    if (plugins && plugins.length) {
      // order plugins by name
      const orderedPlugins = _.orderBy(plugins, ['name'], ['asc']);
      orderedPlugins.forEach((plugin) => {
        writeText(`${style.title(plugin.name)} ${style.aside(plugin.description)}`);
      });
      writeText(
        null,
        'Install a plugin by running:',
        '  serverless plugin install --name ...',
        null,
        'It will be automatically downloaded and added to package.json and serverless.yml'
      );
    } else {
      log.notice.skip('There are no plugins available to display');
    }

    return BbPromise.resolve();
  },
};
