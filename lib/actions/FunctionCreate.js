'use strict';

/**
 * Action: FunctionCreate
 * - takes existing module name and new function name
 * - validates that module exists
 * - validates that function does NOT already exists in module
 * - generates function sturcture based on runtime
 *
 * Event Options:
 * - module:     (String) Name of the existing module you want to create a function for
 * - function:   (String) Name of the new function for your existing module
 * - template:   (String) Name of the template to use to create the function JSON
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'ServerlessError')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    SUtils     = require(path.join(serverlessPath, 'utils'));

  let fs = require('fs');
  BbPromise.promisifyAll(fs);

  /**
   * FunctionCreate Class
   */

  class FunctionCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
      this._templatesDir = path.join(__dirname, '..', 'templates');
    }

    static getName() {
      return 'serverless.core.' + FunctionCreate.name;
    }

    registerActions() {
      this.S.addAction(this.functionCreate.bind(this), {
        handler:       'functionCreate',
        description:   `Creates scaffolding for a new function.
usage: serverless function create <function>`,
        context:       'function',
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
            description: 'The name of the module you want to create a function in'
          },
          {
            option:      'function',
            shortcut:    'f',
            description: 'The name of your new function'
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
    }

    /**
     * Action
     */

    functionCreate(evt) {

      let _this   = this;
      _this.evt   = evt;

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._createFunctionSkeleton)
          .then(function() {
            SCli.log('Successfully created function: "'  + _this.evt.options.function + '"');

            /**
             * Return Event
             */

            return _this.evt;

          });
    }

    /**
     * Prompt component, module & function if they're missing
     */

    _prompt() {

      let _this = this,
          overrides = {};

      if (!_this.S.config.interactive) return BbPromise.resolve();

      ['function'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this.evt.options[memberVarKey];
      });

      let prompts = {
        properties: {
          function: {
            description: 'Enter a new function name: '.yellow,
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
            _this.evt.options.function = answers.function;
          })
          .then(function() {
            return _this.cliPromptSelectComponent('Select a component to create your function in: ', _this.evt.options.component)
              .then(component => {
                _this.evt.options.component = component;
                BbPromise.resolve();
              });
          })
          .then(function() {
            return _this.cliPromptSelectModule('Select a component module to create your function in: ', _this.evt.options.module, _this.evt.options.component)
              .then(module => {
                _this.evt.options.module = module;
                BbPromise.resolve();
              });
          });
    };


    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      if (!this.evt.options.component || !this.evt.options.module || !this.evt.options.function) {
        return BbPromise.reject(new SError('Component, Module and Function names are all required.'));
      }

      // If module does not exist in project, throw error
      if (!SUtils.doesComponentExist(this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Component ' + this.evt.options.component + ' does NOT exist',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      // If module does not exist in project, throw error
      if (!SUtils.doesModuleExist(this.evt.options.module, this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Module ' + this.evt.options.module + ' does NOT exist',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      if (['templates'].indexOf(this.evt.options.function) != -1) {
        return BbPromise.reject(new SError('This function name is reserved: ' + this.evt.options.function, SError.errorCodes.UNKNOWN));
      }

      // If function already exists in module, throw error
      if (SUtils.doesFunctionExist(this.evt.options.function, this.evt.options.module, this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Function ' + this.evt.options.function + ' already exists in module ' + this.evt.options.module,
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };


    /**
     * Create Function Skeleton
     */

    _createFunctionSkeleton() {

      let _this           = this,
          writeDeferred   = [],
          functionPath    = path.join(_this.evt.options.component, _this.evt.options.module, _this.evt.options.function),
          handlerJs       = fs.readFileSync(path.join(_this._templatesDir, 'nodejs', 'handler.js'));

      // Instantiate Function
      let func = new _this.S.classes.Function(_this.S, {
        component:  _this.evt.options.component,
        module:     _this.evt.options.module,
        function:   _this.evt.options.function
      });

      // Write function files: directory, handler, event.json, s-function.json
      writeDeferred.push(
          fs.mkdirSync(path.join(_this.S.config.projectPath, functionPath)),
          SUtils.writeFile(path.join(path.join(_this.S.config.projectPath, functionPath), 'handler.js'), handlerJs),
          SUtils.writeFile(path.join(_this.S.config.projectPath, functionPath, 'event.json'), '{}'),
        func.save()
      );

      return BbPromise.all(writeDeferred);
    };
  }

  return( FunctionCreate );
};
