'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const userStats = require('../../../utils/userStats');
const pluginUtils = require('../lib/utils');

class PluginSearch {
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
          search: {
            usage: 'Search for plugins',
            lifecycleEvents: [
              'search',
            ],
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
      'plugin:search:search': () => BbPromise.bind(this)
        .then(this.search)
        .then(this.trackPluginSearch),
    };
  }

  search() {
    return BbPromise.bind(this)
      .then(this.getPlugins)
      .then((plugins) => {
        // filter out plugins which match the query
        const regex = new RegExp(this.options.query);

        const filteredPlugins = plugins.filter((plugin) =>
          (plugin.name.match(regex) || plugin.description.match(regex))
        );

        // print a message with the search result
        const pluginCount = filteredPlugins.length;
        const query = this.options.query;
        const message = `${pluginCount} plugin(s) found for your search query "${query}"\n`;
        this.serverless.cli.consoleLog(chalk.yellow(message));

        return filteredPlugins;
      })
      .then((plugins) => {
        this.display(plugins);
      });
  }

  trackPluginSearch() {
    userStats.track('service_pluginSearched');
    return BbPromise.resolve();
  }
}

module.exports = PluginSearch;
