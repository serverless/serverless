'use strict';

/**
 * JAWS Command: generate
 *
 * Can not safely be run with concurrency because of global skeletonData for simplicity
 */

// Defaults
var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    utils = require('../utils'),
    inquirer = require('bluebird-inquirer'),
    extend = require('util')._extend; //OK per Isaacs and http://stackoverflow.com/a/22286375/563420;

Promise.promisifyAll(fs);

var skeletonData = {
  lambdaRuntime: '',
  resourceName: '',
  functionName: '',
  backDir: '',
  lambdaJawsJsonPath: '',
  isLambda: false,
  isApi: false,
  handlerPath: false,
};

/**
 * Get Answers from CLI
 *
 * @returns {Promise}
 * @private
 */
function _getAnswers(resourceName, functionName, isLambda, isApi, lambdaRuntime) {
  var prompts = [],
      overrideAnswers = {};

  //TODO: dont hard code when we need to support more than nodejs
  overrideAnswers.lambdaRuntime = 'nodejs';

  if (typeof isLambda === 'undefined') {
    prompts.push({
      type: 'confirm',
      name: 'isLambda',
      message: 'Create lambda function:',
      default: true,
    });
  } else {
    overrideAnswers.isLambda = isLambda;
  }

  if (typeof isApi === 'undefined') {
    prompts.push({
      type: 'confirm',
      name: 'isApi',
      message: 'Create api gateway config:',
      default: true,
    });
  } else {
    overrideAnswers.isApi = isApi;
  }

  if (!resourceName) {
    prompts.push({
      type: 'input',
      name: 'resourceName',
      message: 'What is the name of the resource this action is for (lambda folder will be put in this dir):',
      default: 'users',
    });
  } else {
    overrideAnswers.resourceName = resourceName;
  }

  if (!functionName) {
    prompts.push({
      type: 'input',
      name: 'functionName',
      message: 'What is the name of the action (if lambda, this will be the function name)',
      default: 'create',
    });
  } else {
    overrideAnswers.functionName = functionName;
  }

  if (prompts.length > 0) {
    return inquirer.prompt(prompts)
        .then(function(answers) {
          return extend(answers, overrideAnswers);
        });
  } else {
    return Promise.resolve(overrideAnswers);
  }
}

/**
 * Prepare skeleton data
 *
 * @param answers
 * @returns {Promise}
 * @private
 */
function _prepareData(answers) {
  utils.logIfVerbose('Answers:');
  utils.logIfVerbose(answers);

  skeletonData.resourceName = answers.resourceName.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

  skeletonData.functionName = answers.functionName.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

  // AWS only allows Alphanumeric and - in name
  if (!/^([a-zA-Z0-9-]+)$/.exec(skeletonData.functionName) || !/^([a-zA-Z0-9-]+)$/.exec(skeletonData.resourceName)) {
    Promise.reject(new JawsError(
        'AWS only allows names to contain alphanumeric and -',
        JawsError.errorCodes.INVALID_RESOURCE_NAME));
  }

  skeletonData.lambdaRuntime = answers.lambdaRuntime;
  skeletonData.isApi = answers.isApi;
  skeletonData.isLambda = answers.isLambda;
  var projRoot = utils.findProjectRootPath(process.cwd());

  return utils.getAllLambdaNames(projRoot)
      .then(function(lambdaNames) {
        if (skeletonData.isLambda) {
          if (lambdaNames.indexOf(skeletonData.functionName) !== -1) {
            throw new JawsError(
                'You already have a lambda named ' + skeletonData.functionName,
                JawsError.errorCodes.INVALID_RESOURCE_NAME);
          }
        }

        skeletonData.backDir = path.join(projRoot, 'back');
        skeletonData.lambdaJawsJsonPath = path.join(
            skeletonData.backDir,
            'lambdas',
            skeletonData.resourceName,
            skeletonData.functionName,
            'jaws.json'
        );
      });
}

/**
 * Create skeleton
 *
 * @private
 */
function _createSkeleton() {
  var templatesDir = path.join(__dirname, '..', 'templates'),
      jawsJson = JSON.parse(fs.readFileSync(path.join(templatesDir, 'jaws.json'))),
      writeFilesDeferred = [];

  if (!skeletonData.isApi) {
    delete jawsJson.endpoint;
  }

  if (!skeletonData.isLambda) {
    delete jawsJson.lambda;
  } else {
    var handlerPathBaseDir = path.join('lambdas', skeletonData.resourceName, skeletonData.functionName);

    jawsJson.lambda.functionName = skeletonData.functionName;
    jawsJson.lambda.runtime = skeletonData.lambdaRuntime;

    switch (skeletonData.lambdaRuntime) {
      case 'nodejs':
        var nodeJsTemplateDir = path.join(templatesDir, 'nodejs'),
            handlerJs = fs.readFileSync(path.join(nodeJsTemplateDir, 'handler.js')),
            packageJson = JSON.parse(fs.readFileSync(path.join(nodeJsTemplateDir, 'package.json'))),
            targetPackageJsonPath = path.join(skeletonData.backDir, 'package.json'),
            fullLambdaDir = path.join(skeletonData.backDir, handlerPathBaseDir);

        jawsJson.lambda.handler = path.join(handlerPathBaseDir, 'index.handler');
        jawsJson.lambda.runtimeVer = '0.10.36';

        utils.logIfVerbose('creating ' + path.join(fullLambdaDir, 'index.js'));
        utils.logIfVerbose('creating ' + path.join(fullLambdaDir, 'event.json'));

        writeFilesDeferred.push(
            utils.writeFile(path.join(fullLambdaDir, 'index.js'), handlerJs),
            utils.writeFile(path.join(fullLambdaDir, 'event.json'), '{}')
        );

        if (!fs.existsSync(targetPackageJsonPath)) {  //Don't make package json if one already exists
          utils.logIfVerbose('creating package.json as it does not exist');
          writeFilesDeferred.push(
              utils.writeFile(targetPackageJsonPath, packageJson)
          );
        }

        break;
      default:
        return Promise.reject(new JawsError(
            'Unsupported runtime ' + skeletonData.lambdaRuntime,
            JawsError.errorCodes.UNKNOWN));
        break;
    }
  }

  writeFilesDeferred.push(utils.writeFile(skeletonData.lambdaJawsJsonPath, JSON.stringify(jawsJson, null, 2)));

  return Promise.all(writeFilesDeferred);
}

module.exports = function(JAWS) {

  JAWS.generate = function(isLambda, isApi, functionName, resourceName, lambdaRuntime) {
    return _getAnswers(resourceName, functionName, isLambda, isApi, lambdaRuntime)
        .then(_prepareData)
        .then(_createSkeleton);
  };
};
