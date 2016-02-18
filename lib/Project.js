'use strict';

/**
 * Serverless Project Class
 */

const SError       = require('./Error'),
  SUtils           = require('./utils/index'),
  SCli             = require('./utils/cli'),
  SerializerFileSystem = require('./SerializerFileSystem'),
  BbPromise        = require('bluebird'),
  path             = require('path'),
  _                = require('lodash'),
  fs               = require('fs'),
  os               = require('os');

class Project extends SerializerFileSystem {

  /**
   * Constructor
   */

  constructor(S) {

    super(S);

    let _this = this;

    _this._S          = S;
    _this._components = {};
    _this._resources  = {};
    _this._templates  = {};
    _this._stages     = {};
    _this._variables  = {};

    // Default properties
    _this.name            = 'serverless' + SUtils.generateShortId(6);
    _this.version         = '0.0.1';
    _this.profile         = 'serverless-v' + require('../package.json').version;
    _this.location        = 'https://github.com/...';
    _this.author          = '';
    _this.description     = 'A Slick New Serverless Project';
    _this.custom          = {};
    _this.plugins         = [];
  }

  /**
   * Project Methods --------------------------------------------------
   */

  /**
   * Load
   * - Return promise
   */

  load() {
    return this.deserializeProject(this);
  }

  /**
   * Save
   * - Returns promise
   */

  save(options) {
    return this.serializeProject(this, options);
  }

  /**
   * To JSON
   * - Returns clone of data
   */

  toJson() {
    let clone = _.cloneDeep(this);
    return SUtils.exportClassData(clone);
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   * - Returns Promise
   * TODO: refactor
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

  getName(){
    return this.name;
  }

  /**
   * Component Methods ----------------------------------------------------------------------------
   */

  /**
   * Set Component
   */

  setComponent( component ){
    this.components[ component.name ] = component;
  }

  /**
   * Get Component
   */

  getComponent( cpath ){
    return _.find( _.values( this.components ), c =>
      c.getSPath().indexOf( cpath.split(path.sep)[0] ) === 0
    )
  }

  /**
   * Get All Components
   * - Returns an array of this project's components instances
   * - options.paths - array of component spaths to filter
   */

  getAllComponents(options){
    if( _.get( options, 'paths' ) ){
      options.paths = _.map( options.paths, p => p.split(path.sep)[0] );
    }
    return SUtils.filterSPaths( _.values( this.components ), options );
  }

  getPlugins(){
    return this.plugins;
  }

  /**
   * Plugin Methods ----------------------------------------------------------------------------
   */

  addPlugin( pluginName ){
    this.plugins.push( pluginName );
  }

  /**
   * Function Methods ----------------------------------------------------------------------------
   */

  /**
   * Get Functions
   * - Returns an array of this project's function instances
   * - Options:
   * - options.returnPath - return SPath of Function instead of Function object
   * - options.paths - array of function spaths to filter
   */

  getAllFunctions(options) {
    return SUtils.filterSPaths( _.flatten( _.map( _.values( this.components ), component =>
      component.getAllFunctions()
    )), options );
  }

  getFunction( path ){
    return _.find( this.getAllFunctions(), f =>
      f.getSPath().indexOf( path ) === 0
    )
  }

  /**
   * Endpoint Methods ----------------------------------------------------------------------------
   */

  /**
   * Get Endpoints
   * - Returns an array of this project's Endpoint instances
   * - Options: paths
   * - options.paths is an array of Serverless paths like this: ['component/module/function#eventName']
   */

  getAllEndpoints(options) {
    return SUtils.filterSPaths( _.flatten( _.map( this.getAllFunctions(), f => f.getAllEndpoints() ) ), options );
  }

  getEndpoint( path ){
    return _.find( _.values( this.getAllEndpoints() ), e =>
      e.getSPath().indexOf( path ) === 0
    )
  }

  /**
   * Event Methods ----------------------------------------------------------------------------
   */

  /**
   * Get Events
   * - Returns an array of this project's Events instances
   * - options.paths is an array of Serverless paths like this: ['component/module/function#eventName']
   */

  getAllEvents(options) {
    return SUtils.filterSPaths( _.flatten( _.map( this.getAllFunctions(), f => f.getAllEvents() ) ), options );
  }

  getEvent( path ){
    return _.find( _.values( this.getAllEvents() ), e =>
      e.getSPath().indexOf( path ) === 0
    )
  }

  /**
   * Resource Methods ----------------------------------------------------------------------------
   */

  setResources(resources) {
    this._resources = resources;
  }

  /**
   * Get Resources
   * - Returns Promise & clone of resources
   * - TODO: Make Get Local Resources Only, then make another method for combined resources
   */

  getResources(options) {

    let _this = this,
      resources;
    options = options || {};

    return BbPromise.try(function() {

        if (_this.get().cloudFormation) {

          // TODO: Back Compat Support -- Remove in V1
          resources = _this.get().cloudFormation;

        } else if (SUtils.fileExistsSync(_this._S.getProject().getFilePath('s-resources-cf.json'))) {
          resources = SUtils.readAndParseJsonSync(_this._S.getProject().getFilePath('s-resources-cf.json'));
        }

        return _.flatten( _.map( _.values( _this.components ), c => c.getCFSnippets() ) );
      })
      .then(function (cfSnippets) {

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
   * Stage Methods ----------------------------------------------------------------------------
   */

  getStages() {
    return Object.keys( this._stages );
  }

  getStage( name ) {
    return this._stages[ name ];
  }

  setStage(stage ) {
    this._stages[ stage.getName() ] = stage;
  }

  removeStage( name ) {
    let stage = this._stages[ name ];

    delete this._stages[ name ];

    return BbPromise.try(function(){
      if( stage ){
        return stage.destroy();
      }
    });
  }

  validateStageExists( name ){
    return this._stages[ name ] != undefined;
  }

  saveStages(){
    let _this = this;

    return BbPromise.each( _.values( _this._stages ), function(stage){
      stage.save();
    });
  }

  /**
   * Region Methods ----------------------------------------------------------------------------
   */

  getRegion( stageName, regionName ){
    if( this.hasStage( stageName ) ){
      let stage = this.getStage( stageName );

      if( stage.hasRegion( regionName ) ){
        return stage.getRegion( regionName );
      } else {
        throw new SError(`Region ${regionName} doesnt exist in stage ${stageName}!`);
      }
    } else {
      throw new SError(`Stage ${stageName} doesnt exist in this project!`);
    }
  }

  setRegion(stageName, region){
    let stage = this.getStage(stageName);
    stage.setRegion(region);
  }

  getRegions( stageName ){
    return this.getStage( stageName ).getRegions();
  }

  validateRegionExists( stageName, regionName ){
    let stage = this.getStage( stageName );

    if( stage ){
      return stage.hasRegion( regionName );
    } else {
      return false;
    }
  }

  /**
   * Template Methods ----------------------------------------------------------------------------
   */

  /**
   * Get Templates
   */

  getTemplates() {
    return this._templates;
  }

  /**
   * Variable Methods ----------------------------------------------------------------------------
   */

  /**
   * Get Variables
   */

  getVariables() {
    return this._variables;
  }
}

module.exports = Project;