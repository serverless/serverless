'use strict';

/**
 * JAWS Command: new
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 */

// Defaults
var Promise = require('bluebird'),
  fs = Promise.promisifyAll(require('fs')),
  os = require('os'),
  async = require('async'),
  AWS = require('aws-sdk'),
  inquirer = require('inquirer'),
  chalk = require('chalk'),
  jsonfile = Promise.promisifyAll(require('jsonfile')),
  shortid = require('shortid');

// AWS IAM Role True Policy
var iamRoleTrustPolicy = JSON.stringify({
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "",
    "Effect": "Allow",
    "Principal": {
      "Service": "lambda.amazonaws.com"
    },
    "Action": "sts:AssumeRole"
  }]
});

// AWS IAM Role Access Policy
var iamRoleAccessPolicy = JSON.stringify({
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "cloudwatch:*",
      "cognito-identity:ListIdentityPools",
      "cognito-sync:GetCognitoEvents",
      "cognito-sync:SetCognitoEvents",
      "dynamodb:*",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:ListRoles",
      "iam:PassRole",
      "kinesis:DescribeStream",
      "kinesis:ListStreams",
      "kinesis:PutRecord",
      "lambda:*",
      "logs:*",
      "s3:*",
      "sns:ListSubscriptions",
      "sns:ListSubscriptionsByTopic",
      "sns:ListTopics",
      "sns:Subscribe",
      "sns:Unsubscribe"
    ],
    "Resource": "*"
  }]
});


module.exports = function(JAWS) {

  JAWS.new = function() {

    // Epic greeting
    console.log(_generateAscii());

    var iam = new AWS.IAM();
    var project = {};

    // Define User Prompts
    var userPrompts = new Promise(function(resolve, reject) {

      // Define Prompts
      var prompts = [
        // Request Project Name
        {
          type: 'input',
          name: 'name',
          message: '**** JAWS: Type a name for your new project (max 20 chars):',
          default: 'jaws-new-' + shortid.generate()
        },
        // Request AWS Admin API Key
        {
          type: 'input',
          name: 'awsAdminKeyId',
          message: '**** JAWS: Please enter the ACCESS KEY ID for your AWS IAM User:'
        },
        // Request AWS Admin API Secret Key
        {
          type: 'input',
          name: 'awsAdminSecretKey',
          message: '**** JAWS: Please enter the SECRET ACCESS KEY for your AWS IAM User:'
        },
        // Request Stages
        {
          type: 'rawlist',
          name: 'stages',
          message: '**** JAWS: Which stages would you like to use (you can change later)?',
          choices: [
            'dev,prod',
            'dev,staging,prod',
            'dev,staging,test,prod'
          ]
        }
      ];

      inquirer.prompt(prompts, function(answers) {

        // Validate
        if (!answers.awsAdminKeyId) return console.log('****** JAWS Error: An AWS Access Key ID is required');
        if (!answers.awsAdminSecretKey) return console.log('****** JAWS Error: An AWS Secret Key is required');

        // Set and sanitize project info
        project.name = answers.name.toLowerCase().trim().replace(/[^a-zA-Z-\d\s:]/g, '').replace(/\s/g, '-').substring(0, 19);
        project.awsAdminKeyId = answers.awsAdminKeyId.trim();
        project.awsAdminSecretKey = answers.awsAdminSecretKey.trim();
        project.stages = answers.stages.split(',');

        return resolve();
      });
    });

    // Do user prompts
    userPrompts.then(function() {

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
      var adminEnv = 'ADMIN_AWS_ACCESS_KEY_ID=' + project.awsAdminKeyId + os.EOL + 'ADMIN_AWS_SECRET_ACCESS_KEY=' + project.awsAdminSecretKey;
      return fs.writeFile(JAWS._meta.projectRootPath + '/admin.env', adminEnv);

    }).
    catch(function(e) {

      console.error(e);

    }).
    finally(function() {

      // Configure AWS SDK
      AWS.config.update({
        accessKeyId: project.awsAdminKeyId,
        secretAccessKey: project.awsAdminSecretKey
      });

      // Create IAM Roles and their policies for each stage
      async.eachSeries(project.stages, function(stage, stageCallback) {

        // Inform
        console.log('****** JAWS: Creating an IAM Role for stage: ' + stage + '...');

        // Create IAM Role
        var params = {
          AssumeRolePolicyDocument: iamRoleTrustPolicy,
          RoleName: stage + '_-_' + project.name + '_-_' + 'jaws-role'
        };

        iam.createRole(params, function(err, data) {

          if (err) return console.log(err, err.stack);

          project.stages[project.stages.indexOf(stage)] = {
            stage: stage,
            iamRole: data.Role.RoleName,
            iamRoleArn: data.Role.Arn
          };

          // Inform
          console.log('****** JAWS: Attaching IAM Role\'s access policy...');

          // Add access policy to IAM role
          var params = {
            PolicyDocument: iamRoleAccessPolicy,
            PolicyName: stage + '_-_' + project.name + '_-_' + 'jaws-policy',
            RoleName: data.Role.RoleName
          };

          iam.putRolePolicy(params, function(err, data) {

            if (err) return console.log(err, err.stack);

            // Inform
            console.log('****** JAWS: Stage created successfully! (' + stage + ')');

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
          cfTemplate: {}
        };
        jsonfile.spaces = 2;
        jsonfile.writeFileSync(JAWS._meta.projectRootPath + '/jaws.json', jawsJson);

        // Create CloudFormation file
        jsonfile.writeFileSync(JAWS._meta.projectRootPath + '/jaws-cf.json', _createCFTemplate());

        // Create Swagger file
        jsonfile.writeFileSync(JAWS._meta.projectRootPath + '/jaws-swagger.json', _createSwaggerTemplate(project.name));

        // End
        console.log('****** JAWS: Your project "' + project.name + '" has been successfully created in the current directory.');

      });
    });
  };
};

/**
 * Internal Functions
 */


// Create Project CloudFormation Template
function _createCFTemplate() {

  /**
   * TODO
   * - Determine standard JAWS parameters which all CF templates can use.
   * - Include them here.
   */

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "The AWS CloudFormation template for this JAWS project",
    Parameters: {},
    Mappings: {},
    Resources: {},
    Outputs: {}
  };
}

// Create project Swagger Template
function _createSwaggerTemplate(projectTitle) {

  return {
    "swagger": "2.0",
    "info": {
      "version": "1.0.0",
      "title": projectTitle,
      "description": "The Swagger template for this JAWS project to use with API Gateway"
    },
    "host": "",
    "schemes": [
      "https"
    ],
    "consumes": [
      "application/json"
    ],
    "produces": [
      "application/json"
    ],
    "paths": {},
    "definitions": {}
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
