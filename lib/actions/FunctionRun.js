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
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    functionRun(options) {
      options = options || {};

      let _this   = this,
          Project = new this.S.classes.Project(this.S);


      // If CLI, parse arguments
      if (this.S.cli && (!options || !options.subaction)) {
        options.path = this.S.cli.params[0];
        if (this.S.cli.options.nonInteractive) this.S.config.interactive = false;
      }

      if(!options.path) return BbPromise.reject(new SError('function path (moduleName/functionName) is required.'));

      options.module   = options.path.split('/')[0];
      options.function = options.path.split('/')[1];

      if (!Project.data.modules[options.module] || !Project.data.modules[options.module].functions[options.function]) {
        return BbPromise.reject(new SError(`Could not find a function with the path: ${options.path}`));
      }


      if (Project.data.modules[options.module].runtime === 'nodejs') {

        let newOptions = {
          function: Project.data.modules[options.module].functions[options.function],
          functionPath: path.join(_this.S.config.projectPath, 'back', 'modules', options.module, 'functions', options.function)
        };

        return _this.S.actions.functionRunLambdaNodeJs(newOptions)
      } else {
        return BbPromise.reject(new SError(`Only nodejs runtime is supported.`));
      }
    }
  }

  return( FunctionRun );
};
