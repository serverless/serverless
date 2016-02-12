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

  constructor(rootPath) {

    let _this = this;

    _this.rootPath = rootPath;

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
    _this.resourceVars    = [];
  }

  //TODO: get rid of this?
  setServerless( Serverless ) {
    this._S = Serverless;
  }

  static findProject( startDir ){
    let jsonName = 's-project.json';

    // Check up to 10 parent levels
    let previous   = '.',
        project = undefined,
        i = 10;

    while( i >= 0 ) {
      let fullPath = path.resolve(startDir, previous);

      if (SUtils.fileExistsSync(path.join(fullPath, jsonName))) {
        let projectJson = require(path.join(fullPath, jsonName));
        if (typeof projectJson.name !== 'undefined') {
          project = new ServerlessProject( fullPath );
          project.load();
          break;
        }
      }

      previous = path.join(previous, '..');
      i--;
    }

    return project;
  }

  getPlugins(){
    return this.plugins;
  }

  getRootPath(){
    return this.rootPath;
  }

  getFilePath(){
    let args = _.toArray( arguments );
    args.unshift( this.getRootPath() );
    return path.join.apply( path, args );
  }

  getName(){
    return this.name;
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
        // Validate: Check project exists
        if (!SUtils.fileExistsSync(_this.getFilePath('s-project.json'))) {
          throw new SError('Project could not be loaded because it does not exist');
        }

        projectJson             = SUtils.readAndParseJsonSync(_this.getFilePath('s-project.json'));
        projectJson.components  = {};
        projectJson.templates   = {};
        projectContents         = fs.readdirSync(_this.getRootPath());

        return projectContents;
      })
      .each(function (c, i) {

        // If template, load template
        if (c.indexOf('s-template') !== -1) {
          projectJson.templates = _.assign(projectJson.templates, SUtils.readAndParseJsonSync(_this.getFilePath(c)));
          return;
        }

        // If component, load component
        if (SUtils.fileExistsSync(_this.getFilePath(c, 's-component.json'))) { // XXX

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

    let cPaths   = [],
      cfSnippets = [];

    return BbPromise.try(function() {

        if (_this.get().cloudFormation) {

          // TODO: Back Compat Support -- Remove in V1
          resources = _this.get().cloudFormation;

        } else if (SUtils.fileExistsSync(_this._S.getProject().getFilePath('s-resources-cf.json'))) {
          resources = SUtils.readAndParseJsonSync(_this._S.getProject().getFilePath('s-resources-cf.json'));
        }

        for (let c in _this.components) {
          cPaths.push(_this.components[c]._config.fullPath); // XXX
        }

        return cPaths;
      })
      .each(function (cPath) {

        // Check component root for s-resources.json extensions
        if (SUtils.fileExistsSync(path.join(cPath, 's-resources-cf.json'))) {
          let resourcesExtension = SUtils.readAndParseJsonSync(path.join(cPath, 's-resources-cf.json'));
          cfSnippets.push(resourcesExtension);
        }

        let cContents = fs.readdirSync(cPath);
        return BbPromise.resolve(cContents)
          .each(function (sf) {

            // Add s-resources-cf.json extensions
            if (SUtils.fileExistsSync(path.join(cPath, sf, 's-resources-cf.json'))) {
              let resourcesExtension = SUtils.readAndParseJsonSync(path.join(cPath, sf, 's-resources-cf.json'));
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

          // Merge Lambda Policy Statements - s-resources-cf.json uses different keys
          if (cf.LambdaIamPolicyStatements && cf.LambdaIamPolicyStatements.length > 0) {
            cf.LambdaIamPolicyStatements.forEach(function (policyStmt) {
              try {
                resources.Resources.IamPolicyLambda.Properties.PolicyDocument.Statement.push(policyStmt);
              }
              catch (e) {
              }
            });
          }

          // Merge Resources - s-resources-cf.json uses different keys
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

    return new BbPromise.try(function () {

      // If project folder does not exist, create it
      if (!SUtils.dirExistsSync(_this.getRootPath())) {
        fs.mkdirSync(_this.getRootPath());
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
        files.push(SUtils.writeFile(_this.getFilePath('s-project.json'),
          JSON.stringify(clone, null, 2)));

        // Write files
        return BbPromise.all(files);
      })
      .then(function () {
        return _this;
      })
  }

  /**
   * Get Functions
   * - Returns an array of this project's function instances
   * - Options:
   * - options.returnPath - return SPath of Function instead of Function object
   * - options.paths - array of function spaths to filter
   */

  getAllFunctions(options) {
    return SUtils.filterSPaths( _.flatten( _.map( _.values( this.components ), component =>
      component.getAllFunctions();
    )), options );
  }

  getFunction( path ){
    return _.find( this.getAllFunctions(), f =>
      f.getSPath().indexOf( path ) !== -1;
    )
  }

  /**
   * Get all components
   * - Returns an array of this project's components instances
   * - Options:
   * - options.paths - array of component spaths to filter
   */

  getAllComponents(options){
    return SUtils.filterSPaths( this.components, options );
  }

  getComponent( path ){
    return _.find( _.values( this.components ), c =>
        c.getSPath().indexOf( path ) !== -1;
    )
  }

  /**
   * Get Events
   * - Returns an array of this state's Events instances
   * - Options: paths, component, module, function, event name
   * - options.paths is an array of Serverless paths like this: ['component/module/function#eventName']
   */

  getEvents(options) {
    return SUtils.filterSPaths( _.flatten( _.map( this.getAllFunctions(), f => f.getAllEvents() ) ), options );
  }

  getEvent( path ){
    return _.find( _.values( this.getAllEvents() ), e =>
      e.getSPath().indexOf( path ) !== -1;
    )
  }
}

module.exports = ServerlessProject;