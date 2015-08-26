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

  /**
   * Tag a lambda for deployment (set deploy = true)
   *
   * @param fullPathToJawsJson optional. Uses cwd by default
   * @param {boolean} untag. default false
   * @returns {Promise} full path to jaws.json that was updated
   */
  JAWS.tag = function(fullPathToJawsJson, untag) {
    untag = (untag) ? true : false;

    var jawsJsonPath = fullPathToJawsJson || path.join(process.cwd(), 'jaws.json');

    return new Promise(function(resolve, reject) {
      if (!fs.existsSync(jawsJsonPath)) { // Check if cwd is a lambda function
        reject(new JawsError(
            'Could\'nt find a lambda function.  Are you sure you are in a lambda function\'s directory?',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      var jawsJson = require(jawsJsonPath);
      if (typeof jawsJson.lambda !== 'undefined') {
        jawsJson.lambda.deploy = !untag;
        fs.writeFileSync(jawsJsonPath, JSON.stringify(jawsJson, null, 2));
        resolve(jawsJsonPath);
      } else {
        reject(new JawsError(
            'This jaws-module is not a lambda function.  Make sure it has a lambda attribute',
            JawsError.errorCodes.UNKNOWN
        ));
      }
    });
  };
};
