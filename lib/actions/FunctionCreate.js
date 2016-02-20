'use strict';

/**
 * Action: FunctionCreate
 * - takes existing component name and new function name
 * - validates that component exists
 * - validates that function does NOT already exists in component
 * - generates function structure based on runtime
 *
 * Event Options:
 * - sPath:      (String) The relative path of the function from project root
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    SError     = require(path.join(serverlessPath, 'Error')),
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
        options:       [],
        parameters: [
          {
            parameter: 'sPath',
            description: 'One path to your function relative to the project root',
            position: '0'
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

          SCli.log('Successfully created function: "'  + _this.evt.options.sPath + '"');

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

      let _this   = this,
        overrides = {};

      // If non-interactive or sPath exists, skip
      if (!_this.S.config.interactive || _this.evt.options.sPath) return BbPromise.resolve();

      // Get sPath
      _this.evt.options.sPath = _this.getSPathFromCwd(_this.S.getProject().getRootPath());

      // Validate
      if (!_this.evt.options.sPath) {
        return BbPromise.reject(new SError('You must be in a component to create a function'));
      }

      let prompts = {
        properties: {
          name: {
            description: 'Enter a new function name: '.yellow,
            message:     'Function name must contain only letters, numbers, hyphens, or underscores. It should not be longer than 20 characters.',
            required:    true,
            conform:     function(functionName) {
              return SUtils.isFunctionNameValid(functionName);
            }
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {
          _this.evt.options.sPath = _this.evt.options.sPath + '/' + answers.name;
        });
    };

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      let _this = this;

      // Validate: If interactive and no sPath, check they are in a component, and get sPath
      if (_this.S.config.interactive && !_this.evt.options.sPath) {
        _this.evt.options.sPath = _this.getSPathFromCwd(_this.S.getProject().getRootPath());
        if (!_this.evt.options.sPath) {
          return BbPromise.reject(new SError('You must be in a component to create a function'));
        }
      }

      // Validate: check sPath
      if (!_this.evt.options.sPath) {
        return BbPromise.reject(new SError('sPath is required.'));
      }

      // Validate: Don't allow function creation within a function
      if (_this.S.getProject().getFunction( _this.evt.options.sPath )) {
        return BbPromise.reject(new SError('You cannot create a function in another function'));
      }

      // If component does not exist in project, throw error
      _this.evt.options.component = _this.S.getProject().getComponent( _this.evt.options.sPath );
      if (!_this.evt.options.component) {
        return BbPromise.reject(new SError(
          'Component (' + _this.evt.options.sPath.split('/')[0] + ') does not exist in project',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      // If subfolders are missing, create them
      if (_this.evt.options.sPath.split('/').length > 1) {
        let dir = _this.evt.options.sPath.split(path.sep);
        dir.pop();
        let c   = dir.shift();
        if (dir[0] && !SUtils.dirExistsSync(_this.S.getProject().getFilePath(c, dir[0]))) {
          fs.mkdirSync(_this.S.getProject().getFilePath(c, dir[0]));
        }
        if (dir[1] && !SUtils.dirExistsSync(_this.S.getProject().getFilePath(c, dir[0], dir[1]))) {
          fs.mkdirSync(_this.S.getProject().getFilePath(c, dir[0], dir[1]));
        }
      }

      // If function already exists in component, throw error
      if (_this.S.getProject().getFunction( _this.evt.options.sPath )) {
        return BbPromise.reject(new SError(
          'Function ' + _this.evt.options.sPath + ' already exists in this component',
          SError.errorCodes.INVALID_PROJECT_SERVERLESS
        ));
      }

      return BbPromise.resolve();
    };

    /**
     * Create Function Skeleton
     */

    _createFunctionSkeleton() {
      let func = new this.S.classes.Function(this.S, this.evt.options.component, {
        sPath: this.evt.options.sPath
      });
      func.name = this.evt.options.sPath.split('/').pop();
      this.evt.options.component.setFunction( func );
      this.evt.data.sPath = this.evt.options.sPath;
      return func.save();
    };
  }

  return( FunctionCreate );
};
