'use strict';

/**
 * Action: Plugin add
 * - Adds the plugin to the project
 *
 * Event Options:
 * - pluginName:      (String) The name of the plugin
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    _          = require('lodash'),
    https       = require('https'),
    execSync   = require('child_process').execSync;

  /**
   * PluginAdd Class
   */

  class PluginAdd extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + PluginAdd.name;
    }

    registerActions() {
      this.S.addAction(this.pluginAdd.bind(this), {
        handler:       'pluginAdd',
        description:   `Adds the Serverless plugin to your project.
usage: "serverless plugin add <plugin-name>" or "serverless plugin add <git-url>"`,
        context:       'plugin',
        contextAction: 'add',
        options:       [],
        parameters: [
          {
            parameter: 'nameOrGitUrl',
            description: 'The plugins name or git url',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    pluginAdd(evt) {

      let _this   = this;
      _this.evt   = evt;

      return _this._addPlugin()
        .then(function() {

          /**
           * Return Event
           */

          return _this.evt;

        });
    }

    /**
     * Add plugin
     */

    _addPlugin() {
      let spinner = SCli.spinner();
      let nameOrGitUrl = this.evt.options.nameOrGitUrl;
      // TODO: Replace this endpoint later on with the new one from Serverless
      let pluginJsonEndpoint = 'https://raw.githubusercontent.com/JustServerless/serverless-registry/gh-pages/plugins.json';

      return new BbPromise(function(resolve, reject) {
        if (!nameOrGitUrl) {
          SCli.log('Please enter a valid plugin name or git url');
          return resolve();
        }
        spinner.start();
        // check if it's a plugins name or git url
        if (nameOrGitUrl.match(/[a-zA-Z0-9]+:[a-zA-Z0-9]+/)) {
          let pluginName = nameOrGitUrl;
          https.get(pluginJsonEndpoint, (result) => {
            spinner.stop(true);
            if (result.statusCode == 200) {
              result.setEncoding('utf8');
              result.on('data', (pluginsJson) => {
                let availablePlugins = JSON.parse(pluginsJson).plugins;
                let plugin = _.find(availablePlugins, { name: pluginName });
                if (plugin) {
                  SCli.log(`Adding plugin "${pluginName}"`);
                  execSync(`npm install --save ${plugin.npmName}`);
                  SCli.log(`Successfully added "${pluginName}"`);
                } else {
                  SCli.log(`The plugin "${pluginName}" does not exist`);
                }
              });
            } else {
              SCli.log('An error occurred while accessing the plugin registry');
            }
          });
        } else if (nameOrGitUrl.match(/((git|ssh|http(s)?)|(git@[\w\.]+))(:(\/\/)?)([\w\.@\:/\-~]+)(\.git)(\/)?/)) {
          let gitUrl = nameOrGitUrl;
          SCli.log(`Adding the plugin "${gitUrl}"`);
          execSync(`npm install --save ${gitUrl}`);
          SCli.log(`Successfully added "${gitUrl}"`);
        } else {
          SCli.log('Please enter a valid plugin name or git url');
        }
        spinner.stop(true);
        resolve();
      });
    };
  }

  return( PluginAdd );
};
