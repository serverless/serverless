'use strict';

/**
 * JAWS Command: run
 */

const GlobalCmd = require('./GlobalCmd'),
    JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    utils = require('../utils'),
    path = require('path'),
    fs = require('fs'),
    context = require('../utils/context');

function simulateNodeJs(awsmJson, handler, event) {
  return new Promise(function(resolve, reject) {
    let lambdaName = utils.getLambdaName(awsmJson);

    utils.jawsDebug('Testing', lambdaName);
    handler(event, context(lambdaName, function(err, result) {
      if (err) {
        JawsCLI.log(err);
        return reject(err);
      }
      JawsCLI.log(JSON.stringify(result));
      resolve();
    }));
  });
}


var CMD = class RunLambda extends GlobalCmd {

  constructor() {
    super()

  }
}





/**
 *
 * @param {Jaws} JAWS
 */

module.exports.run = function() {
  let cwd = process.cwd(),
      event = utils.readAndParseJsonSync(path.join(cwd, 'event.json')),
      awsmJson = utils.readAndParseJsonSync(path.join(cwd, 'awsm.json'));

  if (awsmJson.lambda.cloudFormation.Runtime == 'nodejs') {
    let handlerParts = awsmJson.lambda.cloudFormation.Handler.split('/').pop().split('.');
    return simulateNodeJs(awsmJson, require(cwd + '/' + handlerParts[0] + '.js')[handlerParts[1]], event);
  } else {
    throw new JawsError('To simulate you must have an index.js that exports run(event,context', JawsError.errorCodes.UNKNOWN);
  }
};
