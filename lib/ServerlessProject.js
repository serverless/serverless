'use strict';

/**
 * Serverless Project Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  ServerlessModule = require('./ServerlessModule'),
  extend           = require('util')._extend,
  path             = require('path'),
  fs               = require('fs'),
  BbPromise        = require('bluebird');

class ServerlessProject {

  /**
   * Constructor
   * - options.projectPath: absolute path to project
   */

  constructor(Serverless, options) {
    this.S       = Serverless;
    this.options = options || {};
    this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(projectPath) {

    let _this = this;

    // Set projectPath
    if (projectPath) _this.options.projectPath = projectPath;

    // Defaults
    _this.data                = {};
    _this.data.name           = 'serverless' + SUtils.generateShortId(6);
    _this.data.version        = '0.0.1';
    _this.data.profile        = 'serverless-v' + require('../package.json').version;
    _this.data.location       = 'https://github.com/...';
    _this.data.author         = '';
    _this.data.description    = 'A Serverless Project';
    _this.data.custom         = {};
    _this.data.modules        = {};
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
            "PolicyName": "${stage}-${projectName}-lambda",
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
            ],
            "Groups": [
              {
                "Ref": "IamGroupLambda"
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
    if (!_this.options.projectPath) return;

    // Get Project JSON
    let project = SUtils.readAndParseJsonSync(path.join(this.options.projectPath, 's-project.json'));

    // Add Modules & Functions
    project.modules = {};
    let moduleList  = fs.readdirSync(path.join(this.options.projectPath, 'back', 'modules'));

    for (let i = 0; i < moduleList.length; i++) {
      let module = new ServerlessModule(_this.S, { path: moduleList[i] });
      module = module.get();
      project.modules[module.name] = module;
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
   * getResources
   * - get project resources
   */

  getResources(stage, region) {
    // Required: Stage & Region
    if (!stage || !region) throw new SError('Both "stage" and "region" params are required');

    return SUtils.getResources(this.getPopulated(stage, region));
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(stage, region) {
    let data = this.get();
    return SUtils.populate(this.S, data, stage, region);
  }

  /**
   * save
   * - Saves data to file system
   */

  save() {

    let _this = this;

    // Loop over functions and save
    Object.keys(_this.data.modules).forEach(function(moduleName) {

      let module  = new ServerlessModule(_this.S);
      module.data = Object.create(_this.data.modules[moduleName]);
      module.save();
    });

    let modulesTemp = false;

    // If file exists, do a diff and skip if equal
    if (SUtils.fileExistsSync(path.join(_this.options.projectPath, 's-project.json'))) {

      let projectJson = SUtils.readAndParseJsonSync(path.join(_this.options.projectPath, 's-project.json'));

      // Temporarily store and delete functions to compare with JSON
      modulesTemp = Object.create(_this.data.modules);
      delete _this.data['modules'];

      // check if data changed
      if (_.isEqual(projectJson, _this.data)) {

        // clone back functions property that we deleted
        _this.data.modules = Object.create(modulesTemp);
        return;
      }
    }

    // overwrite modules JSON file
    fs.writeFileSync(path.join(_this.options.projectPath, 's-project.json'),
      JSON.stringify(this.data, null, 2));

    if (modulesTemp) this.data.modules = Object.create(modulesTemp);

    return;
  }

  /**
   * Set Project Path
   * - Updates project path
   */

  setProjectPath(projectPath) {
    this.options.projectPath = projectPath;
  }
}

module.exports = ServerlessProject;