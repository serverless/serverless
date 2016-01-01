'use strict';

/**
 * Action: ModuleCreate
 * - takes module and function names
 * - validates that module doesn't already exist
 * - generates function sturcture based on runtime
 * - generates module structure
 *
 * Event Properties:
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
      this.evt            = {};
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
          },
        ],
      });

      return BbPromise.resolve();
    };

    /**
     * Action
     */

    moduleCreate(evt) {

      let _this = this;

      if (evt) {
        _this.evt = evt;
        _this.S.config.interactive = false;
      }

      // If CLI, parse options
      if (_this.S.cli) {
        _this.evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

        if (_this.S.cli.options.nonInteractive) {
          _this.S.config.interactive = false;
        }
      }

      return _this._promptModuleFunction()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._createModuleSkeleton)
          .then(function() {

            let _this    = this,
                evtClone = {
                  _subaction: true,
                  module:     _this.evt.module.name,
                  function:   _this.evt.function
                };

            return _this.S.actions.functionCreate(evtClone)
                .then(function(evt) {
                  _this.evt.function              = evt.function;
                });
          })
          .then(_this._installModuleDependencies)
          .then(function() {

            SCli.log('Successfully created new serverless module "' + _this.evt.module.name + '" with its first function "' + _this.evt.function.name + '"');
            // Return Event
            return _this.evt;
          });
    };

    /**
     * Prompt module & function if they're missing
     */

  _promptModuleFunction() {

      let _this = this,
          overrides = {};

      if (!_this.S.config.interactive) return BbPromise.resolve();

      ['module', 'function'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this['evt'][memberVarKey];
      });

      let prompts = {
        properties: {
          module:              {
            description: 'Enter a name for your new module: '.yellow,
            message:     'Module name is required.',
            required:    true,
          },
          function:            {
            description: 'Enter a function name for your new module: '.yellow,
            message:     'Function name is required',
            required:    true,
          },
        }
      };

      return _this.cliPromptInput(prompts, overrides)
          .then(function(answers) {
            _this.evt.module = answers.module;
            _this.evt.function = answers.function;
          });
    };

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      // non interactive validation
      if (!this.S.config.interactive) {
        if (!this.evt.module || !this.evt.function) {
          return BbPromise.reject(new SError('Missing module or/and function names'));
        }
      }

      // Add default runtime
      if (!this.evt.runtime) {
        this.evt.runtime = 'nodejs';
      }

      if (!SUtils.supportedRuntimes[this.evt.runtime]) {
        return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.runtime, SError.errorCodes.UNKNOWN));
      }

      // Set default function template
      if (!this.evt.template) this.evt.template = 's-function.json';

      // Sanitize module
      this.evt.module = this.evt.module.toLowerCase().trim()
          .replace(/\s/g, '-')
          .replace(/[^a-zA-Z-\d:]/g, '')
          .substring(0, 19);

      // Sanitize function
      this.evt.function = this.evt.function.toLowerCase().trim()
          .replace(/\s/g, '-')
          .replace(/[^a-zA-Z-\d:]/g, '')
          .substring(0, 19);

      // If module already exists, throw error
      let pathModule = path.join(this.S.config.projectPath, 'back', 'modules', this.evt.module);
      if (SUtils.dirExistsSync(pathModule)) {
        return BbPromise.reject(new SError(
            'Module ' + this.evt.module + ' already exists',
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
          moduleJsonTemplate   = _this._generateModuleJson(),
          packageJsonTemplate  = SUtils.readAndParseJsonSync(path.join(_this._templatesDir, 'nodejs', 'package.json')),
          libJs                = fs.readFileSync(path.join(this._templatesDir, 'nodejs', 'index.js'));

      // Save Path
      let pathModule           = path.join('back', 'modules', _this.evt.module);

      // Prep package.json
      packageJsonTemplate.name        = _this.evt.module;
      packageJsonTemplate.description = 'Dependencies for a Serverless Module written in Node.js';

      // Write base module structure
      writeDeferred.push(
          fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule)),
          fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule, 'lib')),
          fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule, 'package')),
          SUtils.writeFile(path.join(_this.S.config.projectPath, pathModule, 'lib', 'index.js'), libJs),
          SUtils.writeFile(path.join(_this.S.config.projectPath, pathModule, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2)),
          SUtils.writeFile(path.join(_this.S.config.projectPath, pathModule, 's-module.json'), JSON.stringify(moduleJsonTemplate, null, 2))
      );

      // Set evt properties
      let moduleName              = _this.evt.module;
      _this.evt.module            = moduleJsonTemplate;
      _this.evt.module.name       = moduleName;
      _this.evt.module.pathModule = pathModule;

      return BbPromise.all(writeDeferred);
    };

    /*
     * Generate s-module.json template (private)
     */

    _generateModuleJson() {

      let _this = this;
      let moduleJsonTemplate  = SUtils.readAndParseJsonSync(path.join(this._templatesDir, 's-module.json'));
      moduleJsonTemplate.name = _this.evt.module;

      // Add runtime
      switch (_this.evt.runtime) {
        case 'nodejs':
          moduleJsonTemplate.runtime = 'nodejs';
          break;
        default:
          return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.runtime, SError.errorCodes.UNKNOWN));
          break;
      }

      // Return
      return moduleJsonTemplate;
    };

    _installModuleDependencies() {
      SCli.log('Installing "serverless-helpers" for this module via NPM...');
      SUtils.npmInstall(path.join(this.S.config.projectPath, this.evt.module.pathModule));
      return BbPromise.resolve();
    }
  }

  return( ModuleCreate );
};

