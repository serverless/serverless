'use strict';

/**
 * Serverless Project Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  BbPromise        = require('bluebird'),
  path             = require('path'),
  _                = require('lodash'),
  fs               = require('fs'),
  os               = require('os');

class ServerlessProject {

  /**
   * Constructor
   */

  constructor(Serverless) {

    let _this = this;
    this._S = Serverless;

    // Default properties
    _this.name = 'serverless' + SUtils.generateShortId(6);
    _this.version = '0.0.1';
    _this.profile = 'serverless-v' + require('../package.json').version;
    _this.location = 'https://github.com/...';
    _this.author = '';
    _this.description = 'A Slick New Serverless Project';
    _this.custom = {};
    _this.components = {};
    _this.plugins = [];
    _this.cloudFormation = {
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
   * - Load from source (i.e., file system)
   * - Return promise
   */

  load() {

    let _this = this,
      projectJson,
      projectContents;

    return BbPromise.try(function () {

        // Validate: Check project path is set
        if (!_this._S.config.projectPath) throw new SError('Project could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check project exists
        if (!SUtils.fileExistsSync(path.join(_this._S.config.projectPath, 's-project.json'))) {
          throw new SError('Project could not be loaded because it does not exist');
        }

        projectJson = SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, 's-project.json'));
        projectJson.components = {};
        projectContents = fs.readdirSync(_this._S.config.projectPath);

        return projectContents;
      })
      .each(function (c, i) {

        if (!SUtils.fileExistsSync(path.join(
            _this._S.config.projectPath, projectContents[i],
            's-component.json'))) return;

        let component = new _this._S.classes.Component(_this._S, {
          component: c
        });

        return component.load()
          .then(function (instance) {
            projectJson.components[c] = instance;
            return projectJson.components[c];
          });
      })
      .then(function () {

        // Merge
        _.assign(_this, projectJson);
        return _this;
      });
  }

  /**
   * Set
   * - Set data
   * - Accepts a data object
   */

  set(data) {
    let _this = this;

    // Instantiate Components
    for (let prop in data.components) {

      if (data.components[prop] instanceof _this._S.classes.Component) {
        throw new SError('You cannot pass subclasses into the set method, only object literals');
      }

      let instance = new _this._S.classes.Component(_this._S, {
        component: data.components[prop].name
      });
      data.components[prop] = instance.set(data.components[prop]);
    }

    // Merge in
    _this = _.extend(_this, data);
    return _this;
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    let clone = _.cloneDeep(this);
    for (let prop in this.components) {
      clone.components[prop] = this.components[prop].get();
    }
    return SUtils.exportClassData(clone);
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   * - Returns Promise
   */

  getPopulated(options) {

    let _this = this;

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.config.projectPath) throw new SError('Project could not be populated because no project path has been set on Serverless instance');

    // Populate components
    let clone = _.cloneDeep(this);
    if (clone.components) clone.components = {};
    return SUtils.populate(this._S, clone, options.stage, options.region)
      .then(function(data) {
        clone = data;
        clone.components = {};
        for (let prop in _this.components) {
          _this.components[prop].getPopulated(options)
            .then(function(newData) {
              clone.components[prop] = newData;
            });
        }
      })
      .then(function(){
        return clone
      });
  }

  /**
   * Get Templates
   * - Get templates in this project
   * - Returns promise
   */

  getTemplates() {

    let _this   = this,
      templates = {
        _project:    {},
        _components: {}
      };

    return BbPromise.try(function () {
        return Object.keys(_this.components);
      })
      .each(function (c) {
        return _this.components[c].getTemplates()
          .then(function (t) {
            templates._components[c] = t;
          });
      })
      .then(function () {
        return templates;
      });
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this;

    return new BbPromise.try(function () {

      // Validate: Check project path is set
      if (!_this._S.config.projectPath) throw new SError('Project could not be saved because no project path has been set on Serverless instance');

      // Create if does not exist
      if (!SUtils.fileExistsSync(path.join(_this._S.config.projectPath, 's-project.json'))) {
        return _this._create();
      }
    })
      .then(function () {

        // Save all nested components
        if (options && options.deep) {
          return BbPromise.try(function () {
              return Object.keys(_this.components);
            })
            .each(function (c) {
              return _this.components[c].save();
            })
        }
      })
      .then(function () {

        let clone = _this.get();

        // Strip modules property
        if (clone.components) delete clone.components;

        // Write file
        return SUtils.writeFile(path.join(_this._S.config.projectPath, 's-project.json'),
          JSON.stringify(clone, null, 2));
      })
      .then(function () {
        return _this;
      })
  }

  /**
   * Create (scaffolding)
   * - Returns promise
   */

  _create() {

    let _this = this,
      adminEnv,
      readme;

    return BbPromise.try(function () {

      // Prepare admin.env
      adminEnv = 'SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID=' + _this._S.config.awsAdminKeyId + os.EOL
        + 'SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY=' + _this._S.config.awsAdminSecretKey + os.EOL;

      // Prepare README.md
      readme = '#' + _this.name;

      // Create Project Scaffolding
      return SUtils.writeFile(
        path.join(_this._S.config.projectPath, '.env'),
          'SERVERLESS_STAGE=development'
          + '\nSERVERLESS_DATA_MODEL_STAGE=development'
          + '\nSERVERLESS_PROJECT_NAME=' + _this.name
        )
        .then(function () {

          // Create Folders
          fs.mkdirSync(path.join(_this._S.config.projectPath, '_meta'));
          fs.mkdirSync(path.join(_this._S.config.projectPath, '_meta', 'variables'));
          fs.mkdirSync(path.join(_this._S.config.projectPath, '_meta', 'resources'));

          return BbPromise.all([
            SUtils.writeFile(path.join(_this._S.config.projectPath, 'admin.env'), adminEnv),
            SUtils.writeFile(path.join(_this._S.config.projectPath, 'README.md'), readme),
            fs.writeFileAsync(path.join(_this._S.config.projectPath, '.gitignore'), fs.readFileSync(path.join(_this._S.config.serverlessPath, 'templates', 'gitignore')))
          ]);
        });
    });
  }
}

module.exports = ServerlessProject;