'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    JawsCLI    = require('../../utils/cli'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
    context = require('../../utils/context');


class FunctionRunLambdaNodeJs extends JawsPlugin {

  /**
   * Constructor
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'jaws.core.' + FunctionRunLambdaNodeJs.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.Jaws.addAction(this.functionRunLambdaNodeJs.bind(this), {
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
      return BbPromise.reject(new JawsError('function Json, handler and event are required.', JawsError.errorCodes.UNKNOWN));
    }
    return new BbPromise(function(resolve, reject) {
      let lambdaName = evt.awsmJson.name;

      JawsUtils.jawsDebug('Testing', lambdaName);
      evt.handler(evt.event, context(lambdaName, function(err, result) {
        if (err) {
          JawsCLI.log(err);
          return reject(err);
        }
        JawsCLI.log(JSON.stringify(result));
        resolve();
      }));
    });
  }
}

module.exports = FunctionRunLambdaNodeJs;
