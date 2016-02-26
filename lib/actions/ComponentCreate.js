'use strict';

/**
 * Action: ComponentCreate
 * - takes component name
 * - validates that component doesn't already exist
 *
 * Options:
 * - name:      (String) Name of your new component
 * - runtime:   (String) Runtime of your new component. Default: nodejs
 */

module.exports = function(SPlugin, serverlessPath) {

  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'Error')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    SUtils     = require(path.join(serverlessPath, 'utils')),
    BbPromise  = require('bluebird'),
    fs         = require('fs');

  BbPromise.promisifyAll(fs);

  /**
   * ComponentCreate Class
   */

  class ComponentCreate extends SPlugin {

    constructor(S) {
      super(S);
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
            option:      'runtime',
            shortcut:    'r',
            description: 'Runtime of your new component. Default: nodejs'
          }
        ],
        parameters: [
          {
            parameter: 'name',
            description: 'name of your new component',
            position: '0'
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
        .then(_this._installComponentDependencies)
        .then(function() {

          SCli.log('Successfully created new serverless component: ' + _this.evt.options.name);

          /**
           * Return Action Data
           * - WARNING: Adjusting these will break Plugins
           */

          return _this.evt;

        });
    };

    /**
     * Prompt component & function, if missing
     */

    _prompt() {

      let _this   = this,
        overrides = {};

      if (!_this.S.config.interactive || _this.evt.options.name) return BbPromise.resolve();

      ['name'].forEach(memberVarKey => {
        overrides[memberVarKey] = _this.evt.options[memberVarKey];
      });

      let prompts = {
        properties: {
          sPath: {
            default:     'nodejscomponent',
            description: 'Enter a name for your new component: '.yellow,
            message:     'Component name must contain only letters, numbers, hyphens, or underscores.',
            required:    true,
            conform:     function(componentName) {
              return SUtils.isComponentNameValid(componentName);
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
     * Validate and prepare data before creating component
     */

    _validateAndPrepare() {

      // non interactive validation
      if (!this.S.config.interactive) {
        if (!this.evt.options.name) {
          return BbPromise.reject(new SError('Component name is required.'));
        }
      }

      // Add default runtime
      if (!this.evt.options.runtime) {
        this.evt.options.runtime = 'nodejs';
      }

      if (!this.S.classes.Component.getSupportedRuntimes()[this.evt.options.runtime]) {
        return BbPromise.reject(new SError('Unsupported runtime ' + this.evt.options.runtime, SError.errorCodes.UNKNOWN));
      }

      // Check is not reserved name
      if (['meta', '_meta', 'plugins'].indexOf(this.evt.options.name) != -1) {
        return BbPromise.reject(new SError('This component name is reserved: ' + this.evt.options.name, SError.errorCodes.UNKNOWN));
      }

      // If component exists in project, throw error
      if (this.S.getProject().validateComponentExists(this.evt.options.name, this.S._projectPath)) {
        return BbPromise.reject(new SError(
          'Component ' + this.evt.options.name + ' already exists',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };

    /**
     * Create component Skeleton
     */

    _createComponentSkeleton() {
      console.log(this.evt.options.name)
      let component  = new this.S.classes.Component(this.S, this.S.getProject(), {
        name: this.evt.options.name,
        runtime: this.evt.options.runtime
      });
      this.S.getProject().setComponent( component );
      this.evt.data.name = this.evt.options.name;
      return component.save();
    };

    /**
     * Install Component Dependencies
     */

    _installComponentDependencies(component) {
      return( component.getRuntime().installDepedencies( this.evt.options.name ) );
    }
  }

  return( ComponentCreate );
};