'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

const SPlugin   = require('../ServerlessPlugin'),
    SError      = require('../ServerlessError'),
    SUtils      = require('../utils/index'),
    SCli        = require('../utils/cli'),
    BbPromise   = require('bluebird'),
    path        = require('path'),
    chalk       = require('chalk'),
    context     = require('../utils/context');


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
    
    if (!evt.function || !evt.handler || !evt.event) {
      return BbPromise.reject(new SError('Function Json, handler and event are required.'));
    }

    // Create result object on evt
    evt.result = { status: false };

    // Run Function
    return new BbPromise(function(resolve, reject) {

      SCli.log(`Running ${evt.function.name}...`);

      try {

        evt.handler(evt.event, context(evt.function.name, function (err, result) {

          SCli.log(`-----------------`);

          // Show error
          if (err) {
            SCli.log(chalk.bold('Failed - This Error Was Returned:'));
            SCli.log(err);
            evt.result.status = 'error';
            evt.result.response = err.message;
            return resolve(evt);
          }

          // Show success response
          SCli.log(chalk.bold('Success! - This Response Was Returned:'));
          SCli.log(JSON.stringify(result));
          evt.result.status   = 'success';
          evt.result.response = result;
          return resolve(evt);

        }));

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

module.exports = FunctionRunLambdaNodeJs;
