'use strict';

/**
 * JAWS Command: logs
 * - Fetches logs for your lambdas
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    fs = require('fs');

Promise.promisifyAll(fs);

module.exports = function(JAWS) {

  JAWS.logs = function() {
    return new Promise(function(resolve, reject) {
      var jawsJsonPath = path.join(process.cwd(), 'jaws.json');

      if (!fs.existsSync(jawsJsonPath)) { // Check if cwd is a lambda function
        reject(new JawsError(
            'Could\'nt find a lambda function.  Are you sure you are in a lambda function\'s directory?',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      var jawsJson = require(jawsJsonPath);

      // Check if jaws.json has correct profile
      if (jawsJson.profile !== 'lambda') {
        reject(new JawsError(
            'This jaws-module is not a lambda function.  Make sure it\'s profile is set to lambda or lambdaGroup',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      resolve();
    });
  };
};
