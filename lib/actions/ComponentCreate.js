'use strict';

/**
 * Action: ComponentCreate
 * - takes component, module and function names
 * - validates that component doesn't already exist
 * - generates module and function sturcture based on runtime
 *
 * Options:
 * - component: (String) Name of your new component
 * - module:    (String) Name of your first module in your new component
 * - function:  (String) Name of your first function in your new component
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
   * ComponentCreate Class
   */

  class ComponentCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + ComponentCreate.name;
    }

    registerActions() {
      this.S.addAction(this.componentCreate.bind(this), {
        handler:       'componentCreate',
        description:   `Creates scaffolding for a new serverless component.
usage: serverless component create`,
        context:       'component',
        contextAction: 'create',
        options:       [
          {
            option:      'component',
            shortcut:    'c',
            description: 'The name of your new component'
          },
          {
            option:      'module',
            shortcut:    'm',
            description: 'The name of your first module in your new component'
          },
          {
            option:      'function',
            shortcut:    'f',
            description: 'The name of your first function in your new component'
          },
          {
            option:      'runtime',
            shortcut:    'r',
            description: 'Runtime of your new module. Default: nodejs'
          }
        ]
      });

      return BbPromise.resolve();
    };

    /**
     * Action
     */

    componentCreate(evt) {

      let _this     = this;
      _this.evt     = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._createComponentSkeleton)
        .then(_this._createModuleSkeleton)
        .then(_this._installComponentDependencies)
        .then(function() {

          SCli.log('Successfully created new serverless component: ' + _this.evt.options.component);

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

      ['component', 'module', 'function'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this.evt.options[memberVarKey];
      });

      let prompts = {
        properties: {
          component: {
            default:     'nodejscomponent',
            description: 'Enter a name for your new component: '.yellow,
            message:     'Component name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(componentName) {
              return SUtils.isModuleNameValid(componentName);
            }
          },
          module: {
            default:     'resource',
            description: 'Enter a name for your component\'s first module: '.yellow,
            message:     'Module name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(moduleName) {
              return SUtils.isModuleNameValid(moduleName);
            }
          },
          function: {
            default:     'show',
            description: 'Enter a name for your module\'s first function: '.yellow,
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
          _this.evt.options.component = answers.component;
          _this.evt.options.module    = answers.module;
          _this.evt.options.function  = answers.function;
        });
    };

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      // non interactive validation
      if (!this.S.config.interactive) {
        if (!this.evt.options.component || !this.evt.options.module || !this.evt.options.function) {
          return BbPromise.reject(new SError('Component, Module and Function names are all required.'));
        }
      }

      // Add default runtime
      if (!this.evt.options.runtime) {
        this.evt.options.runtime = 'nodejs';
      }

      if (!SUtils.supportedRuntimes[this.evt.options.runtime]) {
        return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.options.runtime, SError.errorCodes.UNKNOWN));
      }

      // Check is not reserved name
      if (['meta', 'plugins'].indexOf(this.evt.options.component) != -1) {
        return BbPromise.reject(new SError('This component name is reserved: ' + this.evt.options.component, SError.errorCodes.UNKNOWN));
      }

      // If component exists in project, throw error
      if (SUtils.doesComponentExist(this.evt.options.component, this.S.config.projectPath)) {
        return BbPromise.reject(new SError(
          'Component ' + this.evt.options.component + ' already exists',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };

    /**
     * Create component Skeleton
     */

    _createComponentSkeleton() {
      let component  = new this.S.classes.Component(this.S, {
        component: this.evt.options.component,
        module:    this.evt.options.module,
        runtime:   this.evt.options.runtime
      });

      this.S.state.setAsset(component);
      return component.save();
    };

    /**
     * Create Module Skeleton
     */

    _createModuleSkeleton() {

      let _this = this,
        newEvt = {
          options: {
            component:  _this.evt.options.component,
            module:     _this.evt.options.module,
            function:   _this.evt.options.function
          }
        };

      return _this.S.actions.moduleCreate(newEvt);
    };

    /**
     * Install Component Dependencies
     */

    _installComponentDependencies() {
      let _this = this;
      if (_this.runtime === 'nodejs') {
        SCli.log('Installing "serverless-helpers" for this component via NPM...');
        SUtils.npmInstall(path.join(this.S.config.projectPath, this.evt.options.component));
      } else if (_this.runtime === 'python2.7') {
        SCli.log("Python functions don't install dependencies by default...");
      }
      return BbPromise.resolve();
    }
  }

  return( ComponentCreate );
};