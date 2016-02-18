'use strict';

/**
 * Serverless Project Class
 */

const SError            = require('./Error'),
  SUtils                = require('./utils/index'),
  SCli                  = require('./utils/cli'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  _                     = require('lodash'),
  fs                    = require('fs'),
  os                    = require('os');

class Project extends SerializerFileSystem {

  /**
   * Constructor
   */

  constructor(S) {

    super();

    let _this             = this;
    _this._S              = S;
    _this._class          = 'Project';

    // Default properties
    _this.name            = 'serverless' + SUtils.generateShortId(6);
    _this.version         = '0.0.1';
    _this.profile         = 'serverless-v' + require('../package.json').version;
    _this.location        = 'https://github.com/...';
    _this.author          = '';
    _this.description     = 'A Slick New Serverless Project';
    _this.custom          = {};
    _this.plugins         = [];
    _this.components      = {};
    _this.resources       = {};
    _this.stages          = {};
    _this.variables       = {};
    _this.templates       = {};
  }

  /**
   * Load
   * - Return promise
   */

  load() {
    return this.deserialize(this);
  }

  /**
   * Save
   * - Returns promise
   */

  save(options) {
    return this.serialize(this, options);
  }

  /**
   * To Object
   * - Returns a raw object
   */

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  /**
   * toObjectPopulated
   * - Fill in templates then variables
   * - Returns Promise
   */

  toObjectPopulated(options) {

    let _this = this;
    options   = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

  }

  fromObject() {

  }

  getName(){
    return this.name;
  }

  getComponent( componentName ){
    return _.find( _.values( this.components ), c => {
      return c.getName() === componentName;
    });
  }

  /**
   * Get All Components
   */

  getAllComponents(options) {
    return _.values( this.components );
  }

  setComponent( component ) {
    this.components[ component.name ] = component;
  }

  getPlugins(){
    return this.plugins;
  }

  addPlugin( pluginName ){
    this.plugins.push( pluginName );
  }

  /**
   * Get All Functions
   * - Returns an array of this project's function instances
   */

  getAllFunctions(options) {
    return _.flatten( _.map( this.getAllComponents(), component =>
      component.getAllFunctions()
    ));
  }

  getFunction( functionName ){
    return _.find( this.getAllFunctions(), f =>
      f.getName() === functionName
    )
  }

  /**
   * Get Endpoints
   * - Returns an array of this project's Endpoint instances
   */

  getAllEndpoints(options) {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEndpoints() ) );
  }

  getEndpoint( endpointPath, endpointMethod ){
    return _.find( _.values( this.getAllEndpoints() ), e =>
      e.path === endpointPath && e.method === endpointMethod
    )
  }

  /**
   * Get Events
   * - Returns an array of this project's Events instances
   */

  getAllEvents(options) {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEvents() ) );
  }

  getEvent( eventName ){
    return _.find( _.values( this.getAllEvents() ), e =>
      e.name === eventName
    )
  }

  setResources(resources) {
    this.resources = resources;
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

  getStages() {
    return Object.keys( this.stages );
  }

  getStage( name ) {
    return this.stages[ name ];
  }

  setStage(stage ) {
    this.stages[ stage.getName() ] = stage;
  }

  removeStage( name ) {
    let stage = this.stages[ name ];

    delete this.stages[ name ];

    return BbPromise.try(function(){
      if( stage ){
        return stage.destroy();
      }
    });
  }

  validateStageExists( name ){
    return this.stages[ name ] != undefined;
  }

  saveStages(){
    let _this = this;

    return BbPromise.each( _.values( _this.stages ), function(stage){
      stage.save();
    });
  }

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

  getVariables() {
    return this.variables;
  }
}

module.exports = Project;