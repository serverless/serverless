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
    AWSUtils = require('../utils/aws'),
    inquirer = require('bluebird-inquirer'),
    chalk = require('chalk'),
    shortid = require('shortid'),
    extend = require('util')._extend, //OK per Isaacs and http://stackoverflow.com/a/22286375/563420
    Spinner = require('cli-spinner').Spinner;

Promise.promisifyAll(fs);

// Define Project
var project = {};

/**
 * Generate ASCII
 * @return string
 */

function _generateAscii() {

  var art = '';
  art = art + '       ____   _____  __      __  _________ ' + os.EOL;
  art = art + '      |    | /  _  \\/  \\    /  \\/   _____/ ' + os.EOL;
  art = art + '      |    |/  /_\\  \\   \\/\\/   /\\_____  \\  ' + os.EOL;
  art = art + '  /\\__|    /    |    \\        / /        \\ ' + os.EOL;
  art = art + '  \\________\\____|__  /\\__/\\__/ /_________/ ' + os.EOL;
  art = art + '' + os.EOL;
  art = art + '        *** The Server-less Stack ***     ' + os.EOL;

  return art;

}

/**
 * Get Answers
 *
 * @returns {Promise}
 * @private
 */
function _getAnswers(projName, stage, lambdaRegion, notificationEmail, awsProfile) {
  // Greet
  console.log(chalk.yellow(_generateAscii()));

  // Define CLI prompts
  var prompts = [],
      overrideAnswers = {};

  if (!projName) {
    prompts.push({
      type: 'input',
      name: 'name',
      message: 'Type a name for your new project (max 20 chars. Aphanumeric and - only):',
      default: 'jaws-new',
    });
  } else {
    overrideAnswers.name = projName;
  }

  if (!stage) {
    prompts.push({
      type: 'input',
      name: 'stage',
      message: 'Which stage would you like to create? (you can import more later)',
      default: 'dev',
    });
  } else {
    overrideAnswers.stage = stage;
  }

  // Request Region - Only available AWS Lambda regions allowed
  if (!lambdaRegion) {
    prompts.push({
      type: 'rawlist',
      name: 'region',
      message: 'Which AWS Region would you like to use (can add more/change later)?',
      default: 'us-east-1',
      choices: [
        'us-east-1',
        'us-west-1',
        'eu-west-1',
        'ap-northeast-1',
      ],
    });
  } else {
    overrideAnswers.region = lambdaRegion;
  }

  if (!notificationEmail) {
    prompts.push({
      type: 'input',
      name: 'notificationEmail',
      message: 'Email would you like to use for AWS alarms:',
      default: '',
    });
  } else {
    overrideAnswers.notificationEmail = notificationEmail;
  }

  // Use existing or create new AWS CLI profile
  if (fs.existsSync(path.join(AWSUtils.getConfigDir(), 'credentials'))) {

    var profilesList = AWSUtils.profilesMap(),
        profiles = Object.keys(profilesList);

    if (awsProfile && -1 !== profiles.indexOf(awsProfile)) {
      overrideAnswers.awsProfile = awsProfile;
    } else {
      prompts.unshift({
        type: 'rawlist',
        name: 'awsProfile',
        message: 'What AWS profile in ~/.aws/credentials should be used for your admin user?:',
        choices: profiles,
        default: profiles[0],
      });
    }
  } else {
    prompts.unshift({ //need to create aws creds profile (will use 'default')
      type: 'input',
      name: 'awsAdminKeyId',
      message: 'Please enter the ACCESS KEY ID for your ADMIN AWS IAM User:',
    }, {
      type: 'input',
      name: 'awsAdminSecretKey',
      message: 'Please enter the SECRET ACCESS KEY for your ADMIN AWS IAM User:',
    });
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
 * Prepare project data
 *
 * @param answers
 * @returns {Promise}
 * @private
 */
function _prepareProjectData(answers) {
  // Set project name
  project.name = answers.name.toLowerCase().trim()
      .replace(/[^a-zA-Z-\d\s:]/g, '')
      .replace(/\s/g, '-')
      .substring(0, 19);

  // AWS only allows Alphanumeric and - in name
  var nameOk = /^([a-zA-Z0-9-]+)$/.exec(project.name);
  if (!nameOk) {
    reject(new JawsError(
        'Project names can only be alphanumeric and -',
        JawsError.errorCodes.INVALID_PROJ_NAME));
  }

  // Append unique id if name is in use
  if (fs.existsSync(path.join(process.cwd(), project.name))) {
    project.name = project.name + '-' + shortid.generate().replace(/[_-]/g, '');
  }

  // Set or Create Profile
  if (answers.awsProfile) {

    project.awsProfile = answers.awsProfile;

  } else {

    if (!answers.awsAdminKeyId) {
      reject(new JawsError(
          'An AWS Access Key ID is required',
          JawsError.errorCodes.MISSING_AWS_CREDS));
    }

    if (!answers.awsAdminSecretKey) {
      reject(new JawsError(
          'An AWS Secret Key is required',
          JawsError.errorCodes.MISSING_AWS_CREDS));
    }

    // Set profile
    AWSUtils.profilesSet('default', answers.region, answers.awsAdminKeyId, answers.awsAdminSecretKey);
    project.awsProfile = 'default';
  }

  // Set other project data
  project.stage = answers.stage;
  project.region = answers.region;
  project.notificationEmail = answers.notificationEmail.trim();

  return Promise.resolve();
}

/**
 * Create Project Directory
 */

function _createProjectDirectory() {

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

  // Prepare Swagger
  var swaggerTemplate = require('../templates/jaws-swagger');
  swaggerTemplate.info.title = project.name;

  // Create files
  return Promise.all([
    fs.mkdirAsync(project.rootPath),
    fs.mkdirAsync(path.join(project.rootPath, 'back')),
    fs.mkdirAsync(path.join(project.rootPath, 'front')),
    fs.mkdirAsync(path.join(project.rootPath, 'tests')),
    fs.writeFileAsync(path.join(project.rootPath, 'admin.env'), adminEnv),
    fs.writeFileAsync(path.join(project.rootPath, 'jaws-cf.json'), JSON.stringify(cfTemplate, null, 2)),
    fs.writeFileAsync(path.join(project.rootPath, 'jaws-swagger.json'), JSON.stringify(swaggerTemplate, null, 2)),
  ]);
}

/**
 * Create CloudFormation Stack
 */

function _createCfStack() {

  // Show loading messages
  var message = 'JAWS is now going to create an AWS CloudFormation Stack for the "' + project.stage +
      '" stage of your JAWS project. ';
  message = message + ' This doesn\'t cost anything, but takes around 5 minutes to set-up. Sit tight!';
  console.log(message);
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

/**
 * Create Project JSON
 */

function _createProjectJson(iamRoleData) {

  var jawsJson = {
    name: project.name,
    version: '0.0.1',
    location: '<enter project\'s github repository url here>',
    author: 'Vera D. Servers <vera@gmail.com> http://vera.io',
    description: project.name + 'description',
    project: {
      regions: {},
    },

    //cfExtensions: {}, //don't think we need this for project do we?
  };

  jawsJson.project.regions[project.region] = {
    stages: [
      {
        stage: project.stage,
        iamRoleArn: iamRoleData.Role.Arn,
      },
    ],
  };

  fs.writeFileSync(path.join(project.rootPath, 'jaws.json'), JSON.stringify(jawsJson, null, 2));

  console.log('Your project "' +
      project.name +
      '" has been successfully created in the current directory.'
  );

  return Promise.resolve(jawsJson);
}

module.exports = function(JAWS) {
  JAWS.new = function(projName, stage, lambdaRegion, notificationEmail, awsProfile) {

    return _getAnswers(projName, stage, lambdaRegion, notificationEmail, awsProfile)
        .then(_prepareProjectData)
        .then(_createProjectDirectory)
        .then(_createCfStack)
        .then(function(cfStackData) {
          return AWSUtils.cfDescribeStackResource(
              project.awsProfile,
              project.region,
              cfStackData.Stacks[0].StackId,
              'LambdaRole');
        })
        .then(function(cfResourceData) {
          return AWSUtils.iamGetRole(
              project.awsProfile,
              project.region,
              cfResourceData.StackResourceDetail.PhysicalResourceId);
        })
        .then(_createProjectJson);
  };
};
