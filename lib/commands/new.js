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
    AWS = require('aws-sdk'),
    inquirer = require('bluebird-inquirer'),
    chalk = require('chalk'),
    shortid = require('shortid');

Promise.promisifyAll(fs);

/**
 * Internal Functions
 */

// Create project Swagger Template
function _createSwaggerTemplate(projectTitle) {

  return {
    swagger: '2.0',
    info: {
      version: '1.0.0',
      title: projectTitle,
      description: 'The Swagger template for this JAWS project to use with API Gateway',
    },
    host: '',
    schemes: [
      'https',
    ],
    consumes: [
      'application/json',
    ],
    produces: [
      'application/json',
    ],
    paths: {},
    definitions: {},
  };
}

// Generate ASCII
function _generateAscii() {

  var art = '';
  art = art + '       ____   _____  __      __  _________ ' + os.EOL;
  art = art + '      |    | /  _  \\/  \\    /  \\/   _____/ ' + os.EOL;
  art = art + '      |    |/  /_\\  \\   \\/\\/   /\\_____  \\  ' + os.EOL;
  art = art + '  /\\__|    /    |    \\        / /        \\ ' + os.EOL;
  art = art + '  \\________\\____|__  /\\__/\\__/ /_________/ ' + os.EOL;
  art = art + '' + os.EOL;
  art = art + '      *** The Server-less Framework ***     ' + os.EOL;

  return art;

}

