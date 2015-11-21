'use strict';

/**
 * Action: FunctionRun
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      BbPromise  = require('bluebird'),
      JawsUtils  = require('../../utils'),
      path = require('path');

/**
 * FunctionRun Class
 */

class FunctionRun extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + FunctionRun.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.addAction(this.functionRun.bind(this), {
      handler:       'functionRun',
      description:   `Runs the service locally.  Reads the service’s runtime and passes it off to a runtime-specific runner`,
      context:       'function',
      contextAction: 'run',
      options:       [],
    });
    return BbPromise.resolve();
  }


  functionRun() {
    let _this = this;
    let cwd = process.cwd(),
        event = JawsUtils.readAndParseJsonSync(path.join(cwd, 'event.json')),
        awsmJson = JawsUtils.readAndParseJsonSync(path.join(cwd, 'lambda.awsm.json'));
    if (awsmJson.cloudFormation.lambda.Function.Properties.Runtime == 'nodejs') {
      let handlerParts = awsmJson.cloudFormation.lambda.Function.Properties.Handler.split('/').pop().split('.');
      
      // running the nodejs subaction
      let newEvent = {
        awsmJson: awsmJson,
        handler: require(cwd + '/' + handlerParts[0] + '.js')[handlerParts[1]],
        event: event
      };
      
      return _this.Jaws.actions.functionRunLambdaNodeJs(newEvent)
      //return _this.simulateNodeJs(awsmJson, require(cwd + '/' + handlerParts[0] + '.js')[handlerParts[1]], event);
    } else {
      return BbPromise.reject(new JawsError('To simulate you must have an index.js that exports run(event,context)', JawsError.errorCodes.UNKNOWN));
    }
      
  }

}

module.exports = FunctionRun;
