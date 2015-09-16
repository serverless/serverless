'use strict';

/**
 * JAWS Command: tag
 * - Tags a lambda function or api endpoint with "deploy:true"
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    utils = require('../utils'),
    fs = require('fs');

Promise.promisifyAll(fs);

/**
 * Tag a lambda or endpoint for deployment (set deploy = true)
 *
 * @param type endpoint|lambda
 * @param fullPathToAwsmJson optional. Uses cwd by default
 * @param {boolean} untag. default false
 * @returns {Promise} full path to awsm.json that was updated
 */

module.exports.tag = function(type, fullPathToAwsmJson, untag) {
  untag = !!(untag);
  var awsmJsonPath = fullPathToAwsmJson ? fullPathToAwsmJson : path.join(process.cwd(), 'awsm.json');
  var awsmJson = require(awsmJsonPath);

  return new Promise(function(resolve, reject) {
    if (!fs.existsSync(awsmJsonPath)) {
      reject(new JawsError('Could\'nt find a valid awsm.json. Sure you are in the correct directory?'));
    }

    if (type === 'lambda' && typeof awsmJson.lambda !== 'undefined') {
      awsmJson.lambda.deploy = !untag;
    } else if (type === 'endpoint' && typeof awsmJson.apiGateway !== 'undefined') {
      awsmJson.apiGateway.deploy = !untag;
    } else {
      reject(new JawsError('This aws-module is not a lambda function or api gateway resource'));
    }

    fs.writeFileSync(awsmJsonPath, JSON.stringify(awsmJson, null, 2));
    resolve(awsmJsonPath);
  });
};

/**
 * Tag or untag all
 *
 * @param {Jaws} JAWS
 * @prams type endpoint|lambda
 * @param {boolean} untag default false
 * @returns {Promise}
 */
module.exports.tagAll = function(JAWS, type, untag) {

  var _this = this,
      findAllFunc = (type == 'lambda') ? 'findAllLambdas' : 'findAllEndpoints';

  return JAWS.validateProject()
      .then(function() {
        return utils[findAllFunc](JAWS._meta.projectRootPath);
      })
      .then(function(awsmJsonPaths) {
        var tagQueue = [];

        if (!awsmJsonPaths) {
          throw new JawsError('Could not find any lambdas', JawsError.errorCodes.UNKNOWN);
        }

        awsmJsonPaths.forEach(function(awsmJsonPath) {
          tagQueue.push(_this.tag(type, awsmJsonPath, untag));
        });

        return Promise.all(tagQueue);
      });
};

/**
 * List all lambda|endpoints that are currently tagged
 *
 * @param {Jaws} JAWS
 * @param type
 * @returns {Promise}
 */
module.exports.listAll = function(JAWS, type) {
  var findAllFunc = (type == 'lambda') ? 'findAllLambdas' : 'findAllEndpoints';

  return JAWS.validateProject()
      .then(function() {
        return utils[findAllFunc](JAWS._meta.projectRootPath);
      })
      .then(function(lAwsmJsonPaths) {

        if (!lAwsmJsonPaths) {
          throw new JawsError('Could not find any ' + type + 's');
        }

        var fullPaths = [];
        var attr = (type == 'lambda') ? 'lambda' : 'apiGateway';

        lAwsmJsonPaths.forEach(function(ljp) {
          var awsmJson = require(ljp);
          if (awsmJson[attr] && awsmJson[attr].deploy == true) {
            fullPaths.push(ljp);
          }
        });

        return Promise.all(fullPaths);
      });
};