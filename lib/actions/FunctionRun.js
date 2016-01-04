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
      this.options = {};
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
            position: '0->1'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    functionRun(evt) {
      let _this    = this;
      _this.options = evt.options;

      _this.project = new _this.S.classes.Project(_this.S);


      if(!_this.options.path[0] || _this.options.path[0].split('/').length != 2) return BbPromise.reject(new SError('function path (moduleName/functionName) is required.'));

      let moduleName   = _this.options.path[0].split('/')[0];
      let functionName = _this.options.path[0].split('/')[1];

      if (!_this.project.data.modules[moduleName] || !_this.project.data.modules[moduleName].functions[functionName]) {
        return BbPromise.reject(new SError(`Could not find a function with the path: ${_this.options.path[0]}`));
      }

      // Runtime: nodejs
      if (_this.project.data.modules[moduleName].runtime === 'nodejs') {

        let newOptions = {
          options: {
            function: _this.project.data.modules[moduleName].functions[functionName],
            functionPath: path.join(_this.S.config.projectPath, 'back', 'modules', moduleName, 'functions', functionName)
          }
        };

        return BbPromise.resolve(_this.S.actions.functionRunLambdaNodeJs(newOptions));
      } else {
        return BbPromise.reject(new SError(`Only nodejs runtime is supported.`));
      }
    }
  }

  return( FunctionRun );
};
