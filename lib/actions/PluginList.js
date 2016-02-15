'use strict';

/**
 * Action: Plugin list
 * - Lists all installed Serverless plugins
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    https      = require('https'),
    fs         = require('fs'),
  execSync   = require('child_process').execSync;

  /**
   * PluginList Class
   */

  class PluginList extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + PluginList.name;
    }

    registerActions() {
      this.S.addAction(this.pluginList.bind(this), {
        handler:       'pluginList',
        description:   `Lists all installed Serverless plugins`,
        context:       'plugin',
        contextAction: 'list',
        options:       [],
        parameters: []
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    pluginList(evt) {

      let _this   = this;
      _this.evt   = evt;

      return _this._listPlugins()
        .then(function() {

          /**
           * Return Event
           */

          return _this.evt;

        });
    }

    /**
     * List all plugins
     */

    _listPlugins() {
      let spinner = SCli.spinner();
      // TODO: Replace this endpoint later on with the new one from Serverless
      let pluginJsonEndpoint = 'https://raw.githubusercontent.com/JustServerless/serverless-registry/gh-pages/plugins.json';

      return new BbPromise((resolve, reject) => {
        spinner.start();
        https.get(pluginJsonEndpoint, (result) => {
          spinner.stop(true);
          if (result.statusCode == 200) {
            result.setEncoding('utf8');
            result.on('data', (pluginsJson) => {
              let availablePlugins = JSON.parse(pluginsJson).plugins;
              let projectPath = this.S.getProject().getRootPath();
              let dependencies = (JSON.parse(fs.readFileSync(`${projectPath}/package.json`))).dependencies;
              let results = [];
              availablePlugins.forEach((plugin) => {
                if (plugin.npmName in dependencies) {
                  results.push(plugin);
                }
              });
              if (results.length === 0) {
                SCli.log(`You have currently no Serverless plugins installed`);
              } else {
                SCli.log(`${results.length} plugin(s) installed: `);
                results.forEach((plugin)=> {
                  SCli.log(plugin.name);
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

  return( PluginList );
};
