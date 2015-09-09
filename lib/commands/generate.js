'use strict';

/**
 * JAWS Command: generate
 *
 * Can not safely be run with concurrency because of global _this for simplicity
 */

// Defaults
var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    utils = require('../utils'),
    inquirer = require('bluebird-inquirer'),
    wrench = require('wrench');

Promise.promisifyAll(fs);

/**
 *
 * @param JAWS
 * @param lambdaRuntime
 * @param resourceName
 * @param functionName
 * @param isLambda
 * @param isApi
 * @param handlerPath
 * @constructor
 */
function CMD(JAWS, lambdaRuntime, resourceName, functionName, isLambda, isApi) {
  this.JAWS = JAWS;
  this.lambdaRuntime = lambdaRuntime || 'nodejs';
  this.resourceName = resourceName || '';
  this.functionName = functionName || '';
  this.backDir = path.join(JAWS._meta.projectRootPath, 'back');
  this.lambdaJawsJsonPath = '';
  this.isLambda = (typeof isLambda === 'undefined') ? undefined : isLambda;
  this.isApi = (typeof isApi === 'undefined') ? undefined : isApi;
}

CMD.prototype.constructor = CMD;

/**
 * Get Answers from CLI
 *
 * @returns {Promise}
 * @private
 */
CMD.prototype._getAnswers = Promise.method(function() {
  var _this = this,
      prompts = [];

  if (typeof _this.isLambda === 'undefined') {
    prompts.push({
      type: 'confirm',
      name: 'isLambda',
      message: 'Create a new lambda function:',
      default: true,
    });
  }

  if (typeof _this.isApi === 'undefined') {
    prompts.push({
      type: 'confirm',
      name: 'isApi',
      message: 'Create a new api gateway endpoint:',
      default: true,
    });
  }
  if (!_this.resourceName) {
    prompts.push({
      type: 'input',
      name: 'resourceName',
      message: 'Name the resource this is for (e.g., users, images, data):',
      default: 'users',
    });
  }

  if (!_this.functionName) {
    prompts.push({
      type: 'input',
      name: 'functionName',
      message: 'Name the action for this resource (create, update, delete):',
      default: 'create',
    });
  }

  if (prompts.length > 0) {
    return inquirer.prompt(prompts)
        .then(function(answers) {
          utils.logIfVerbose('Answers:');
          utils.logIfVerbose(answers);
          Object.keys(answers).forEach(function(key) {
            _this[key] = answers[key];
          });
          return true;
        });
  } else {
    return true;
  }
});

/**
 * Prepare skeleton data
 *
 * @param answers
 * @returns {Promise}
 * @private
 */
CMD.prototype._prepareData = Promise.method(function() {
  var _this = this;

  _this.resourceName = _this.resourceName.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

  _this.functionName = _this.functionName.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

  // AWS only allows Alphanumeric and - in name
  if (!/^([a-zA-Z0-9-]+)$/.exec(_this.functionName) || !/^([a-zA-Z0-9-]+)$/.exec(_this.resourceName)) {
    Promise.reject(new JawsError(
        'AWS only allows names to contain alphanumeric and -',
        JawsError.errorCodes.INVALID_RESOURCE_NAME));
  }

  return utils.getAllLambdaNames(_this.JAWS._meta.projectRootPath)
      .then(function(lambdaNames) {
        if (_this.isLambda) {
          if (lambdaNames.indexOf(_this.functionName) !== -1) {
            throw new JawsError(
                'You already have a lambda named ' + _this.functionName,
                JawsError.errorCodes.INVALID_RESOURCE_NAME);
          }
        }

        _this.backDir = path.join(_this.JAWS._meta.projectRootPath, 'back');
        _this.lambdaJawsJsonPath = path.join(
            _this.backDir,
            'lambdas',
            _this.resourceName,
            _this.functionName,
            'jaws.json'
        );
      });
});

/**
 * Create skeleton
 *
 * @private
 */
CMD.prototype._createSkeleton = Promise.method(function() {
  var _this = this,
      templatesDir = path.join(__dirname, '..', 'templates'),
      jawsJson = JSON.parse(fs.readFileSync(path.join(templatesDir, 'jaws.json'))),
      writeFilesDeferred = [];

  if (!_this.isApi) {
    delete jawsJson.endpoint;
  }

  if (!_this.isLambda) {
    delete jawsJson.lambda;
  } else {
    var handlerPathBaseDir = path.join('lambdas', _this.resourceName, _this.functionName);

    jawsJson.lambda.functionName = _this.functionName;
    jawsJson.lambda.runtime = _this.lambdaRuntime;

    switch (_this.lambdaRuntime) {
      case 'nodejs':
        var nodeJsTemplateDir = path.join(templatesDir, 'nodejs'),
            handlerJs = fs.readFileSync(path.join(nodeJsTemplateDir, 'handler.js')),
            packageJson = JSON.parse(fs.readFileSync(path.join(nodeJsTemplateDir, 'package.json'))),
            targetPackageJsonPath = path.join(_this.backDir, 'package.json'),
            fullLambdaDir = path.join(_this.backDir, handlerPathBaseDir);

        jawsJson.lambda.handler = path.join(handlerPathBaseDir, 'index.handler');
        jawsJson.lambda.runtimeVer = '0.10.36';

        utils.logIfVerbose('creating ' + path.join(fullLambdaDir, 'index.js'));
        utils.logIfVerbose('creating ' + path.join(fullLambdaDir, 'event.json'));

        writeFilesDeferred.push(
            utils.writeFile(path.join(fullLambdaDir, 'index.js'), handlerJs),
            utils.writeFile(path.join(fullLambdaDir, 'event.json'), '{}')
        );

        // Make package.json, if it doesn't exist already
        if (!fs.existsSync(targetPackageJsonPath)) {
          utils.logIfVerbose('creating package.json since it does not exist');
          writeFilesDeferred.push(
              utils.writeFile(targetPackageJsonPath, JSON.stringify(packageJson, null, 2))
          );
        }

        //Copy over dotenv if it doesn't already exist
        var backNodeModulesDir = path.join(_this.backDir, 'node_modules'),
            targetDotenv = path.join(backNodeModulesDir, 'dotenv');
        if (!fs.existsSync(targetDotenv)) {
          if (!fs.existsSync(backNodeModulesDir)) {
            fs.mkdirSync(backNodeModulesDir);
          }
          wrench.copyDirSyncRecursive(path.resolve(__dirname, '..', '..', 'node_modules', 'dotenv'), path.join(backNodeModulesDir, 'dotenv'));
        }
        break;
      default:
        throw new JawsError(
            'Unsupported runtime ' + _this.lambdaRuntime,
            JawsError.errorCodes.UNKNOWN);
        break;
    }
  }

  writeFilesDeferred.push(utils.writeFile(_this.lambdaJawsJsonPath, JSON.stringify(jawsJson, null, 2)));

  return Promise.all(writeFilesDeferred);
});

/**
 * Run
 */
CMD.prototype.run = Promise.method(function() {
  var _this = this;

  return _this._getAnswers()
      .bind(_this)
      .then(_this._prepareData)
      .then(_this._createSkeleton)
      .then(function() {
        console.log('Successfully created new folders and files in your "back/lambdas" folder.');
      });
});

module.exports.run = function(JAWS, isLambda, isApi, functionName, resourceName, lambdaRuntime) {
  var command = new CMD(JAWS, lambdaRuntime, resourceName, functionName, isLambda, isApi);
  return command.run();
};
