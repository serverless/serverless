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

    functionRunLambdaNodeJs(evt) {
      let _this    = this;
      _this.options = evt.options;

      if (!_this.options.function || !_this.options.functionPath || !_this.options.function.handler) {
        return BbPromise.reject(new SError('Function Json, functionPath and handler are required.'));
      }

      // Create result object on options
      let finalResult = { status: false };

      // Run Function
      return new BbPromise(function(resolve, reject) {

        SCli.log(`Running ${_this.options.function.name}...`);

        try {

          // Load function file & handler
          let functionFile    = _this.options.function.handler.split('/').pop().split('.')[0];
          let functionHandler = _this.options.function.handler.split('/').pop().split('.')[1];
          functionFile        = path.join(_this.options.functionPath, (functionFile + '.js'));
          functionHandler     = require(functionFile)[functionHandler];

          // Fire function
          let functionEvent = SUtils.readAndParseJsonSync(path.join(_this.options.functionPath, 'event.json'));
          functionHandler(functionEvent, context(_this.options.function.name, function (err, result) {

            SCli.log(`-----------------`);

            // Show error
            if (err) {
              SCli.log(chalk.bold('Failed - This Error Was Returned:'));
              SCli.log(err.message);
              SCli.log(err.stack);
              finalResult.status = 'error';
              finalResult.response = err.message;
              return {
                options: _this.options,
                data: {
                  result: finalResult
                }
              };
            }

            // Show success response
            SCli.log(chalk.bold('Success! - This Response Was Returned:'));
            SCli.log(JSON.stringify(result));
            finalResult.status   = 'success';
            finalResult.response = result;
            return {
              options: _this.options,
              data: {
                result: finalResult
              }
            };

          }));

        } catch(err) {

          SCli.log(`-----------------`);

          // Show error
          if (err) {
            SCli.log(chalk.bold('Failed - This Error Was Thrown:'));
            SCli.log(err);
            finalResult.status   = 'error';
            finalResult.response = err.message;
            return {
              options: _this.options,
              data: {
                result: finalResult
              }
            };
          }
        }
      });
    }
  }

  return( FunctionRunLambdaNodeJs );
};
