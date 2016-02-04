'use strict';

/**
 * Action: FunctionCreate
 * - takes existing component name and new function name
 * - validates that component exists
 * - validates that function does NOT already exists in component
 * - generates function structure based on runtime
 *
 * Event Options:
 * - component:  (String) Name of the existing component you want to create a function for
 * - function:   (String) Name of the new function for your existing component
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
            option:      'function',
            shortcut:    'f',
            description: 'The name of your new function'
          },
          {
            option:      'template',
            shortcut:    't',
            description: 'A template for a specific type of Function'
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
          });
    };


    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      if (!this.evt.options.component || !this.evt.options.function) {
        return BbPromise.reject(new SError('Component and Function names are both required.'));
      }

      // If module does not exist in project, throw error
      if (!SUtils.doesComponentExist(this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Component ' + this.evt.options.component + ' does NOT exist',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      if (['templates'].indexOf(this.evt.options.function) != -1) {
        return BbPromise.reject(new SError('This function name is reserved: ' + this.evt.options.function, SError.errorCodes.UNKNOWN));
      }

      // If function already exists in component, throw error
      if (SUtils.doesFunctionExist(this.evt.options.function, this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Function ' + this.evt.options.function + ' already exists in component ' + this.evt.options.component,
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };

    /**
     * Create Function Skeleton
     */

    _createFunctionSkeleton() {

      // Instantiate Function
      let func = new this.S.classes.Function(this.S, {
        //sPath: this.evt.options.sPath
        component:  this.evt.options.component,
        function:   this.evt.options.function,
      });

      this.S.state.setAsset(func);
      return func.save();
    };
  }

  return( FunctionCreate );
};
