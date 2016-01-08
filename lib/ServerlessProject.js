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
    this.config  = {};
    this.updateConfig(config);
    this.load();
  }

  /**
   * Update Config
   */

  updateConfig(config) {
    if (config) {
      this.config = config;
    }
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

    for (let i = 0; i < Object.keys(_this.data.components).length; i++) {

      let componentName = Object.keys(_this.data.components)[i];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[componentName] === 'undefined') continue;

      let component = new _this.S.classes.Component(_this.S, { component: componentName });
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
        typeof pathsObj[component.name] === 'undefined') continue;

      for (let j = 0; j < component.modules.length; j++) {

        let moduleName = Object.keys(component.modules)[j];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.name][moduleName] === 'undefined') continue;

        let module = new _this.S.classes.Component(_this.S, {
          component: component.name,
          module:    moduleName
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

    options     = options || {};

    // If paths, create temp obj for easy referencing
    if (options.paths && options.paths.length) {
      options.paths.forEach(function (path) {

        // Validate Path
        _this.S.validatePath(path, 'function');

        var parsed = _this.S.parsePath(path);

        if (!pathsObj[parsed.component])                pathsObj[parsed.component] = {};
        if (!pathsObj[parsed.component][parsed.module]) pathsObj[parsed.component][parsed.module] = {};
        pathsObj[parsed.component][parsed.module][parsed.function]  = true;
      });
    }

    for (let i = 0; i < Object.keys(_this.data.components).length; i++) {

      let component = _this.data.components[Object.keys(_this.data.components)[i]];

      // If paths, and this component is not included, skip
      if (options.paths &&
        options.paths.length &&
        typeof pathsObj[component.name] === 'undefined') continue;

      if (!component.modules) continue;

      for (let j = 0; j < Object.keys(component.modules).length; j++) {

        let module = component.modules[Object.keys(component.modules)[j]];

        // If paths, and this component is not included, skip
        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[component.name][module.name] === 'undefined') continue;

        if (!module.functions) continue;

        for (let k = 0; k < Object.keys(module.functions).length; k++) {

          let func = module.functions[Object.keys(module.functions)[k]];

          // If paths, and this component is not included, skip
          if (options.paths &&
            options.paths.length &&
            typeof pathsObj[component.name][module.name][func.name] === 'undefined') continue;

          let funcInstance = new _this.S.classes.Function(_this.S, {
            component: component.name,
            module:    module.name,
            function:  func.name
          });
          functions.push(funcInstance);
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

        _this.S.validatePath(path, 'endpoint');

        let parsed = _this.S.parsePath(path);

        if (!pathsObj[parsed.component]) pathsObj[parsed.component] = {};
        if (!pathsObj[parsed.component][parsed.module]) pathsObj[parsed.component][parsed.module] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function]) pathsObj[parsed.component][parsed.module][parsed.function] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath]) pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath] = {};
        if (!pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath][parsed.urlMethod]) pathsObj[parsed.component][parsed.module][parsed.function][parsed.urlPath][parsed.urlMethod] = true;
      });
    }

    // Get Functions
    let functions = _this.getFunctions(options);

    for (let i = 0; i < functions.length; i++) {

      let func = functions[i];

      for (let j = 0; j < func.data.endpoints.length; j++) {

        let endpoint = func.data.endpoints[j];

        if (options.paths &&
          options.paths.length &&
          typeof pathsObj[func.config.component][func.config.module][func.data.name][endpoint.path][endpoint.method] === 'undefined') continue;

        // TODO: Make a real class for ServerlessEndpoint
        endpoint                  = {};
        endpoint.data             = func.data.endpoints[j];
        endpoint.config           = {};
        endpoint.config.sPath     = func.config.sPath + '@' + endpoint.data.path + '~' + endpoint.data.method;
        endpoint.config.component = func.config.component;
        endpoint.config.module    = func.config.module;
        endpoint.config.function  = func.config.function;

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

  save(options) {

    let _this = this;

    // Validate paths
    if (!_this.S.config.projectPath) throw new SError('Missing project path');

    // Save JSON file
    fs.writeFileSync(path.join(
      _this.S.config.projectPath,
      's-project.json'),
      JSON.stringify(this.data, null, 2));

    // Save all nested data
    if (options && options.deep) {

      // Loop over components and save
      Object.keys(_this.data.components).forEach(function(componentName) {

        let component  = new _this.S.classes.Module(_this.S);
        component.data = Object.create(_this.data.components[componentName]);
        component.save();
      });
    }
  }
}

module.exports = ServerlessProject;