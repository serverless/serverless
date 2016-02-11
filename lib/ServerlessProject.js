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

    let _this = this,
      resources;
    options = options || {};

    // Check for s-resources-cf.json
    if (SUtils.fileExistsSync(path.join(_this._S.config.projectPath, 's-resources-cf.json'))) {
      resources = SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, 's-resources-cf.json'));

      if (options.populate) {
        return BbPromise.resolve(SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), resources, options.stage, options.region));
      } else {
        return BbPromise.resolve(resources);
      }
    }

    let cPaths   = [],
      cfSnippets = [];

    return BbPromise.try(function() {

        resources = _this.get().cloudFormation;
        for (let c in _this.components) {
          cPaths.push(_this.components[c]._config.fullPath);
        }

        return cPaths;
      })
      .each(function (cPath) {

        // Check component root for s-resources.json extensions
        if (SUtils.fileExistsSync(path.join(cPath, 's-resources.json'))) {
          let resourcesExtension = SUtils.readAndParseJsonSync(path.join(cPath, 's-resources.json'));
          cfSnippets.push(resourcesExtension);
        }

        let cContents = fs.readdirSync(cPath);
        return BbPromise.resolve(cContents)
          .each(function (sf) {

            // Add s-resources.json extensions
            if (SUtils.fileExistsSync(path.join(cPath, sf, 's-resources.json'))) {
              let resourcesExtension = SUtils.readAndParseJsonSync(path.join(cPath, sf, 's-resources.json'));
              cfSnippets.push(resourcesExtension);
            }

            // Backward compat support for this.cloudFormation and s-module.json
            // TODO: Remove @ V1 when we can make breaking changes
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

          // Merge Lambda Policy Statements - s-resources.json uses different keys
          if (cf.LambdaIamPolicyStatements && cf.LambdaIamPolicyStatements.length > 0) {
            cf.LambdaIamPolicyStatements.forEach(function (policyStmt) {
              try {
                resources.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
              }
              catch (e) {
              }
            });
          }

          // Merge Resources - s-resources.json uses different keys
          if (cf.Resources) {
            let cfResourceKeys = Object.keys(cf.Resources);
            cfResourceKeys.forEach(function (resourceKey) {
              if (resources.Resources[resourceKey]) {
                SCli.log(`WARN: Resource key ${resourceKey} already defined in CF template. Overwriting...`);
              }
              try {
                resources.Resources[resourceKey] = cf.Resources[resourceKey];
              } catch (e) {
              }
            });
          }

          // Merge Resources
          // TODO: Remove @ V1 when we can make breaking changes
          if (cf.resources) {
            let cfResourceKeys = Object.keys(cf.resources);
            cfResourceKeys.forEach(function (resourceKey) {
              if (resources.Resources[resourceKey]) {
                SCli.log(`WARN: Resource key ${resourceKey} already defined in CF template. Overwriting...`);
              }
              try {
                resources.Resources[resourceKey] = cf.resources[resourceKey];
              } catch (e) {
              }
            });
          }

          // Merge Lambda Policy Statements
          // TODO: Remove @ V1 when we can make breaking changes
          if (cf.lambdaIamPolicyDocumentStatements && cf.lambdaIamPolicyDocumentStatements.length > 0) {
            cf.lambdaIamPolicyDocumentStatements.forEach(function (policyStmt) {
              try {
                resources.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
              }
              catch (e) {
              }
            });
          }

          // Merge Resources
          // TODO: Remove @ V1 when we can make breaking changes
          if (cf.resources) {
            let cfResourceKeys = Object.keys(cf.resources);
            cfResourceKeys.forEach(function (resourceKey) {
              if (resources.Resources[resourceKey]) {
                SCli.log(`WARN: Resource key ${resourceKey} already defined in CF template. Overwriting...`);
              }
              try {
                resources.Resources[resourceKey] = cf.resources[resourceKey];
              } catch (e) {
              }
            });
          }
        }

        // Return
        if (options.populate) {
          return SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), resources, options.stage, options.region);
        } else {
          return resources;
        }
      });
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this,
      files   = [];

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