'use strict';

const { log } = require('@serverless/utils/log');
const cliCommandsSchema = require('../../cli/commands-schema');
const pluginUtils = require('./lib/utils');

class PluginSearch {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(this, pluginUtils);

    this.commands = {
      plugin: {
        commands: {
          search: {
            ...cliCommandsSchema.get('plugin search'),
          },
        },
      },
    };

    this.hooks = {
      'plugin:search:search': async () => this.search(),
    };
  }

  async search() {
    const plugins = await this.getPlugins();

    // filter out plugins which match the query
    const regex = new RegExp(this.options.query);

    const filteredPlugins = plugins.filter(
      (plugin) => plugin.name.match(regex) || plugin.description.match(regex)
    );

    // print a message with the search result
    const pluginCount = filteredPlugins.length;
    const query = this.options.query;
    log.notice(`${pluginCount} plugin(s) found matching "${query}":`);
    log.notice();

    await this.display(filteredPlugins);
  }
}

module.exports = PluginSearch;
