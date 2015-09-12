'use strict';

/**
 * JAWS Command: tag
 * - Tags a lambda function or api endpoint with "deploy:true"
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    utils = require('../utils'),
    inquirer = require('bluebird-inquirer'),
    fs = require('fs');

Promise.promisifyAll(fs);

/**
 * Tag a lambda for deployment (set deploy = true)
 *
 * @param type endpoint|lambda
 * @param fullPathToJawsJson optional. Uses cwd by default
 * @param {boolean} untag. default false
 * @returns {Promise} full path to jaws.json that was updated
 */
module.exports.tag = function(type, fullPathToJawsJson, untag) {

  untag = !!(untag);
  var jawsJsonPath = fullPathToJawsJson ? fullPathToJawsJson : path.join(process.cwd(), 'jaws.json');

  return new Promise(function(resolve, reject) {
    if (!fs.existsSync(jawsJsonPath)) {
      reject(new JawsError(
          'Could\'nt find a valid jaws.json. Sure you are in the correct directory?',
          JawsError.errorCodes.UNKNOWN
      ));
    }

    var jawsJson = require(jawsJsonPath);
    if (type === 'lambda' && typeof jawsJson.lambda !== 'undefined') {
      jawsJson.lambda.deploy = !untag;
    } else if (type === 'endpoint' && typeof jawsJson.endpoint !== 'undefined') {
      jawsJson.endpoint.deploy = !untag;
    } else {
      reject(new JawsError(
          'This jaws-module is not a lambda function or endpoint resource',
          JawsError.errorCodes.UNKNOWN
      ));
    }

    fs.writeFileSync(jawsJsonPath, JSON.stringify(jawsJson, null, 2));
    resolve(jawsJsonPath);
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

  return utils[findAllFunc](JAWS._meta.projectRootPath)
      .then(function(jawsJsonPaths) {
        var tagQueue = [];
        if (!jawsJsonPaths) {
          throw new JawsError('Could not find any lambdas', JawsError.errorCodes.UNKNOWN);
        }

        jawsJsonPaths.forEach(function(jawsJsonPath) {
          tagQueue.push(_this.tag(type, jawsJsonPath, untag));
        });

        return Promise.all(tagQueue);
      });
};

/**
 * List all lambda|api that are currently tagged
 *
 * @param {Jaws} JAWS
 * @param type
 * @returns {Promise}
 */
module.exports.listAll = function(JAWS, type) {
  var cwd = process.cwd(),
      findAllFunc = (type == 'lambda') ? 'findAllLambdas' : 'findAllEndpoints';

  return utils[findAllFunc](JAWS._meta.projectRootPath)
      .then(function(lJawsJsonPaths) {
        if (!lJawsJsonPaths) {
          throw new JawsError('Could not find any ' + type + 's', JawsError.errorCodes.UNKNOWN);
        }

        var relPaths = [],
            attr = (type == 'lambda') ? 'lambda' : 'endpoint';

        lJawsJsonPaths.forEach(function(ljp) {
          var jawsJson = require(ljp);
          if (jawsJson[attr] && jawsJson[attr].deploy == true) {
            relPaths.push(path.relative(cwd, ljp));
          }
        });

        return Promise.all(relPaths);
      });
};

/**
 * Interactive select of items to tag
 *
 * @param {Jaws} JAWS
 * @param type
 * @param untag
 * @returns {*}
 */
module.exports.tagMulti = function(JAWS, type, untag) {
  var _this = this,
      findAllFunc = (type == 'lambda') ? 'findAllLambdas' : 'findAllEndpoints';

  return utils[findAllFunc](JAWS._meta.projectRootPath)
      .then(function(lJawsJsonPaths) {
        if (!lJawsJsonPaths) {
          throw new JawsError('Could not find any ' + type + 's', JawsError.errorCodes.UNKNOWN);
        }

        return inquirer.prompt([{
          type: 'checkbox',
          message: 'Select actions to tag',
          name: 'jawsPaths',
          choices: lJawsJsonPaths,
        },]);
      })
      .then(function(answers) {
        if (!answers || answers.jawsPaths.length == 0) {
          throw new JawsError('Must select at least one', JawsError.errorCodes.UNKNOWN);
        }

        var tagQueue = [];
        answers.jawsPaths.forEach(function(jp) {
          tagQueue.push(_this.tag(type, jp, untag));
        });

        return Promise.all(tagQueue);
      });
};
