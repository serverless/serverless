'use strict';

/**
 * Serverless Project Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  path             = require('path'),
  _                = require('lodash'),
  fs               = require('fs');

class ServerlessProject {

  /**
   * Constructor
   */

  constructor(Serverless) {

    let _this = this;
    this.S    = Serverless;

    // Default properties
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
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Validate: Check project path is set
    if (!_this.S.config.projectPath) throw new SError('Project could not be loaded because no project path has been set on Serverless instance');

    // Validate: Check module exists
    if (!SUtils.fileExistsSync(path.join(_this.S.config.projectPath, 's-project.json'))) {
      throw new SError('Project could not be loaded because it does not exist: ' + _this.S.config.projectPath);
    }

    // Get Project JSON
    let projectJson = SUtils.readAndParseJsonSync(path.join(_this.config.fullPath, 's-project.json'));

    // Add component class instances
    projectJson.components  = {};
    let componentContents   = fs.readdirSync(_this.config.fullPath);
    for (let i = 0; i < componentContents.length; i++) {
      if (SUtils.fileExistsSync(path.join(_this.config.fullPath, componentContents[i], 's-component.json'))) {
        let component = new _this.S.classes.Component(_this.S, {
          component: projectJson.name
        });
        projectJson.components[component.name] = component.load();
      }
    }

    _this.data = projectJson;
  }

  /**
   * Set
   * - Set data
   */

  set(data, options) {

    if (options && options.deep) {
      for (let prop in data.components) {
        data.components[prop] = clone.components[prop].set();
      }
    }

    this.data = _.merge(this.data, dataClone);
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    let clone = _.cloneDeep(this.data);
    for (let prop in clone.components) {
      clone.components[prop] = clone.components[prop].get();
    }
    return clone;
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(options) {

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this.S.config.projectPath) throw new SError('Project could not be populated because no project path has been set on Serverless instance');

    // Populate components
    let clone = _.cloneDeep(this.data);
    if (clone.components) clone.components = {};
    clone = SUtils.populate(this.S, clone, options.stage, options.region);
    for (let prop in this.data.components) {
      clone.components[prop] = this.data[prop].getPopulated(options);
    }

    return clone;
  }

  /**
   * Get Templates
   * - Get templates in this project
   */

  getTemplates() {

    let templates = {};

    for (let prop in this.data.components) {
      templates[prop] = this.data.components[prop].getTemplates();
    }

    return templates;
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this;

    // Validate: Check project path is set
    if (!_this.S.config.projectPath) throw new SError('Project could not be saved because no project path has been set on Serverless instance');

    // Save all nested data
    if (options && options.deep) {

      // Loop over functions and save
      for (let prop in _this.data.components) {
        _this.data.components[prop].save(options);
      }
    }

    // Strip functions property
    let clone = _this.get();
    if (clone.components) delete clone.components;

    // Save JSON file
    fs.writeFileSync(path.join(
      _this.config.fullPath,
      's-project.json'),
      JSON.stringify(clone, null, 2));
  }
}

module.exports = ServerlessProject;