'use strict';

const pluginUtils = require('./lib/utils');

class PluginList {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(this, pluginUtils);

    this.commands = {
      plugin: {
        commands: {
          list: {
            usage: 'Lists all available plugins',
            lifecycleEvents: ['list'],
          },
        },
      },
    };

    this.hooks = {
      'plugin:list:list': () => this.list(),
    };
  }

  async list() {
    const plugins = await this.getPlugins();
    return this.display(plugins);
  }
}

module.exports = PluginList;
