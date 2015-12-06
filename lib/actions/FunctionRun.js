'use strict';

/**
 * Action: FunctionRun
 */

const SPlugin = require('../ServerlessPlugin'),
      SError  = require('../ServerlessError'),
      BbPromise  = require('bluebird'),
      SUtils  = require('../utils'),
      path = require('path');

let fs = require('fs');
BbPromise.promisifyAll(fs);

/**
 * FunctionRun Class
 */

class FunctionRun extends SPlugin {

  /**
   * Constructor
   */

  constructor(S, config) {
    super(S, config);
  }

  /**
   * Define your plugins name
   */

  static getName() {
    return 'serverless.core.' + FunctionRun.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.S.addAction(this.functionRun.bind(this), {
      handler:       'functionRun',
      description:   `Runs the service locally.  Reads the service’s runtime and passes it off to a runtime-specific runner`,
      context:       'function',
      contextAction: 'run',
      options:       [],
    });
    return BbPromise.resolve();
  }

  
  /**
   * Action
   */
  functionRun() {
    let cwd = process.cwd(),
        event = SUtils.readAndParseJsonSync(path.join(cwd, 'event.json')),
        awsmJson = SUtils.readAndParseJsonSync(path.join(cwd, 's-function.json'));

    if (awsmJson.cloudFormation.lambda.Function.Properties.Runtime == 'nodejs') {
      
      // copy .env file into function dir
      fs.createReadStream('../../../.env').pipe(fs.createWriteStream('.env'));

      let handlerParts = awsmJson.cloudFormation.lambda.Function.Properties.Handler.split('/').pop().split('.');
      
      // running the nodejs subaction
      let newEvent = {
        awsmJson: awsmJson,
        handler: require(cwd + '/' + handlerParts[0] + '.js')[handlerParts[1]],
        event: event
      };
      
      return this.S.actions.functionRunLambdaNodeJs(newEvent)
                .then(function() {
                  // remove the .env file
                  fs.unlinkSync('.env');
                });
    } else {
      return BbPromise.reject(new SError('To simulate you must have an index.js that exports run(event,context)', SError.errorCodes.UNKNOWN));
    }    
  }
}

module.exports = FunctionRun;
