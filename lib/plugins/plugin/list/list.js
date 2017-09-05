'use strict';

const BbPromise = require('bluebird');
const userStats = require('../../../utils/userStats');
const pluginUtils = require('../lib/utils');

class PluginList {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      pluginUtils
    );

    this.commands = {
      plugin: {
        commands: {
          list: {
            usage: 'Lists all available plugins',
            lifecycleEvents: [
              'list',
            ],
          },
        },
      },
    };

    this.hooks = {
      'plugin:list:list': () => BbPromise.bind(this)
        .then(this.list)
        .then(this.trackPluginList),
    };
  }

  list() {
    return BbPromise.bind(this)
      .then(this.getPlugins)
      .then((plugins) => this.display(plugins));
  }

  trackPluginList() {
    userStats.track('service_pluginListed');
    return BbPromise.resolve();
  }
}

module.exports = PluginList;
