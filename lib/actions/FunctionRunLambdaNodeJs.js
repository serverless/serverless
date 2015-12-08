'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

const SPlugin = require('../ServerlessPlugin'),
    SError    = require('../ServerlessError'),
    SUtils    = require('../utils/index'),
    SCli    = require('../utils/cli'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
    context = require('../utils/context');


class FunctionRunLambdaNodeJs extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'serverless.core.' + FunctionRunLambdaNodeJs.name;
  }

  /**
   * Register Plugin Actions
   */

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
    
    if (!evt.awsmJson || !evt.handler || !evt.event) {
      return BbPromise.reject(new SError('function Json, handler and event are required.', SError.errorCodes.UNKNOWN));
    }
    return new BbPromise(function(resolve, reject) {
      let lambdaName = evt.awsmJson.name;

      SUtils.sDebug('Testing', lambdaName);
      evt.handler(evt.event, context(lambdaName, function(err, result) {
        if (err) {
          SCli.log(err);
          return reject(err);
        }
        SCli.log(JSON.stringify(result));
        resolve();
      }));
    });
  }
}

module.exports = FunctionRunLambdaNodeJs;
