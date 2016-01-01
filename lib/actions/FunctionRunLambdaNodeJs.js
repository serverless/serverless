'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

module.exports = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SError      = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils      = require(path.join(serverlessPath, 'utils')),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise   = require('bluebird'),
    chalk       = require('chalk'),
    context     = require(path.join(serverlessPath, 'utils/context'));


  class FunctionRunLambdaNodeJs extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + FunctionRunLambdaNodeJs.name;
    }

    registerActions() {

      this.S.addAction(this.functionRunLambdaNodeJs.bind(this), {
        handler:       'functionRunLambdaNodeJs',
        description:   'Runs a service that features a lambda using the nodejs runtime.'
      });

      return BbPromise.resolve();
    }

    /**
     * Function Run Lambda NodeJs
     */

    functionRunLambdaNodeJs(options) {
      options = options || {};

      if (!options.function || !options.functionPath || !options.function.handler) {
        return BbPromise.reject(new SError('Function Json, functionPath and handler are required.'));
      }

      options.event = SUtils.readAndParseJsonSync(path.join(options.functionPath, 'event.json'));

      // Create result object on options
      options.result = { status: false };

      // Run Function
      return new BbPromise(function(resolve, reject) {

        SCli.log(`Running ${options.function.name}...`);

        try {

          // Load function file & handler
          let functionFile    = options.function.handler.split('/').pop().split('.')[0];
          let functionHandler = options.function.handler.split('/').pop().split('.')[1];
          functionFile        = path.join(options.functionPath, (functionFile + '.js'));
          functionHandler     = require(functionFile)[functionHandler];

          // Fire function
          functionHandler(options.event, context(options.function.name, function (err, result) {

            SCli.log(`-----------------`);

            // Show error
            if (err) {
              SCli.log(chalk.bold('Failed - This Error Was Returned:'));
              SCli.log(err.message);
              SCli.log(err.stack);
              options.result.status = 'error';
              options.result.response = err.message;
              return resolve(options);
            }

            // Show success response
            SCli.log(chalk.bold('Success! - This Response Was Returned:'));
            SCli.log(JSON.stringify(result));
            options.result.status   = 'success';
            options.result.response = result;
            return resolve(options);

          }));

        } catch(err) {

          SCli.log(`-----------------`);

          // Show error
          if (err) {
            SCli.log(chalk.bold('Failed - This Error Was Thrown:'));
            SCli.log(err);
            options.result.status   = 'error';
            options.result.response = err.message;
            return resolve(options);
          }
        }
      });
    }
  }

  return( FunctionRunLambdaNodeJs );
};
