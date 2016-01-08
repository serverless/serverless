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
    let projectContents = fs.readdirSync(path.join(_this.S.config.projectPath));

    for (let i = 0; i < projectContents.length; i++) {
      if (SUtils.fileExistsSync(path.join(_this.S.config.projectPath, componentContents[i], 's-component.json'))) {
        let component = new this.S.classes.Component(_this.S, { component: componentContents[i] });
        component = component.get();
        project.data.components[component.name] = component;
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
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(options) {

    options = options || {};

    // Required: Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S.config.projectPath) throw new SError('Project path must be set on Serverless instance');

    // Return
    return SUtils.populate(this.S, this.get(), options.stage, options.region);
  }

  /**
   * getResources
   * - get project resources
   */

  getResources(options) {

    options = options || {};

    // Required: Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S.config.projectPath) throw new SError('Project path must be set for this instance');

    return SUtils.getResources(this.getPopulated(options));
  }

  /**
   * getComponents
   * - returns an array of component instances
   * - options.paths is an array of serverless paths like this: ['component', 'component']
   */

  getComponents(options) {

    let _this    = this,
      pathsObj   = {},
      components = [];

    options = options || {};

    // If no project path exists, throw error
    if (!_this.S.config.projectPath) throw new SError('Project path must be set in Serverless to use this method');

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {

        let component = path.split('/')[0];
        if (!pathsObj[component]) pathsObj[component] = {};
      });
    }

    for (let i = 0; i < Object.keys(project.components).length; i++) {

      let component = project.components[Object.keys(project.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        !pathsObj[component.name]) continue;

      let component = new _this.S.classes.Component(_this.S, { component: component.name });
      component.push(component);
    }

    if (options.paths && !components.length) {
      throw new SError('No components found in the paths you provided');
    }

    return components;
  }

  /**
   * getModules
   * - returns an array of module instances
   * - options.paths is an array of serverless paths like this: ['component/moduleOne', 'component/moduleTwo']
   */

  getModules(options) {

    let _this  = this,
      pathsObj = {},
      modules  = [];

    options = options || {};

    // If no project path exists, throw error
    if (!_this.S.config.projectPath) throw new SError('Project path must be set in Serverless to use this method');

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {

        let component = path.split('/')[0];
        let module = path.split('/')[1];

        if (!pathsObj[component])         pathsObj[component] = {};
        if (!pathsObj[component][module]) pathsObj[component][module] = {};
      });
    }

    for (let i = 0; i < Object.keys(_this.data.components).length; i++) {

      let component = Object.keys(_this.data.components)[i];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        !pathsObj[component.name]) continue;

      for (let j = 0; j < component.modules.length; j++) {

        let module = Object.keys(component.modules)[j];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          !pathsObj[component.name][module.name]) continue;

        let module = new _this.S.classes.Component(_this.S, {
          component: component.name,
          module: module.name
        });
        modules.push(module);
      }
    }

    if (options.paths && !modules.length) {
      throw new SError('No modules found in the paths you provided');
    }

    return modules;
  }

  /**
   * getFunctions
   * - returns an array of function instances
   * - options.paths is an array of Serverless paths like this: ['component/moduleOne/functionOne', 'component/moduleOne/functionOne']
   */

  getFunctions(options) {

    let _this   = this,
      functions = [],
      pathsObj  = {};

    options = options || {};

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {

        let component = path.split('/')[0];
        let module    = path.split('/')[1];
        let func      = path.split('/')[2].split('@')[0]; // Allows using this in getEndpoints

        if (!pathsObj[component]) pathsObj[component] = {};
        if (!pathsObj[component][module]) [component][module] = {};
        pathsObj[component][module][func] = true;
      });
    }

    for (let i = 0; i < Object.keys(_this.data.components).length; i++) {

      let component = Object.keys(_this.data.components)[i];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        !pathsObj[component.name]) continue;

      for (let j = 0; j < component.modules.length; j++) {

        let module = Object.keys(component.modules)[j];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          !pathsObj[component.name][module.name]) continue;

        for (let k = 0; k < module.functions.length; k++) {

          let func = Object.keys(module.functions)[k];

          // If paths, and this component is not included, skip
          if (options.paths &&
            options.paths.length &&
            !pathsObj[component.name][module.name] &&
            !pathsObj[component.name][module.name][func.name]) continue;

          let func = new _this.S.classes.Function(_this.S, {
            component: component.name,
            module: module.name,
            function: func.name
          });
          functions.push(func);
        }
      }
    }

    if (options.paths && !functions.length) {
      throw new SError('No functions found in the paths you provided');
    }

    return functions;
  }

  /**
   * getEndpoints
   */

  getEndpoints(options) {

    let _this   = this,
      endpoints = [],
      pathsObj  = {};

    options = options || {};

    // Get Project Data
    let project = options.populate ? _this.getPopulated(options) : _this.get();

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {

        if (path.indexOf('@') == -1 || path.indexOf('~') == -1) {
          throw new SError('Invalid endpoint path provided: ' + path);
        }

        let component  = path.split('/')[0];
        let module     = path.split('/')[1];
        let func       = path.split('/')[2].split('@')[0];
        let urlPath    = path.split('@')[1].split('~')[0];
        let method     = path.split('~')[1];

        if (!pathsObj[module]) pathsObj[module] = {};
        if (!pathsObj[module][func]) pathsObj[module][func] = {};
        if (!pathsObj[module][func][urlPath]) pathsObj[module][func][urlPath] = {};
        if (!pathsObj[module][func][urlPath][method]) pathsObj[module][func][urlPath][method] = true;
      });
    }

    // Get Functions
    let functions = _this.getFunctions(options);

    for (let i = 0; i < functions.length; i++) {

      let func = functions[i].data;

      for (let j = 0; j < func.endpoints.length; j++) {

        let endpoint = func.endpoints[j];

        if (options.paths &&
          options.paths.length &&
          !pathsObj[func.component][func.module][func.name][endpoint.path][endpoint.method]) continue;

        endpoints.push(endpoint);
      }
    }

    if (options.paths && !endpoints.length) {
      throw new SError('No endpoints found in the paths you provided');
    }

    return endpoints;
  }

  /**
   * save
   * - Saves data to file system
   */

  save() {

    let _this = this;

    // Loop over components and save
    Object.keys(_this.data.components).forEach(function(componentName) {

      let component  = new _this.S.classes.Module(_this.S);
      component.data = Object.create(_this.data.components[componentName]);
      component.save();
    });

    // Save JSON file
    fs.writeFileSync(path.join(_this.S.config.projectPath, 's-project.json'),
      JSON.stringify(this.data, null, 2));

  }
}

module.exports = ServerlessProject;