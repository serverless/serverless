'use strict';

const chalk = require('chalk');
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
            usage: 'Search for plugins',
            lifecycleEvents: ['search'],
            options: {
              query: {
                usage: 'Search query',
                required: true,
                shortcut: 'q',
              },
            },
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
    this.serverless.cli.consoleLog(
      chalk.yellow(`${pluginCount} plugin(s) found for your search query "${query}"\n`)
    );

    return this.display(filteredPlugins);
  }
}

module.exports = PluginSearch;
