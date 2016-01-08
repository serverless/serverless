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
            option:      'component',
            shortcut:    'c',
            description: 'The name of the component you want to create a module in'
          },
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
          }
        ]
      });

      return BbPromise.resolve();
    };

    /**
     * Action
     */

    moduleCreate(evt) {

      let _this     = this;
      _this.evt     = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._createModuleSkeleton)
        .then(_this._createFunctionSkeleton)
        .then(function() {

          SCli.log('Successfully created new serverless module "' + _this.evt.options.module + '" inside the component "' + _this.evt.options.component + '"');

          /**
           * Return Action Data
           * - WARNING: Adjusting these will break Plugins
           */

          return _this.evt;

        });
    };

    /**
     * Prompt component, module & function, if missing
     */

    _prompt() {

      let _this = this,
        overrides = {};

      if (!_this.S.config.interactive) return BbPromise.resolve();

      ['module', 'function'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this.evt.options[memberVarKey];
      });

      let prompts = {
        properties: {
          module: {
            default:     'resource',
            description: 'Enter a name for your new module: '.yellow,
            message:     'Module name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(moduleName) {
              return SUtils.isModuleNameValid(moduleName);
            }
          },
          function: {
            default:     'show',
            description: 'Enter a function name for your new module: '.yellow,
            message:     'Function name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(functionName) {
              return SUtils.isFunctionNameValid(functionName);
            }
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.options.module = answers.module;
          _this.evt.options.function = answers.function;
        })
        .then(function() {
          return _this.cliPromptSelectComponent('Select a component to create your module in: ', _this.evt.options.component)
            .then(component => {
              _this.evt.options.component = component;
              BbPromise.resolve();
            });
        });
    };

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      // Add default runtime
      if (!this.evt.options.runtime) {
        this.evt.options.runtime = 'nodejs';
      }

      if (!this.evt.options.component || !this.evt.options.module || !this.evt.options.function) {
        return BbPromise.reject(new SError('Component, Module and Function names are all required.'));
      }

      if (!SUtils.doesComponentExist(this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Component ' + this.evt.options.component + ' does not exist in your project',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      if (!SUtils.supportedRuntimes[this.evt.options.runtime]) {
        return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.options.runtime, SError.errorCodes.UNKNOWN));
      }

      if (['lib', 'node_modules'].indexOf(this.evt.options.module) != -1) {
        return BbPromise.reject(new SError('This module name is reserved: ' + this.evt.options.component, SError.errorCodes.UNKNOWN));
      }

      // If module exists in project, throw error
      if (SUtils.doesModuleExist(this.evt.options.module, this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Module ' + this.evt.options.module + ' already exists',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };

    /**
     * Create Module Skeleton
     */

    _createModuleSkeleton() {

      let _this              = this,
        writeDeferred        = [],
        pathModule           = path.join(_this.evt.options.component, _this.evt.options.module);

      // Instantiate Module
      let module  = new _this.S.classes.Module(_this.S, {
        component: _this.evt.options.component,
        module:    _this.evt.options.module,
        runtime:   _this.evt.options.runtime
      });

      // Write base module structure
      writeDeferred.push(
        fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule)),
        fs.mkdirSync(path.join(_this.S.config.projectPath, pathModule, 'templates')),
        SUtils.writeFile(path.join(_this.S.config.projectPath, pathModule, 'templates', 's-templates.json'), '{}'),
        module.save()
      );

      return BbPromise.all(writeDeferred);
    };

    /**
     * Create Module Skeleton
     */

    _createFunctionSkeleton() {
      let _this = this;

      // Create new event and call FunctionCreate
      let newEvt = {
        options: {
          component:     _this.evt.options.component,
          module:     _this.evt.options.module,
          function:   _this.evt.options.function,
          runtime:    _this.evt.options.runtime || 'nodejs'
        }
      };

      return _this.S.actions.functionCreate(newEvt);
    }
  }

  return( ModuleCreate );
};
