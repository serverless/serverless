'use strict';

/**
 * Action: Plugin create
 * - validates that plugin does NOT already exists
 * - validates that the plugins directory is present
 * - generates plugin skeleton with the plugins name
 *
 * Event Options:
 * - pluginName:      (String) The name of your plugin
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils')),
    _          = require('lodash'),
    execSync   = require('child_process').execSync;

  let fs       = require('fs');

  BbPromise.promisifyAll(fs);

  /**
   * PluginCreate Class
   */

  class PluginCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + PluginCreate.name;
    }

    registerActions() {
      this.S.addAction(this.pluginCreate.bind(this), {
        handler:       'pluginCreate',
        description:   `Creates scaffolding for a new plugin.
usage: serverless plugin create <plugin>`,
        context:       'plugin',
        contextAction: 'create',
        options:       [],
        parameters: [
          {
            parameter: 'pluginName',
            description: 'The name of your plugin',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    pluginCreate(evt) {

      let _this   = this;
      _this.evt   = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._createPluginSkeleton)
        .then(function() {

          SCli.log('Successfully created plugin scaffold with the name: "'  + _this.evt.options.pluginName + '"');

          /**
           * Return Event
           */

          return _this.evt;

        });
    }

    /**
     * Prompt plugin if they're missing
     */

    _prompt() {

      let _this   = this,
        overrides = {};

      // If non-interactive, skip
      if (!_this.S.config.interactive) return BbPromise.resolve();

      let prompts = {
        properties: {
          name: {
            description: 'Enter a new plugin name: '.yellow,
            message:     'Plugin name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(pluginName) {
              return SUtils.isPluginNameValid(pluginName);
            }
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.options.pluginName = answers.name;
        });
    };

    /**
     * Create Plugin Skeleton
     */

    _createPluginSkeleton() {
      // Name of the plugin
      let pluginName = this.evt.options.pluginName;
      // Paths
      let projectPath = this.S.getProject().getRootPath();
      let serverlessPath = this.S.config.serverlessPath;
      // Directories
      let pluginsDirectory = this.S.getProject().getFilePath('plugins');
      let pluginDirectory = path.join(pluginsDirectory, pluginName);
      let pluginTemplateDirectory = path.join(serverlessPath, 'templates', 'plugin');
      // Plugin files from the serverless template directory
      let indexJs = fs.readFileSync(path.join(pluginTemplateDirectory, 'index.js'));
      let packageJson = fs.readFileSync(path.join(pluginTemplateDirectory, 'package.json'));
      let readmeMd = fs.readFileSync(path.join(pluginTemplateDirectory, 'README.md'));

      // Create the plugins directory if it's not yet present
      if (!SUtils.dirExistsSync(pluginsDirectory)) {
        fs.mkdirSync(pluginsDirectory);
      }

      // Create the directory for the new plugin in the plugins directory
      if (!SUtils.dirExistsSync(pluginDirectory)) {
        fs.mkdirSync(pluginDirectory);
      } else {
        throw new SError('Plugin with the name ' + pluginName + ' already exists.');
      }

      // Prepare and copy all files
      let modifiedPackageJson = _.template(packageJson)({ pluginName: pluginName });
      fs.writeFileSync(path.join(pluginDirectory, 'package.json'), modifiedPackageJson);
      fs.writeFileSync(path.join(pluginDirectory, 'index.js'), indexJs);
      fs.writeFileSync(path.join(pluginDirectory, 'README.md'), readmeMd);

      // link the new package
      execSync('cd ' + pluginDirectory + ' && npm link');
      execSync('cd ' + projectPath + ' && npm link ' + pluginName);

      // TODO: Remove in V1 because will result in breaking change
      // Add the newly create plugin to the plugins array of the projects s-project.json file
      // TODO: this belongs to Project class XXX
      let sProjectJson = SUtils.readAndParseJsonSync(this.S.getProject().getFilePath('s-project.json'));
      sProjectJson.plugins.push(pluginName);
      fs.writeFileSync(this.S.getProject().getFilePath('s-project.json'), JSON.stringify(sProjectJson, null, 2));

      // Add the newly created plugin to the package.json file of the project
      let projectPackageJson = SUtils.readAndParseJsonSync(this.S.getProject().getFilePath('package.json'));
      projectPackageJson.dependencies[pluginName] = JSON.parse(packageJson).version;
      fs.writeFileSync(this.S.getProject().getFilePath('package.json'), JSON.stringify(projectPackageJson, null, 2));
    };
  }

  return( PluginCreate );
};
