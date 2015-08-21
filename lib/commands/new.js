'use strict';

/**
 * JAWS Command: new
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 */

// Defaults
var Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    async = require('async'),
    AWS = require('aws-sdk'),
    inquirer = require('inquirer'),
    chalk = require('chalk'),
    jsonfile = Promise.promisifyAll(require('jsonfile')),
    shortid = require('shortid');

Promise.promisifyAll([
  fs,
]);

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

  JAWS.new = function() {

    // Epic greeting
    chalk.yellow(_generateAscii());

    var iam = new AWS.IAM();
    var project = {},
        requireAdminCreds = true;

    var getOrSetAdminCreds = new Promise(function(resolve, reject) {
      if (fs.existsSync(JAWS._utils.getAwsCredsPath())) {
        inquirer.prompt([{
          type: 'input',
          name: 'awsCliProfile',
          message: 'What AWS profile in ~/.aws/credentials should be used for your admin user?:',
          default: 'default',
        },], function(answers) {
          project.awsProfile = answers.awsCliProfile || 'default';
          project.creds = new AWS.SharedIniFileCredentials({profile: project.awsProfile});
          requireAdminCreds = false;
        });
      }

      resolve();
    });

    // Define User Prompts
    var userPrompts = new Promise(function(resolve, reject) {

      // Define Prompts
      var prompts = [

        // Request Project Name
        {
          type: 'input',
          name: 'name',
          message: 'Type a name for your new project (max 20 chars):',
          default: 'jaws-new-' + shortid.generate(),
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

      if (requireAdminCreds) {
        prompts.push({             // Request AWS Admin API Creds
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

      inquirer.prompt(prompts, function(answers) {

        // Validate
        if (requireAdminCreds) {
          if (!answers.awsAdminKeyId) {
            //todo throw
            return console.log('JAWS Error: An AWS Access Key ID is required');
          }

          if (!answers.awsAdminSecretKey) {
            //todo throw
            return console.log('JAWS Error: An AWS Secret Key is required');
          }

          JAWS._utils.setAwsAdminCreds('default');
          project.creds = new AWS.SharedIniFileCredentials({profile: 'default'});
        }

        // Set and sanitize project info
        project.name = answers.name.toLowerCase().trim()
            .replace(/[^a-zA-Z-\d\s:]/g, '')
            .replace(/\s/g, '-')
            .substring(0, 19);
        project.stages = [answers.stage];
        project.notificationEmail = answers.notificationEmail;

        return resolve();
      });
    });

    // Do user prompts
    getOrSetAdminCreds
        .then(function() {
          return userPrompts;
        })
        .then(function() {

          // Set project root path.  Append unique id if name is in use
          if (fs.existsSync(JAWS._meta.cwd + '/' + project.name)) {

            // Name must be unique or lots of things will break
            project.name = project.name + '-' + shortid.generate();
            JAWS._meta.projectRootPath = './' + project.name;

          } else {
            JAWS._meta.projectRootPath = project.name.replace(/\s/g, '-');
          }

          // Create project root directory
          return fs.mkdirAsync(JAWS._meta.projectRootPath);

        }).then(function() {

          // Create project/back
          return fs.mkdirAsync(JAWS._meta.projectRootPath + '/back');

        }).then(function() {

          // Create project/front
          return fs.mkdirAsync(JAWS._meta.projectRootPath + '/front');

        }).then(function() {

          // Create project/front
          return fs.mkdirAsync(JAWS._meta.projectRootPath + '/tests');

        }).then(function() {

          // Create admin.env
          var adminEnv = 'ADMIN_AWS_PROFILE=' + project.awsProfile;
          return fs.writeFile(path.join(JAWS._meta.projectRootPath, 'admin.env'), adminEnv);

        })
        .catch(function(e) {

          console.error(e);

        })
        .finally(function() {

          // Configure AWS SDK
          //AWS.config.update({
          //  accessKeyId: project.awsAdminKeyId,
          //  secretAccessKey: project.awsAdminSecretKey,
          //});
          AWS.config.update(project.creds);

          var cfTemplate = require('../templates/jaws-cf');
          cfTemplate.Parameters.aaProjectName.Default = project.name;
          cfTemplate.Parameters.aaProjectName.AllowedValues = [project.name];
          cfTemplate.Parameters.aaStage = project.stages[0];
          cfTemplate.Parameters.aaDataModelPrefix.Default = project.project.stages[0];  //to simplify bootstrap use same stage
          cfTemplate.Parameters.aaDataModelPrefix.AllowedValues = [project.project.stages[0]];
          cfTemplate.Parameters.aaNotficationEmail.Default = project.notificationEmail;

          // Create IAM Roles and their policies for each stage
          async.eachSeries(project.stages, function(stage, stageCallback) {

            // Inform
            console.log('Creating an IAM Role for stage: ' + stage + '...');

            // Create IAM Role
            var params = {
              AssumeRolePolicyDocument: iamRoleTrustPolicy,
              RoleName: stage + '_-_' + project.name + '_-_' + 'jaws-role',
            };

            iam.createRole(params, function(err, data) {

              if (err) return console.log(err, err.stack);

              project.stages[project.stages.indexOf(stage)] = {
                stage: stage,
                iamRoleArn: data.Role.Arn,
              };

              // Inform
              console.log('JAWS: Attaching IAM Role\'s access policy...');

              // Add access policy to IAM role
              var params = {
                PolicyDocument: iamRoleAccessPolicy,
                PolicyName: stage + '_-_' + project.name + '_-_' + 'jaws-policy',
                RoleName: data.Role.RoleName,
              };

              iam.putRolePolicy(params, function(err) {

                if (err) return console.log(err, err.stack);

                // Inform
                console.log('JAWS: Stage created successfully! (' + stage + ')');

                // Callback
                return stageCallback();

              });
            });
          }, function(error) {

            // Create jaws.json
            var jawsJson = {
              name: project.name,
              version: JAWS._meta.version,
              profile: 'project',
              author: 'Vera D. Servers <vera@gmail.com> http://vera.io',
              location: '<enter project\'s github repository url here>',
              stages: project.stages,
              awsRegions: ['us-east-1'],
              cfTemplate: {},
            };
            jsonfile.spaces = 2;
            jsonfile.writeFileSync(JAWS._meta.projectRootPath + '/jaws.json', jawsJson);

            // Create CloudFormation file
            jsonfile.writeFileSync(JAWS._meta.projectRootPath + '/jaws-cf.json', cfTemplate);

            // Create Swagger file
            jsonfile.writeFileSync(
                JAWS._meta.projectRootPath + '/jaws-swagger.json',
                _createSwaggerTemplate(project.name)
            );

            // End
            console.log('JAWS: Your project "' +
                project.name +
                '" has been successfully created in the current directory.'
            );
          });
        });
  };
};
