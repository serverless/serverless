'use strict';

/**
 * Action: Plugin search
 * - looks up available plugins
 *
 * Event Options:
 * - searchQuery:      (String) The search query for your plugin search
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    https       = require('https');

  /**
   * PluginSearch Class
   */

  class PluginSearch extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + PluginSearch.name;
    }

    registerActions() {
      this.S.addAction(this.pluginSearch.bind(this), {
        handler:       'pluginSearch',
        description:   `Searches the Serverless plugin registry for available plugins.
usage: serverless plugin search <plugin>`,
        context:       'plugin',
        contextAction: 'search',
        options:       [],
        parameters: [
          {
            parameter: 'searchQuery',
            description: 'The search query for your plugin search',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    pluginSearch(evt) {

      let _this   = this;
      _this.evt   = evt;

      return _this._searchPlugin()
        .then(function() {

          /**
           * Return Event
           */

          return _this.evt;

        });
    }

    /**
     * Search for plugins
     */

    _searchPlugin() {
      let spinner = SCli.spinner();
      let searchQuery = this.evt.options.searchQuery;
      // TODO: Replace this endpoint later on with the new one from Serverless
      let pluginJsonEndpoint = 'https://raw.githubusercontent.com/JustServerless/serverless-registry/gh-pages/plugins.json';

      return new BbPromise((resolve, reject) => {
        if (!searchQuery) {
          SCli.log('Please enter a search query');
          return resolve();
        }
        spinner.start();
        SCli.log('Searching...');
        https.get(pluginJsonEndpoint, (result) => {
          spinner.stop(true);
          if (result.statusCode == 200) {
            result.setEncoding('utf8');
            result.on('data', (pluginsJson) => {
              let availablePlugins = JSON.parse(pluginsJson).plugins;
              let results = [];
              let searchQueryRegex = new RegExp(searchQuery);
              availablePlugins.forEach((plugin) => {
                if (plugin.name.match(searchQueryRegex) || plugin.description.match(searchQueryRegex)) {
                  results.push(plugin);
                }
              });
              if (results.length === 0) {
                SCli.log(`No results found for your query "${searchQuery}"`);
              } else {
                SCli.log(`${results.length} plugin(s) found: `);
                results.forEach((result) => {
                  SCli.log(`${result.name} | ${result.description}`);
                });
              }
            });
          } else {
            SCli.log('An error occurred while accessing the plugin registry');
          }
          resolve();
        });
      });
    };
  }

  return( PluginSearch );
};
