'use strict';

const cliCommandsSchema = require('../../cli/commands-schema');
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
            ...cliCommandsSchema.get('plugin list'),
          },
        },
      },
    };

    this.hooks = {
      'plugin:list:list': async () => this.list(),
    };
  }

  async list() {
    const plugins = await this.getPlugins();
    await this.display(plugins);
  }
}

module.exports = PluginList;
