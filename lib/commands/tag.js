'use strict';

/**
 * JAWS Command: tag
 * - Tags a lambda function with "deploy:true"
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    utils = require('../utils'),
    fs = require('fs');

Promise.promisifyAll(fs);

module.exports = function(JAWS) {

  /**
   * Tag a lambda for deployment (set deploy = true)
   *
   * @prams type api|lambda
   * @param fullPathToJawsJson optional. Uses cwd by default
   * @param {boolean} untag. default false
   * @returns {Promise} full path to jaws.json that was updated
   */
  JAWS.tag = function(type, fullPathToJawsJson, untag) {
    untag = !!(untag);

    var jawsJsonPath = fullPathToJawsJson || path.join(process.cwd(), 'jaws.json');

    return new Promise(function(resolve, reject) {
      if (!fs.existsSync(jawsJsonPath)) {
        reject(new JawsError(
            'Could\'nt find a valid jaws.json. Sure you are in the correct directory?',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      var jawsJson = require(jawsJsonPath);
      if (typeof jawsJson.lambda !== 'undefined') {
        jawsJson.lambda.deploy = !untag;
        fs.writeFileSync(jawsJsonPath, JSON.stringify(jawsJson, null, 2));
        resolve(jawsJsonPath);
      } else if (typeof jawsJson.endpoint !== 'undefined') {
        jawsJson.endpoint.deploy = !untag;
        fs.writeFileSync(jawsJsonPath, JSON.stringify(jawsJson, null, 2));
        resolve(jawsJsonPath);
      } else {
        reject(new JawsError(
            'This jaws-module is not a lambda function or endpoint resource',
            JawsError.errorCodes.UNKNOWN
        ));
      }
    });
  };

  /**
   * Tag or untag all
   *
   * @prams type api|lambda
   * @param {boolean} untag default false
   * @returns {Promise}
   */
  JAWS.tagAll = function(type, untag) {
    var _this = this;
    return utils.findAllLambdas(utils.findProjectRootPath(process.cwd()))
        .then(function(lJawsJsonPaths) {
          var tagQueue = [];
          if (!lJawsJsonPaths) {
            throw new JawsError('Could not find any lambdas');
          }

          lJawsJsonPaths.forEach(function(ljp) {
            tagQueue.push(_this.tag(type, ljp, untag));
          });

          return Promise.all(tagQueue);
        });
  };
};
