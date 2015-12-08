'use strict';

/**
 * Action: FunctionRun
 * - Runs the function in the CWD for local testing
 */

const SPlugin   = require('../ServerlessPlugin'),
    SError      = require('../ServerlessError'),
    SUtils      = require('../utils'),
    BbPromise   = require('bluebird'),
    path        = require('path'),
    fs          = require('fs');

BbPromise.promisifyAll(fs);

/**
 * FunctionRun Class
 */

class FunctionRun extends SPlugin {

  constructor(S, config) {
    super(S, config);
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
      options:       [],
    });
    return BbPromise.resolve();
  }

  /**
   * Action
   */

  functionRun() {

    let _this = this,
        cwd = process.cwd(),
        event = SUtils.readAndParseJsonSync(path.join(cwd, 'event.json'));

    return _this.selectFunctions(cwd, 'Select a function to run: ', false, true)
        .then(function(selected) {

          let targetFunction = selected[0];

          // Look for a property named after the function in the event object
          if (event[targetFunction.name]) event = event[targetFunction.name];

          // Run by runtime
          if (targetFunction.runtime === 'nodejs') {

            let handlerParts = targetFunction.handler.split('/').pop().split('.');

            // Fire NodeJs subaction
            let newEvent = {
              function: targetFunction,
              handler: require(cwd + '/' + handlerParts[0] + '.js')[handlerParts[1]],
              event: event
            };

            return _this.S.actions.functionRunLambdaNodeJs(newEvent)
                .then(function(evt) {
                  return evt;
                });
          }
        });
  }
}

module.exports = FunctionRun;