module.exports = function(JAWS) {

  /**
   *
   * @returns {*}
   */
  JAWS.getAnswers = function() {
    var prompts = [

      // Request Project Name
      {
        type: 'input',
        name: 'name',
        message: 'Type a name for your new project (max 20 chars. Aphanumeric and - only):',
        default: 'jaws-' + shortid.generate(),
      },

      // Request Stage
      {
        type: 'input',
        name: 'stage',
        message: 'Which stage would you like to create? (you can import more later)',
        default: 'test',
      },

      // Request notification email
      {
        type: 'input',
        name: 'notificationEmail',
        message: 'Email would you like to use for AWS alarms:',
        default: '',
      },
    ];

    console.log(chalk.yellow(_generateAscii()));

    if (fs.existsSync(JAWS._utils.getAwsCredsPath())) { //existing profiles
      prompts.unshift({
        type: 'input',
        name: 'awsCliProfile',
        message: 'What AWS profile in ~/.aws/credentials should be used for your admin user?:',
        default: 'default',
      });
    } else {
      prompts.unshift({  //need to create aws creds profile (will use 'default')
            type: 'input',
            name: 'awsAdminKeyId',
            message: 'Please enter the ACCESS KEY ID for your ADMIN AWS IAM User:',
          },
          {
            type: 'input',
            name: 'awsAdminSecretKey',
            message: 'Please enter the SECRET ACCESS KEY for your ADMIN AWS IAM User:',
          }
      );
    }

    return inquirer.prompt(prompts)
        .then(function(answers) {
          return answers;
        });
  };

  JAWS.new = function(answers) {
    var nameOk = /^([a-zA-Z0-9-]+)$/.exec(answers.name);  //AWS only allows Alphanumeric and - in name

    if (!nameOk) {
      reject(new JawsError(
          'Project names can only be alphanumeric and -',
          JawsError.errorCodes.INVALID_PROJ_NAME));
    }

    var project = {
      awsProfile: 'default',
    };

    return new Promise(function(resolve, reject) {
      if (answers.awsCliProfile) {  //If they have ~/.aws/credentials they must specify an existing profile
        project.awsProfile = answers.awsCliProfile;
        project.awsAdminCreds = new AWS.SharedIniFileCredentials({profile: project.awsProfile});

        if (!project.awsAdminCreds || !project.awsAdminCreds.accessKeyId) {
          reject(new JawsError(
              'Could not find AWS admin profile ' + project.awsProfile,
              JawsError.errorCodes.MISSING_AWS_CREDS_PROFILE));
        }
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

        JAWS._utils.setAwsAdminCreds('default');  //TODO: really want to prompt for region? Manual change in config now
        project.awsAdminCreds = new AWS.SharedIniFileCredentials({profile: project.awsProfile});
      }

      // Set and sanitize project info
      project.name = answers.name.toLowerCase().trim()
          .replace(/[^a-zA-Z-\d\s:]/g, '')
          .replace(/\s/g, '-')
          .substring(0, 19);
      project.stages = [answers.stage];
      project.notificationEmail = answers.notificationEmail;

      resolve();
    })
        .then(function() {  //Make skeleton dir structure and initial files
          var adminEnv = 'ADMIN_AWS_PROFILE=' + project.awsProfile + os.EOL;

          // Set project root path.  Append unique id if name is in use.
          if (fs.existsSync(path.join(JAWS._meta.cwd, project.name))) {
            // Name must be unique or lots of things will break
            project.name = project.name + '-' + shortid.generate();
          }

          JAWS._meta.projectRootPath = path.resolve(path.join(path.dirname('.'), project.name));

          var cfTemplate = require('../templates/jaws-cf');
          cfTemplate.Parameters.aaProjectName.Default = project.name;
          cfTemplate.Parameters.aaProjectName.AllowedValues = [project.name];
          cfTemplate.Parameters.aaStage.Default = project.stages[0];
          cfTemplate.Parameters.aaDataModelPrefix.Default = project.stages[0];  //to simplify bootstrap use same stage
          cfTemplate.Parameters.aaDataModelPrefix.AllowedValues = [project.stages[0]];
          cfTemplate.Parameters.aaNotficationEmail.Default = project.notificationEmail;

          var rootPath = JAWS._meta.projectRootPath;
          return Promise.all([
            fs.mkdirAsync(rootPath),
            fs.mkdirAsync(path.join(rootPath, 'back')),
            fs.mkdirAsync(path.join(rootPath, 'front')),
            fs.mkdirAsync(path.join(rootPath, 'tests')),
            fs.writeFileAsync(path.join(rootPath, 'admin.env'), adminEnv),
            fs.writeFileAsync(path.join(rootPath, 'jaws-cf.json'), JSON.stringify(cfTemplate, null, 2)),
          ]);
        }).then(function() {

          // Configure AWS SDK
          //AWS.config.update({
          //  accessKeyId: project.awsAdminKeyId,
          //  secretAccessKey: project.awsAdminSecretKey,
          //});

          var awsProfileConfig = JAWS._utils.getAwsAdminProfileConfig(project.awsProfile);
          AWS.config.credentials = project.awsAdminCreds;
          AWS.config.update({region: awsProfileConfig.region});

          var cf = Promise.promisifyAll(new AWS.CloudFormation({apiVersion: '2010-05-15'})),
              cfParams = {
                StackName: [project.stages[0], project.name].join('-'), //stack names r alphanumeric + -, no _ :(
                Capabilities: [
                  'CAPABILITY_IAM',
                ],
                OnFailure: 'ROLLBACK',
                Parameters: [
                  {
                    ParameterKey: 'aaProjectName',
                    ParameterValue: project.name,
                    UsePreviousValue: false,
                  },
                  {
                    ParameterKey: 'aaStage',
                    ParameterValue: project.stages[0],
                    UsePreviousValue: false,
                  },
                  {
                    ParameterKey: 'aaDataModelPrefix',
                    ParameterValue: project.stages[0],
                    UsePreviousValue: false,
                  },
                  {
                    ParameterKey: 'aaHostedZoneName',
                    ParameterValue: 'mydomain.com', //TODO: should we prompt for this?
                    UsePreviousValue: false,
                  },
                  {
                    ParameterKey: 'aaNotficationEmail',
                    ParameterValue: project.notificationEmail,
                    UsePreviousValue: false,
                  },
                  {
                    ParameterKey: 'aaDefaultDynamoRWThroughput',
                    ParameterValue: '1',
                    UsePreviousValue: false,
                  }
                ],
                Tags: [
                  {
                    Key: 'STAGE',
                    Value: project.stages[0],
                  },
                ],
                //Gotta be careful, TemplateBody has a limit of 51,200 bytes. If we hit limit use TemplateURL
                TemplateBody: JSON.stringify(require(path.join(JAWS._meta.projectRootPath, 'jaws-cf.json'))),
              };

          console.log('Creating stage and IAM role via CloudFormation..');

          return cf.createStackAsync(cfParams);
        })
        .then(function(cfData) {
          //TODO: poll cfData.StackId
          cf.describeStackResourceAsync({StackName: cfData.StackId, LogicalResourceId: 'LambdaRole'});


          var jawsJson = {
            name: project.name,
            version: JAWS._meta.version,
            profile: 'project',
            author: 'Vera D. Servers <vera@gmail.com> http://vera.io',
            location: '<enter project\'s github repository url here>',
            stages: [{
              stage: project.stages[0],
              iamRoleArn: '', //implement
            },],
            awsRegions: ['us-east-1'],
            cfTemplate: {},
          };

          fs.writeFileSync(path.join(JAWS._meta.projectRootPath, 'jaws.json'), JSON.stringify(jawsJson, null, 2));
          fs.writeFileSync(
              path.join(JAWS._meta.projectRootPath, 'jaws-swagger.json'),
              JSON.stringify(_createSwaggerTemplate(project.name), null, 2)
          );

          console.log('Your project "' +
              project.name +
              '" has been successfully created in the current directory.'
          );

        });
  };
};
