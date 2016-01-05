'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

module.exports = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SError      = require(path.join(serverlessPath, 'ServerlessError')),
    BbPromise   = require('bluebird'),
    fs          = require('fs');

  BbPromise.promisifyAll(fs);

  /**
   * FunctionRun Class
   */

  class FunctionRun extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + FunctionRun.name;
    }

    registerActions() {
      this.S.addAction(this.functionRun.bind(this), {
        handler:       'functionRun',
        description:   `Runs the service locally.  Reads the service’s runtime and passes it off to a runtime-specific runner`,
        context:       'function',
        contextAction: 'run',
        options:       [
          {
            option:      'path',
            shortcut:    'p',
            description: 'Path of the function in this format: moduleName/functionName'
          }
        ],
        parameters: [
          {
            parameter: 'path',
            description: 'Path of the function you want to run (moduleName/functionName)',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    functionRun(evt) {

      let _this      = this;
      _this.evt      = evt;

      // Instantiate Classes
      _this.project  = new _this.S.classes.Project(_this.S);

      if(!_this.evt.options.path || _this.evt.options.path.split('/').length != 2) return BbPromise.reject(new SError('Invalid function path. moduleName/functionName is required.'));

      _this.module   = _this.evt.options.path.split('/')[0];
      _this.function = _this.evt.options.path.split('/')[1];

      // Flow
      return _this._runByRuntime()
      .then(function(evt) {

        /**
         * Return EVT
         */

        return evt;

      });
    }

    /**
     * Run By Runtime
     */

    _runByRuntime() {

      let _this = this;

      if (_this.project.data.modules[_this.module].runtime === 'nodejs') {

        // Runtime: nodejs

        let newOptions = {
          options: {
            path: _this.evt.options.path
          }
        };

        return _this.S.actions.functionRunLambdaNodeJs(newOptions);

      } else {

        return BbPromise.reject(new SError(`Only nodejs runtime is supported.`));

      }
    }
  }

  return( FunctionRun );
};