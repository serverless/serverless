'use strict';

/**
 * JAWS Command: tag
 * - Tags a lambda function with "deploy:true"
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    fs = require('fs');

Promise.promisifyAll(fs);

module.exports = function(JAWS) {

  JAWS.tag = function() {
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
      if (-1 === ['lambda', 'lambdaGroup'].indexOf(jawsJson.profile)) {
        reject(new JawsError(
            'This jaws-module is not a lambda function.  Make sure it\'s profile is set to lambda or lambdaGroup',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      // Handle profile type 'lambda'
      if (jawsJson.profile === 'lambda') {

        // Add deploy property
        if (!jawsJson.deploy) jawsJson.deploy = 1;

        fs.writeFileSync(path.join(process.cwd(), 'jaws.json', JSON.stringify(jawsJson, null, 2)));
      }

      // Handle profile type 'lambdaGroup'
      if (jawsJson.profile === 'lambdaGroup') {
        //TODO: implement
      }

      console.log('Lambda successfully tagged for deployment');

      resolve();
    });
  };
};
