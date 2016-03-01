'use strict';

const SError            = require('./Error'),
  SCli                  = require('./utils/cli'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  _                     = require('lodash'),
  fs                    = require('fs'),
  os                    = require('os');

let SUtils;

class Project extends SerializerFileSystem {

  constructor(S, data, config) {

    super(S);

    SUtils = S.utils;

    let _this             = this;
    _this._S              = S;
    _this._class          = 'Project';
    _this._config         = config || {};

    // Default properties
    _this.name            = 'serverless' + SUtils.generateShortId(6);
    _this.version         = '0.0.1';
    _this.location        = 'https://github.com/...';
    _this.author          = '';
    _this.description     = 'A Slick New Serverless Project';
    _this.custom          = {};
    _this.plugins         = [];
    _this.components      = {};
    _this.stages          = {};
    _this.resources       = {
      defaultResources:   new this._S.classes.Resources(this._S)
    };  // This is an object because in the near future, we will introduce multiple resources stacks within a project
    _this.variables       = new this._S.classes.Variables(this._S);
    _this.templates       = new this._S.classes.Templates(this._S);

    if (data) this.fromObject(data);
  }

  load() {
    return this.deserialize(this);
  }

  save() {
    return this.serialize(this);
  }

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {
    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    let obj = this.toObject();

    // Populate Sub-Assets Separately
    let components, resources;
    if (this.components) {
      components = _.mapValues(this.components, (c) => c.toObjectPopulated(options));
      delete obj.components;
    }
    if (this.resources)  {
      resources  = _.mapValues(this.resources, (r) => r.toObjectPopulated(options));
      delete obj.resources;
    }

    // Populate
    let populated = SUtils.populate(this, this.getTemplates().toObject(), this.toObject(), options.stage, options.region);
    if (components) populated.components = components;
    if (resources) populated.resources   = resources;

    return populated;
  }

  fromObject(data) {

    let _this = this;

    // Flush data
    _this.components   = {};
    _this.stages       = {};
    _this.variables    = {};
    _this.templates    = {};
    _this.resources    = {};

    if (data.components) {
      for (let c of Object.keys(data.components)) {
        let componentClass = new _this._S.classes.Component(_this._S, _this, data.components[c]);
        this.setComponent(componentClass.fromObject(data.components[c]));
      }
      delete data.components;
    }
    if (data.stages) {
      for (let s of Object.keys(data.stages)) {
        let stageClass = new this._S.classes.Stage(this._S, this, data.stages[s]);
        this.setStage(stageClass.fromObject(data.stages[s]));
      }
      delete data.stages;
    }
    if (data.variables) {
      let variableClass = new _this._S.classes.Variables(_this._S);
      this.setVariables(variableClass.fromObject(data.variables));
      delete data.variables;
    }
    if (data.templates) {
      let templatesClass = new _this._S.classes.Templates(_this._S);
      this.setTemplates(templatesClass.fromObject(data.templates));
      delete data.templates;
    }
    if (data.resources) {

      for (let r of Object.keys(data.resources)) {
        let resourcesClass = new _this._S.classes.Resources(_this._S);
        this.setResources(resourcesClass.fromObject(data.resources[r]));
      }
      delete data.resources;
    }
    _.assign(_this, data);

    return _this;
  }

  getFilePath() {
    return this._S.config.projectPath;
  }

  getRootPath() {
    let args = _.toArray( arguments );
    console.log(this.getFilePath())
    args.unshift(path.dirname(this.getFilePath()));
    return path.join.apply( path, args );
  }

  getName() {
    return this.name;
  }

  getAllComponents() {
    return _.values( this.components );
  }

  getComponent( componentName ){
    return _.find( _.values( this.components ), c => {
      return c.getName() === componentName;
    });
  }

  setComponent( component ) {
    this.components[ component.name ] = component;
  }

  validateComponentExists( component ){
    return this.components[ component ] != undefined;
  }

  getAllPlugins(){
    return this.plugins;
  }

  addPlugin( pluginName ){
    this.plugins.push( pluginName );
  }

  getAllFunctions() {
    return _.flatten( _.map( this.getAllComponents(), component =>
      component.getAllFunctions()
    ));
  }

  getFunction( functionName ){
    return _.find( this.getAllFunctions(), f =>
      f.getName() === functionName
    )
  }

  getAllEndpoints(options) {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEndpoints() ) );
  }

  getEndpoint( endpointPath, endpointMethod ){
    return _.find( _.values( this.getAllEndpoints() ), e =>
      e.path === endpointPath && e.method === endpointMethod
    )
  }

  getAllEvents(options) {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEvents() ) );
  }

  getEvent( eventName ){
    return _.find( _.values( this.getAllEvents() ), e =>
      e.name === eventName
    )
  }

  getResources() {
    return this.resources.defaultResources;
  }

  setResources(resources) {
    this.resources[ resources.getName() ] = resources;
  }


  getAllResources(resourcesName) {
    if (this.resources[resourcesName]) return this.resources[resourcesName];
    else return this.resources[Object.keys(this.resources)[0]]; // This temporarily defaults to a single resource stack for backward compatibility
  }

  getAllStages() {
    let stages = [];
    for (let i =0; i < Object.keys(this.stages).length; i++) {
      stages.push(this.stages[Object.keys(this.stages)[i]]);
    }
    return stages;
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
  }

  validateStageExists( name ){
    return this.stages[ name ] != undefined;
  }

  getRegion( stageName, regionName ){
    if( this.getStage( stageName ) ){
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

  getAllRegions(stageName ){
    return this.getStage( stageName ).getAllRegions();
  }

  setRegion(stageName, region){
    let stage = this.getStage(stageName);
    stage.setRegion(region);
  }

  validateRegionExists(stageName, regionName) {
    let stage = this.getStage( stageName );

    if( stage ){
      return stage.hasRegion( regionName );
    } else {
      return false;
    }
  }

  setVariables(variables) {
    this.variables = variables;
  }

  getVariables() {
    return this.variables;
  }

  getVariablesObject(stage, region) {
    let vars        = this.getVariables().toObject();
    if(stage) stage = this.getStage(stage);
    if(stage && region) region = stage.getRegion(region);
    vars = _.merge(vars, stage ? stage.getVariables().toObject() : {}, region ? region.getVariables().toObject() : {});
    return vars;
  }

  addVariables(variablesObj) {
    return this.getVariables().fromObject(variablesObj);
  }

  setTemplates(templates) {
    this.templates = templates;
  }

  getTemplates() {
    return this.templates;
  }
}

module.exports = Project;