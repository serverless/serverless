'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
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
      'plugin:search:search': async () => BbPromise.bind(this).then(this.search),
    };
  }

  async search() {
    return BbPromise.bind(this)
      .then(this.getPlugins)
      .then((plugins) => {
        // filter out plugins which match the query
        const regex = new RegExp(this.options.query);

        const filteredPlugins = plugins.filter(
          (plugin) => plugin.name.match(regex) || plugin.description.match(regex)
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
}

module.exports = PluginSearch;
