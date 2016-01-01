'use strict';

/**
 * Action: ModuleCreate
 * - takes module and function names
 * - validates that module doesn't already exist
 * - generates function sturcture based on runtime
 * - generates module structure
 *
 * Options:
 * - module:    (String) Name of your new module
 * - function:  (String) Name of your first function in your new module
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    SUtils     = require(path.join(serverlessPath, 'utils')),
    BbPromise  = require('bluebird'),
    fs         = require('fs');

  BbPromise.promisifyAll(fs);

  /**
   * ModuleCreate Class
   */

  class ModuleCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
      this._templatesDir  = path.join(__dirname, '..', 'templates');
      this.options        = {};
    }

    static getName() {
      return 'serverless.core.' + ModuleCreate.name;
    }

    registerActions() {
      this.S.addAction(this.moduleCreate.bind(this), {
        handler:       'moduleCreate',
        description:   `Creates scaffolding for a new serverless module.
usage: serverless module create`,
        context:       'module',
        contextAction: 'create',
        options:       [
          {
            option:      'module',
            shortcut:    'm',
            description: 'The name of your new module'
          },
          {
            option:      'function',
            shortcut:    'f',
            description: 'The name of your first function for your new module'
          },
          {
            option:      'template',
            shortcut:    't',
            description: 'A template for a specific type of Function'
          },
          {
            option:      'runtime',
            shortcut:    'r',
            description: 'Optional - Runtime of your new module. Default: nodejs'
          },
          {
            option:      'nonInteractive',
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          }
        ]
      });

      return BbPromise.resolve();
    };

    /**
     * Action
     */

    moduleCreate(options) {

      let _this = this;
      this.options = options || {};

      // If CLI, parse arguments
      if (this.S.cli && (!options || !options.subaction)) {
        this.options = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        if (this.S.cli.options.nonInteractive) this.S.config.interactive = false;
      }

      return _this._promptModuleFunction()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._createModuleSkeleton)
          .then(function() {

            let _this    = this,
                options = {
                  subaction: true,
                  module:     _this.options.module,
                  function:   _this.options.function
                };

            return _this.S.actions.functionCreate(options)
          })
          .then(_this._installModuleDependencies)
          .then(function() {

            SCli.log('Successfully created new serverless module "' + _this.options.module + '" with its first function "' + _this.options.function + '"');

            // Return
            return {
              options: _this.options
            }
          });
    };

    /**
     * Prompt module & function, if missing
     */

    _promptModuleFunction() {

      let _this = this,
        overrides = {};

      if (!_this.S.config.interactive) return BbPromise.resolve();

      ['module', 'function'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this['options'][memberVarKey];
      });

      let prompts = {
        properties: {
          module:     {
            default:     'resource',
            description: 'Enter a name for your new module: '.yellow,
            message:     'Module name is required.',
            required:    true
          },
          function:   {
            default:     'create',
            description: 'Enter a function name for your new module: '.yellow,
            message:     'Function name is required',
            required:    true
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.options.module = answers.module;
          _this.options.function = answers.function;
        });
    };

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      // non interactive validation
      if (!this.S.config.interactive) {
        if (!this.options.module || !this.options.function) {
          return BbPromise.reject(new SError('Missing module or/and function names'));
        }
      }

      // Add default runtime
      if (!this.options.runtime) {
        this.options.runtime = 'nodejs';
      }

      if (!SUtils.supportedRuntimes[this.options.runtime]) {
        return BbPromise.reject(new SError('Unsupported runtime ' + this.options.runtime, SError.errorCodes.UNKNOWN));
      }

      // Sanitize module
      this.options.module = this.options.module.toLowerCase().trim()
          .replace(/\s/g, '-')
          .replace(/[^a-zA-Z-\d:]/g, '')
          .substring(0, 19);

      // Sanitize function
      this.options.function = this.options.function.toLowerCase().trim()
          .replace(/\s/g, '-')
          .replace(/[^a-zA-Z-\d:]/g, '')
          .substring(0, 19);

      // If module already exists, throw error
      let pathModule = path.join(this.S.config.projectPath, 'back', 'modules', this.options.module);
      if (SUtils.dirExistsSync(pathModule)) {
        return BbPromise.reject(new SError(
            'Module ' + this.options.module + ' already exists',
            SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };

    /**
     * Create Module Skeleton
     */

    _createModuleSkeleton() {

      let _this                = this,
          writeDeferred        = [],
          module               = new _this.S.classes.Module(_this.S, { module: _this.options.module, runtime: _this.options.runtime }),
          pathModule           = path.join('back', 'modules', _this.options.module),
          packageJsonTemplate  = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'nodejs', 'package.json')),
          libJs                = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'index.js'));

      // Prep package.json
      packageJsonTemplate.name        = _this.options.module;
      packageJsonTemplate.description = 'Dependencies for a Serverless Module written in Node.js';

      // Write base module structure
      writeDeferred.push(
          fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule)),
          fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule, 'lib')),
          fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule, 'templates')),
          fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule, 'functions')),
          SUtils.writeFile(path.join(_this.S.config.projectPath, pathModule, 'lib', 'index.js'), libJs),
          SUtils.writeFile(path.join(_this.S.config.projectPath, pathModule, 'templates', 's-templates.json'), '{}'),
          SUtils.writeFile(path.join(_this.S.config.projectPath, pathModule, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2)),
          module.save()
      );

      return BbPromise.all(writeDeferred);
    };

    /**
     * Install Module Dependencies
     */

    _installModuleDependencies() {
      SCli.log('Installing "serverless-helpers" for this module via NPM...');
      SUtils.npmInstall(path.join(this.S.config.projectPath, 'back', 'modules', this.options.module));
      return BbPromise.resolve();
    }
  }

  return( ModuleCreate );
};