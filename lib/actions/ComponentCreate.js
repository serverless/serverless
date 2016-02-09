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
            option:      'runtime',
            shortcut:    'r',
            description: 'Runtime of your new component. Default: nodejs'
          }
        ],
        parameters: [
          {
            parameter: 'sPath',
            description: 'One path to your component relative to the project root',
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

          SCli.log('Successfully created new serverless component: ' + _this.evt.options.sPath);

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

      if (!_this.S.config.interactive || _this.evt.options.sPath) return BbPromise.resolve();

      ['sPath'].forEach(memberVarKey => {
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
          _this.evt.options.sPath = answers.sPath;
        });
    };

    /**
     * Validate and prepare data before creating component
     */

    _validateAndPrepare() {

      // non interactive validation
      if (!this.S.config.interactive) {
        if (!this.evt.options.sPath) {
          return BbPromise.reject(new SError('Component name is required.'));
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
      if (['meta', '_meta', 'plugins'].indexOf(this.evt.options.sPath) != -1) {
        return BbPromise.reject(new SError('This component name is reserved: ' + this.evt.options.sPath, SError.errorCodes.UNKNOWN));
      }

      // If component exists in project, throw error
      if (SUtils.doesComponentExist(this.evt.options.sPath, this.S.getProject().getRootPath())) {
        return BbPromise.reject(new SError(
          'Component ' + this.evt.options.sPath + ' already exists',
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
        sPath: this.evt.options.sPath,
        runtime: this.evt.options.runtime
      });
      this.S.state.setAsset(component);
      this.evt.data.sPath = component._config.sPath;
      return component.save();
    };

    /**
     * Install Component Dependencies
     */

    _installComponentDependencies() {
      let _this = this;
      if (_this.evt.options.runtime === 'nodejs') {
        SCli.log('Installing "serverless-helpers" for this component via NPM...');
        SCli.log(`-----------------`);
        SUtils.npmInstall(this.S.getProject().getFilePath(this.evt.options.sPath));
        SCli.log(`-----------------`);
      } else if (_this.evt.options.runtime === 'python2.7') {
        SCli.log("Installing default python dependencies with pip...");
        SCli.log(`-----------------`);
        SUtils.pipPrefixInstall(
          path.join(this.S.getProject().getFilePath(this.evt.options.sPath, 'requirements.txt'),
          path.join(this.S.getProject().getFilePath(this.evt.options.sPath, 'vendored')
        );
        SCli.log(`-----------------`);
      }
      return BbPromise.resolve();
    }
  }

  return( ComponentCreate );
};