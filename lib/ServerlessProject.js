'use strict';

/**
 * Serverless Project Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  extend           = require('util')._extend,
  path             = require('path'),
  _                = require('lodash'),
  fs               = require('fs'),
  BbPromise        = require('bluebird');

class ServerlessProject {

  /**
   * Constructor
   */

  constructor(Serverless) {
    this.S       = Serverless;
    this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Defaults
    _this.data                = {};
    _this.data.name           = 'serverless' + SUtils.generateShortId(6);
    _this.data.version        = '0.0.1';
    _this.data.profile        = 'serverless-v' + require('../package.json').version;
    _this.data.location       = 'https://github.com/...';
    _this.data.author         = '';
    _this.data.description    = 'A Slick New Serverless Project';
    _this.data.custom         = {};
    _this.data.components     = {};
    _this.data.plugins        = [];
    _this.data.cloudFormation = {
      "AWSTemplateFormatVersion": "2010-09-09",
      "Description": "The AWS CloudFormation template for this Serverless application's resources outside of Lambdas and Api Gateway",
      "Resources": {
        "IamRoleLambda": {
          "Type": "AWS::IAM::Role",
          "Properties": {
            "AssumeRolePolicyDocument": {
              "Version": "2012-10-17",
              "Statement": [
                {
                  "Effect": "Allow",
                  "Principal": {
                    "Service": [
                      "lambda.amazonaws.com"
                    ]
                  },
                  "Action": [
                    "sts:AssumeRole"
                  ]
                }
              ]
            },
            "Path": "/"
          }
        },
        "IamPolicyLambda": {
          "Type": "AWS::IAM::Policy",
          "Properties": {
            "PolicyName": "${stage}-${project}-lambda",
            "PolicyDocument": {
              "Version": "2012-10-17",
              "Statement": [
                {
                  "Effect": "Allow",
                  "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                  ],
                  "Resource": "arn:aws:logs:${region}:*:"
                }
              ]
            },
            "Roles": [
              {
                "Ref": "IamRoleLambda"
              }
            ]
          }
        }
      },
      "Outputs": {
        "IamRoleArnLambda": {
          "Description": "ARN of the lambda IAM role",
          "Value": {
            "Fn::GetAtt": [
              "IamRoleLambda",
              "Arn"
            ]
          }
        }
      }
    };

    // If no project path exists, return
    if (!_this.S.config.projectPath) return;

    // Get Project JSON
    let project         = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 's-project.json'));
    project.components  = project.components ? project.components : {};
    let projectContents = fs.readdirSync(path.join(_this.S.config.projectPath));

    for (let i = 0; i < projectContents.length; i++) {
      if (SUtils.fileExistsSync(path.join(_this.S.config.projectPath, projectContents[i], 's-component.json'))) {
        let component = new this.S.classes.Component(_this.S, { component: projectContents[i] });
        component = component.get();
        project.components[component.name] = component;
      }
    }

    // Add to data
    _this = extend(_this.data, project);
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this;

    // Validate paths
    if (!_this.S.config.projectPath) throw new SError('Missing project path');

    // Save all nested data
    if (options && options.deep && _this.data.components) {

      // Loop over components and save
      Object.keys(_this.data.components).forEach(function(componentName) {
        let component  = new _this.S.classes.Module(_this.S);
        component.data = Object.create(_this.data.components[componentName]);
        component.save();
      });
    }

    let data = this.get();
    if (data.components) delete data.components;

    // Save JSON file
    fs.writeFileSync(path.join(
      _this.S.config.projectPath,
      's-project.json'),
      JSON.stringify(data, null, 2));
  }
}

module.exports = ServerlessProject;