'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

module.exports = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SUtils      = require( path.join( serverlessPath, 'utils' ) ),
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
      _this.project  = _this.S.state.project.get();

      if(!_this.evt.options.path) return BbPromise.reject(new SError('Missing required function path param. Add a function path in this format: component/module/function   '));

      _this.function = _this.S.state.getFunctions({ paths: [_this.evt.options.path] })[0];

      // Missing function
      if (!_this.function) return BbPromise.reject(new SError('Function could not be found at the path you specified'));

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

      if (_this.project.components[_this.function._config.component].runtime === 'nodejs') {

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