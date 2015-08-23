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
  AWS = require('../services/aws'),
  inquirer = require('bluebird-inquirer'),
  chalk = require('chalk'),
  utils = require('../utils/index'),
  shortid = require('shortid'),
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
 */

function _getAnswers() {
  return new Promise(function(resolve, reject) {

    // If Test
    if (process.env.NODE_ENV === 'test') return resolve(JSON.parse(process.env.TEST_NEW_ANSWERS));

    // Greet
    console.log(chalk.yellow(_generateAscii()));

    // Define CLI prompts
    var prompts = [

      // Request Project Name
      {
        type: 'input',
        name: 'name',
        message: 'Type a name for your new project (max 20 chars. Aphanumeric and - only):',
        default: 'jaws-new',
      },

      // Request Stage
      {
        type: 'input',
        name: 'stage',
        message: 'Which stage would you like to create? (you can import more later)',
        default: 'dev',
      },

      // Request Region - Only available AWS Lambda regions allowed
      {
        type: 'rawlist',
        name: 'region',
        message: 'Which AWS Region would you like to use (you can change these later)?',
        default: 'us-east-1',
        choices: [
          'us-east-1',
          'us-west-1',
          'eu-west-1',
          'ap-northeast-1'
        ]
      },

      // Request notification email
      {
        type: 'input',
        name: 'notificationEmail',
        message: 'Email would you like to use for AWS alarms:',
        default: '',
      },
    ];


    // Use existing or create new AWS CLI profile
    if (fs.existsSync(path.join(AWS.profilesGetPath(), 'credentials'))) {

      var profilesList = AWS.profilesList(),
        profiles = Object.keys(profilesList);

      prompts.unshift({
        type: 'rawlist',
        name: 'awsCliProfile',
        message: 'What AWS profile in ~/.aws/credentials should be used for your admin user?:',
        choices: profiles,
        default: profiles[0]
      });

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

    return inquirer.prompt(prompts)
      .then(function(answers) {
        return resolve(answers);
      });
  });
};


/**
 * Prepare Project Data
 */

function _prepareProjectData(answers) {
  return new Promise(function(resolve, reject) {

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
    if (answers.awsCliProfile) {

      project.awsProfile = answers.awsCliProfile;

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
      AWS.profilesSet('default', answers.region, answers.awsAdminKeyId, answers.awsAdminSecretKey);
      project.awsProfile = 'default';
    }

    // Set other project data
    project.stages = [answers.stage];
    project.regions = [answers.region];
    project.notificationEmail = answers.notificationEmail.trim();

    return resolve();

  });
}


/**
 * Create Project Directory
 */

function _createProjectDirectory() {

  // Set Root Path
  if (process.env.NODE_ENV === 'test') project.rootPath = process.env.TEST_PROJECT_DIR;
  else project.rootPath = path.resolve(path.join(path.dirname('.'), project.name));

  // Prepare admin.env
  var adminEnv = 'ADMIN_AWS_PROFILE=' + project.awsProfile + os.EOL;

  // Prepare CloudFormation template
  var cfTemplate = require('../templates/jaws-cf');
  cfTemplate.Parameters.aaProjectName.Default = project.name;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [project.name];
  cfTemplate.Parameters.aaStage.Default = project.stages[0];
  cfTemplate.Parameters.aaDataModelPrefix.Default = project.stages[0]; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaDataModelPrefix.AllowedValues = [project.stages[0]];
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
  var message = 'JAWS is now going to create an AWS CloudFormation Stack for the "' + project.stages[0] + '" stage of your JAWS project. ';
  message = message + ' This doesn\'t cost anything, but takes around 5 minutes to set-up. Sit tight!';
  console.log(message);
  var spinner = new Spinner('%s Creating CloudFormation Stack...');
  spinner.setSpinnerString('|/-\\');
  spinner.start();

  return AWS.cfCreateStack(project.awsProfile, project.regions[0], project.rootPath, project.name, project.stages[0], project.notificationEmail)
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

              AWS.cfDescribeStacks(project.awsProfile, project.regions[0], cfData.StackId).then(function(data) {

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
          function(error) {

            // Stop Spinner, inform
            spinner.stop(true);
            console.log('CloudFormation Stack successfully created.');
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
    profile: 'project',
    author: 'Vera D. Servers <vera@gmail.com> http://vera.io',
    location: '<enter project\'s github repository url here>',
    stages: [{
      stage: project.stages[0],
      iamRoleArn: iamRoleData.Role.Arn,
    }, ],
    awsRegions: [project.regions[0]],
    cfTemplate: {},
  };

  fs.writeFileSync(path.join(project.rootPath, 'jaws.json'), JSON.stringify(jawsJson, null, 2));

  console.log('Your project "' +
    project.name +
    '" has been successfully created in the current directory.'
  );
}


module.exports = function(JAWS) {
  JAWS.new = function() {

    return _getAnswers()
      .then(_prepareProjectData)
      .then(_createProjectDirectory)
      .then(_createCfStack)
      .then(function(cfStackData) {
        return AWS.cfDescribeStackResource(project.awsProfile, project.regions[0], cfStackData.Stacks[0].StackId, 'LambdaRole')
      })
      .then(function(cfResourceData) {
        return AWS.iamGetRole(project.awsProfile, project.regions[0], cfResourceData.StackResourceDetail.PhysicalResourceId)
      })
      .then(_createProjectJson);
  };
};
