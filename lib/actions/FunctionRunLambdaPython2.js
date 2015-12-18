'use strict';

/**
 * Action: FunctionRunLambdaPython2
 */

module.exports = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SError      = require(path.join(serverlessPath, 'ServerlessError')),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise   = require('bluebird'),
    chalk       = require('chalk'),
    spawnSync       = require('child_process').spawnSync,
    context     = require(path.join(serverlessPath, 'utils/context'));


  class FunctionRunLambdaPython2 extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + FunctionRunLambdaPython2.name;
    }

    registerActions() {

      this.S.addAction(this.functionRunLambdaPython2.bind(this), {
        handler:       'functionRunLambdaPython2',
        description:   'Runs a service that features a lambda using the python2.7 runtime.'
      });

      return BbPromise.resolve();
    }

    /**
     * Function Run Lambda Python2
     */

    functionRunLambdaPython2(evt) {

      let _this = this;

      if (!evt.function || !evt.function.handler || !evt.function.event) {
        return BbPromise.reject(new SError('Function Json, handler and event are required.'));
      }

      // Create result object on evt
      evt.result = { status: false };

      // Run Function
      return new BbPromise(function(resolve, reject) {

        SCli.log(`Running ${evt.function.name}...`);

        try {

          // Load function file & handler
          let functionFile    = evt.function.handler.split('/').pop().split('.')[0];
          let functionHandler = evt.function.handler.split('/').pop().split('.')[1];
          functionFile        = path.join(_this.S._projectRootPath, evt.function.pathFunction, (functionFile + '.py'));
          //gotta proj/bin/serverless-run-python-handler.py --event JSON --handler-path functionfile --handler-function functionHandler

          var child = spawnSync(
            "serverless-run-python-handler.py",
            [
              '--event', JSON.stringify(evt.function.event),
              '--handler-path', functionFile,
              '--handler-function', functionHandler,
            ],
            {}
          );
          SCli.log(`-----------------`);
          var handler_result = JSON.parse(child.stdout);
          if (child.status === 0 && handler_result.success) {
            SCli.log(chalk.bold('Success! - This Response Was Returned:'));
            SCli.log(JSON.stringify(handler_result.result));
            evt.result.status   = 'success';
            evt.result.response = handler_result.result;
          } else {
            SCli.log(chalk.bold('Failed - This Error Was Returned:'));
            SCli.log(child.stdout);
            SCli.log(handler_result.exception);
            evt.result.status = 'error';
            evt.result.response = handler_result.exception;
          }
          return resolve(evt);
        } catch(err) {

          SCli.log(`-----------------`);

          // Show error
          if (err) {
            SCli.log(chalk.bold('Failed - This Error Was Thrown:'));
            SCli.log(err);
            evt.result.status   = 'error';
            evt.result.response = err.message;
            return resolve(evt);
          }
        }
      });
    }
  }

  return( FunctionRunLambdaPython2 );
};
