'use strict';

/**
 * Serverless Project Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  SCli             = require('./utils/cli'),
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
    this._S   = Serverless;

    // Default properties
    _this.name            = 'serverless' + SUtils.generateShortId(6);
    _this.version         = '0.0.1';
    _this.profile         = 'serverless-v' + require('../package.json').version;
    _this.location        = 'https://github.com/...';
    _this.author          = '';
    _this.description     = 'A Slick New Serverless Project';
    _this.custom          = {};
    _this.components      = {};
    _this.templates       = {};
    _this.plugins         = [];
    _this.cloudFormation  = {
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
                  "Resource": "arn:aws:logs:${region}:*:*"
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

        projectJson             = SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, 's-project.json'));
        projectJson.components  = {};
        projectJson.templates   = {};
        projectContents         = fs.readdirSync(_this._S.config.projectPath);

        return projectContents;
      })
      .each(function (c, i) {

        // If template, load template
        if (c.indexOf('s-template') !== -1) {
          projectJson.templates = _.assign(projectJson.templates, SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, c)));
          return;
        }

        // If component, load component
        if (SUtils.fileExistsSync(path.join(_this._S.config.projectPath, c, 's-component.json'))) {

          let component = new _this._S.classes.Component(_this._S, {
            sPath: c
          });

          return component.load()
            .then(function (instance) {
              projectJson.components[c] = instance;
            });
        }
      })
      .then(function() {

        // Check for s-resources-cf.json
        if (!_this.cloudFormation && SUtils.fileExistsSync(path.join(_this._S.config.projectPath, 's-resources-cf.json'))) {
          _this.cloudFormation = SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, 's-resources-cf.json'));
        }

        // Backward compat support for this.cloudFormation and s-module.json
        // TODO: Remove @ V1 when we can make breaking changes
        if (!_this.cloudFormation) return;

        let cPaths   = [],
          cfSnippets = [];

        for (let c in _this.components) {
          cPaths.push(_this.components[c]._config.fullPath);
        }

        return BbPromise.resolve(cPaths)
          .each(function (cPath) {

            let cContents = fs.readdirSync(cPath);
            return BbPromise.resolve(cContents)
              .each(function (sf) {
                if (SUtils.fileExistsSync(path.join(cPath, sf, 's-module.json'))) {
                  let moduleJson = SUtils.readAndParseJsonSync(path.join(cPath, sf, 's-module.json'));
                  if (moduleJson.cloudFormation) cfSnippets.push(moduleJson.cloudFormation);
                }
              });
          })
          .then(function () {

            // Merge s-module.json CF syntax
            for (let i = 0; i < cfSnippets.length; i++) {

              let cf = cfSnippets[i];

              // Merge Lambda Policy Statements
              if (cf.lambdaIamPolicyDocumentStatements && cf.lambdaIamPolicyDocumentStatements.length > 0) {
                cf.lambdaIamPolicyDocumentStatements.forEach(function(policyStmt) {
                  try {
                    _this.cloudFormation.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
                  }
                  catch(e){}
                });
              }

              // Merge Resources
              if (cf.resources) {
                let cfResourceKeys = Object.keys(cf.resources);
                cfResourceKeys.forEach(function (resourceKey) {
                  if (_this.cloudFormation.Resources[resourceKey]) {
                    SCli.log(`WARN: Resource key ${resourceKey} already defined in CF template. Overwriting...`);
                  }
                  try {
                    _this.cloudFormation.Resources[resourceKey] = cf.resources[resourceKey];
                  } catch(e){}
                });
              }
            }
          })
        .then(function() {

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
        sPath: data.components[prop].name
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
    if (!_this._S.config.projectPath) throw new SError('Project could not be populated because no project path has been set on Serverless instance');

    // Populate components
    let clone        = _this.get();
    clone            = SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), clone, options.stage, options.region);
    clone.components = {};
    for (let prop in _this.components) {
      clone.components[prop] = _this.components[prop].getPopulated(options);
    }

    return clone;
  }

  /**
   * Get Templates
   * - Returns clone of templates
   */

  getTemplates() {
    return _.cloneDeep(this.templates ? this.templates : {});
  }

  /**
   * Get Resources
   * - Returns Promise & clone of resources
   */

  getResources(options) {

    let _this = this;

    options = options || {};

    if (options.populate) {
      return SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), _this.cloudFormation, options.stage, options.region);
    } else {
      return _this.cloudFormation;
    }
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this,
      files = [];

    // Validate: Check project path is set
    if (!_this._S.config.projectPath) throw new SError('Project could not be saved because no project path has been set on Serverless instance');

    return new BbPromise.try(function () {

      // If project folder does not exist, create it
      if (!SUtils.dirExistsSync(path.join(_this._S.config.projectPath))) {
        fs.mkdirSync(path.join(_this._S.config.projectPath));
      }

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

        // Strip properties
        if (clone.components) delete clone.components;
        if (clone.templates) delete clone.templates;

        // Save s-project.json
        files.push(SUtils.writeFile(path.join(_this._S.config.projectPath, 's-project.json'),
          JSON.stringify(clone, null, 2)));

        // Write files
        return BbPromise.all(files);
      })
      .then(function () {
        return _this;
      })
  }
}

module.exports = ServerlessProject;