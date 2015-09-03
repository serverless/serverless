'use strict';

/**
 * JAWS Command: new
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 */

// Defaults
var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    async = require('async'),
    utils = require('.../utils'),
    inquirer = require('bluebird-inquirer'),
    extend = require('util')._extend; //OK per Isaacs and http://stackoverflow.com/a/22286375/563420;

Promise.promisifyAll(fs);

var skeletonData = {
  resourceName: "",
  functionName: "",
  backDir: "",
  lambdaJawsJsonPath: "",
  isLambda: false,
  isApi: false,
  handlerPath: false
};

/**
 * Get Answers
 *
 * @returns {Promise}
 * @private
 */
function _getAnswers(resourceName, functionName, isLambda, isApi) {
  // Define CLI prompts
  var prompts = [],
      overrideAnswers = {};

  if (!isLambda && !isApi) {

  } else {
    overrideAnswers.isLambda = isLambda;
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
  // Set project name
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

  skeletonData.isApi = answers.isApi;
  skeletonData.isLambda = answers.isLambda;
  var projRoot = utils.findProjectRootPath(process.cwd());

  return utils.getAllLambdaNames()
      .then(function(lambdaNames) {
        if (skeletonData.isLambda) {
          if (lambdaNames.indexOf(skeletonData.functionName) !== -1) {
            throw new JawsError(
                'You already have a lambda named ' + skeletonData.functionName,
                JawsError.errorCodes.INVALID_RESOURCE_NAME)
          }
        }

        skeletonData.backDir = path.join(projRoot, 'back');
        skeletonData.lambdaJawsJsonPath = path.join(
            skeletonData.backDir,
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

  // Set Root Path
  project.rootPath = path.resolve(path.join(path.dirname('.'), project.name));

  // Prepare admin.env
  var adminEnv = 'ADMIN_AWS_PROFILE=' + project.awsProfile + os.EOL;

  // Prepare CloudFormation template
  var cfTemplate = require('../templates/jaws-cf');
  cfTemplate.Parameters.aaProjectName.Default = project.name;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [project.name];
  cfTemplate.Parameters.aaStage.Default = project.stage;
  cfTemplate.Parameters.aaDataModelPrefix.Default = project.stage; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaDataModelPrefix.AllowedValues = [project.stage];
  cfTemplate.Parameters.aaNotficationEmail.Default = project.notificationEmail;

  // Create files
  return Promise.all([
    utils.writeFile(
        path.join(project.rootPath, 'back', '.env'),
        'JAWS_STAGE=' + project.stage + '\nJAWS_DATA_MODEL_PREFIX=' + project.stage
    ),
    fs.mkdirAsync(path.join(project.rootPath, 'front')),
    fs.mkdirAsync(path.join(project.rootPath, 'tests')),
    utils.writeFile(path.join(project.rootPath, 'admin.env'), adminEnv),
    utils.writeFile(path.join(project.rootPath, 'jaws-cf.json'), JSON.stringify(cfTemplate, null, 2)),
  ]);
}

/**
 * Create s3 bucket (if DNE) and upload the 1st stage env var
 *
 * Format: <bucket>/JAWS/envVars/<projName>/<stage>
 *
 * @returns {Promise}
 * @private
 */
function _createS3JawsStructure() {
  return AWSUtils.createBucket(project.awsProfile, project.region, project.s3Bucket)
      .then(function() {
        var envFileContents = 'JAWS_STAGE=' + project.stage + '\nJAWS_DATA_MODEL_PREFIX=' + project.stage;
        return AWSUtils.putEnvFile(
            project.awsProfile,
            project.region,
            project.s3Bucket,
            project.name,
            project.stage,
            envFileContents);
      });
}

/**
 * Create CloudFormation Stack
 */

function _createCfStack() {

  // Show loading messages
  var message = 'JAWS is now going to create an AWS CloudFormation Stack for the "' + project.stage +
      '" stage of your JAWS project. ';
  message = message + ' This doesn\'t cost anything, but takes around 5 minutes to set-up. Sit tight!';
  var spinner = new Spinner('%s Creating CloudFormation Stack...');
  spinner.setSpinnerString('|/-\\');
  spinner.start();

  return AWSUtils.cfCreateStack(
      project.awsProfile,
      project.region,
      project.rootPath,
      project.name,
      project.stage,
      project.notificationEmail
  )
      .then(function(cfData) {
        return new Promise(function(resolve, reject) {

          var stackStatus = null,
              stackData = null;

          async.whilst(
              function() {
                return stackStatus !== 'CREATE_COMPLETE';
              },

              function(callback) {

                // Call AWS every 5 minutes until CF Stack has been created
                setTimeout(function() {

                  AWSUtils.cfDescribeStacks(project.awsProfile, project.region, cfData.StackId)
                      .then(function(data) {
                        stackData = data;
                        stackStatus = stackData.Stacks[0].StackStatus;

                        if (!stackStatus || ['CREATE_IN_PROGRESS', 'CREATE_COMPLETE'].indexOf(stackStatus) === -1) {

                          spinner.stop(true);
                          return reject(new JawsError(
                              'Something went wrong while creating your JAWS resources',
                              JawsError.errorCodes.UNKNOWN));
                        } else {

                          return callback();
                        }
                      });
                }, 5000);
              },

              function() {
                // Stop Spinner, inform
                spinner.stop(true);
                console.log('CloudFormation Stack ' + stackData.Stacks[0].StackName + ' successfully created.');
                return resolve(stackData);
              }
          );
        });
      });
}

module.exports = function(JAWS) {

  JAWS.new = function(isLambda, isApi, functionName, resourceName) {
    var _this = this;

    return _getAnswers(resourceName, functionName, isLambda, isApi)
        .then(_prepareData)
        .then(_createSkeleton);

  };
};
