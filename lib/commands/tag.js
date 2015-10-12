'use strict';

//TODO: we are getting rid of some of these methods PER GH issue. Not refactoring to use Class yet

/**
 * JAWS Command: tag
 * - Tags a lambda function or api endpoint with "deploy:true"
 */

let ProjectCmd = require('./ProjectCmd.js'),
    JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    utils = require('../utils'),
    fs = require('fs');

Promise.promisifyAll(fs);

var CMD = class Tag extends ProjectCmd {
  constructor(JAWS, type) {
    super(JAWS);
    this._type = type;
  }

  /**
   * Tag a lambda or endpoint for deployment (set deploy = true)
   *
   * @param type endpoint|lambda
   * @param fullPathToAwsmJson optional. Uses cwd by default
   * @param {boolean} untag. default false
   * @returns {Promise} full path to awsm.json that was updated
   */
  static tag(type, fullPathToAwsmJson, untag) {
    untag = !!(untag);
    let awsmJsonPath = fullPathToAwsmJson ? fullPathToAwsmJson : path.join(process.cwd(), 'awsm.json');
    let awsmJson = require(awsmJsonPath);

    return new Promise(function(resolve, reject) {
      if (!utils.fileExistsSync(awsmJsonPath)) {
        reject(new JawsError(`Couldn't find a valid awsm.json. Sure you are in the correct directory?`));
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
  }

  /**
   * Tag or untag all
   *
   * @param {boolean} untag default false
   * @returns {Promise}
   */
  tagAll(untag) {
    let _this = this,
        findAllFunc = (this._type == 'lambda') ? 'findAllLambdas' : 'findAllEndpoints';

    return JAWS.validateProject()
        .then(function() {
          return utils[findAllFunc](path.join(_this._JAWS._meta.projectRootPath, 'aws_modules'));
        })
        .then(function(awsmJsonPaths) {
          let tagQueue = [];

          if (!awsmJsonPaths) {
            throw new JawsError('Could not find any lambdas', JawsError.errorCodes.UNKNOWN);
          }

          awsmJsonPaths.forEach(awsmJsonPath => {
            tagQueue.push(JawsEnv.tag(_this._type, awsmJsonPath, untag));
          });

          return Promise.all(tagQueue);
        });
  }

  /**
   * List all lambda|endpoints that are currently tagged
   *
   * @returns {Promise}
   */
  listAll() {
    let type = this._type,
        findAllFunc = (this._type == 'lambda') ? 'findAllLambdas' : 'findAllEndpoints';

    return this._JAWS.validateProject()
        .then(() => {
          return utils[findAllFunc](path.join(_this._JAWS._meta.projectRootPath, 'aws_modules'));
        })
        .then(function(lAwsmJsonPaths) {

          if (!lAwsmJsonPaths) {
            throw new JawsError(`Could not find any ${type}s`);
          }

          let fullPaths = [];
          let attr = (type == 'lambda') ? 'lambda' : 'apiGateway';
          lAwsmJsonPaths.forEach(ljp => {
            let awsmJson = require(ljp);
            if (awsmJson[attr] && awsmJson[attr].deploy == true) {
              fullPaths.push(ljp);
            }
          });

          return Promise.all(fullPaths);
        });
  }
};


/**************************************
 * EXPORTS
 **************************************/
module.exports = CMD;