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
    let project = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 's-project.json'));

    // Add Modules & Functions
    project.modules = {};
    let moduleList  = fs.readdirSync(path.join(_this.S.config.projectPath, 'back', 'modules'));

    for (let i = 0; i < moduleList.length; i++) {
      let module = new ServerlessModule(_this.S, { module: moduleList[i] });
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
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(stage, region) {

    // Required: Stage & Region
    if (!stage || !region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S.config.projectPath) throw new SError('Project path must be set on Serverless instance');

    // Return
    return SUtils.populate(this.S, this.get(), stage, region);
  }

  /**
   * getResources
   * - get project resources
   */

  getResources(stage, region) {

    // Required: Stage & Region
    if (!stage || !region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S.config.projectPath) throw new SError('Project path must be set for this instance');

    return SUtils.getResources(this.getPopulated(stage, region));
  }

  /**
   * getModules
   * - returns an array of module instances
   * - paths is an array of module names: ['moduleOne', 'moduleTwo']
   */

  getModules(paths) {

    let _this = this,
      modules = [];

    for (let i = 0; i < Object.keys(this.data.modules).length; i++) {

      // If paths, and this module is not included, skip
      if (paths &&
        paths.length &&
        paths.indexOf(Object.keys(this.data.modules)[i]) === -1) continue;

      let module = new _this.S.classes.Module(_this.S);
      module.data = _this.data.modules[Object.keys(this.data.modules)[i]];
      modules.push(module);

    }

    return modules;
  }

  /**
   * getFunctions
   * - returns an array of module instances
   * - paths is an array with this format: ['moduleOne/functionOne', 'moduleTwo/functionOne']
   */

  getFunctions(paths) {

    let _this   = this,
      functions = [];

    // If paths, create temp obj for easy referencing
    if (paths && paths.length) {
      let pathsObj = {};
      paths.forEach(function (path) {

        let module = path.split('/')[0];
        let func = path.split('/')[1];

        if (!pathsObj[module]) pathsObj[module] = {};
        pathsObj[module][func] = true;
      });
    }

    for (let i = 0; i < Object.keys(this.data.modules).length; i++) {

      let module = this.data.modules[Object.keys(this.data.modules)[i]];
      for (let j = 0; j < Object.keys(module.functions).length; j++) {

        let func = module.functions[Object.keys(module.functions)[j]];

        // If paths, and this function is not included, skip
        if (paths && paths.length && (!pathsObj[module] || !pathsObj[module][func])) continue;

        let funcInstance = new _this.S.classes.Function(_this.S, {
          module: module,
          function: func
        });
        funcInstance.data = func;
        functions.push(funcInstance);
      }
    }

    return functions;
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
    if (SUtils.fileExistsSync(path.join(_this.S.config.projectPath, 's-project.json'))) {

      let projectJson = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 's-project.json'));

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
    fs.writeFileSync(path.join(_this.S.config.projectPath, 's-project.json'),
      JSON.stringify(this.data, null, 2));

    if (modulesTemp) this.data.modules = Object.create(modulesTemp);

    return;
  }
}

module.exports = ServerlessProject;