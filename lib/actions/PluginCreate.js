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

module.exports = function(S) {

  const path  = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise = require('bluebird'),
    fs        = BbPromise.promisifyAll(require('fs')),
    _         = require('lodash'),
    execSync  = require('child_process').execSync;

  /**
   * PluginCreate Class
   */

  class PluginCreate extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.pluginCreate.bind(this), {
        handler:       'pluginCreate',
        description:   'Creates scaffolding for a new plugin. Usage: serverless plugin create <plugin>',
        context:       'plugin',
        contextAction: 'create',
        options:       [
          {
            option:      'linkNpm',
            shortcut:    'l',
            description: 'Link NPM for development'
          }
        ],
        parameters: [
          {
            parameter: 'name',
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

          SCli.log('Successfully created plugin scaffold with the name: "'  + _this.evt.options.name + '"');

          /**
           * Return Event
           */
          _this.evt.data.name = _this.evt.options.name;
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
      if (!S.config.interactive || _this.evt.options.name) return BbPromise.resolve();

      let prompts = {
        properties: {
          name: {
            description: 'Enter a new plugin name: '.yellow,
            message:     'Plugin name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     (pluginName) => {
              return S.classes.Plugin.validateName(pluginName);
            }
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.options.name = answers.name;
        });
    };

    /**
     * Create Plugin Skeleton
     */

    _createPluginSkeleton() {

      if (!S.classes.Plugin.validateName(this.evt.options.name)) throw new SError(`Invalid Plugin name`);
      // Name of the plugin
      let pluginName = this.evt.options.name;
      // Paths
      let projectPath = S.getProject().getRootPath();
      let serverlessPath = S.getServerlessPath();
      // Directories
      let pluginsDirectory = S.getProject().getRootPath('plugins');
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
      if (this.evt.options.linkNpm) {
        execSync('cd ' + pluginDirectory + ' && npm link');
        execSync('cd ' + projectPath + ' && npm link ' + pluginName);
      }

      // TODO: Remove in V1 because will result in breaking change
      // Add the newly create plugin to the plugins array of the projects s-project.json file
      S.getProject().addPlugin( pluginName );
      S.getProject().save();

      // Add the newly created plugin to the package.json file of the project
      let projectPackageJson = SUtils.readFileSync(S.getProject().getRootPath('package.json'));
      projectPackageJson.dependencies[pluginName] = JSON.parse(packageJson).version;
      fs.writeFileSync(S.getProject().getRootPath('package.json'), JSON.stringify(projectPackageJson, null, 2));
    };
  }

  return( PluginCreate );
};
