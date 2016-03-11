'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  _                     = require('lodash'),
  fs                    = require('fs'),
  os                    = require('os');

let SUtils;

class Project extends SerializerFileSystem {

  constructor(S, data) {

    super(S);

    SUtils = S.utils;

    let _this             = this;
    _this._S              = S;
    _this._class          = 'Project';

    // Default properties
    _this.name            = 'serverless' + SUtils.generateShortId(6);
    _this.custom          = {};
    _this.plugins         = [];
    _this.functions       = {};
    _this.stages          = {};
    _this.resources       = {
      defaultResources:   new this._S.classes.Resources(this._S, {}, this.getRootPath('s-resources-cf.json'))
    };  // This is an object because in the near future, we will introduce multiple resources stacks within a project
    _this.variables       = new this._S.classes.Variables(this._S, {}, this.getRootPath('_meta', 'variables', 's-variables-common.json'));
    _this.templates       = new this._S.classes.Templates(this._S, {}, this.getRootPath('s-templates.json'));

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
    let functions, resources;
    if (this.functions) {
      functions = _.mapValues(this.functions, (f) => f.toObjectPopulated(options));
      delete obj.functions;
    }
    if (this.resources)  {
      resources  = _.mapValues(this.resources, (r) => r.toObjectPopulated(options));
      delete obj.resources;
    }

    // Populate
    let populated = SUtils.populate(this, this.getTemplates().toObject(), obj, options.stage, options.region);
    if (functions) populated.functions = functions;
    if (resources) populated.resources   = resources;

    return populated;
  }

  fromObject(data) {

    let _this = this;

    if (data.functions) {
      let temp  = {};
      for (let f of Object.keys(data.functions)) {
        if (this.functions[f]) {
          temp[f] = this.functions[f].fromObject(data.functions[f]);
        } else {
          temp[f] = new _this._S.classes.Function(_this._S, _this, data.functions[f]);
        }
      }
      delete data.functions;
      this.functions = temp;
    }
    if (data.stages) {
      let temp  = {};
      for (let s of Object.keys(data.stages)) {
        if (this.stages[s]) {
          temp[s] = this.stages[s].fromObject(data.stages[s]);
        } else {
          temp[s] = new this._S.classes.Stage(this._S, this, data.stages[s]);
        }
      }
      delete data.stages;
      this.stages = temp;
    }
    if (data.variables) {
      this.variables.fromObject(data.variables);
      delete data.variables;
    }
    if (data.templates) {
      this.templates.fromObject(data.templates);
      delete data.templates;
    }
    if (data.resources) {
      let temp  = {};
      for (let r of Object.keys(data.resources)) {
        if (this.resources[r]) {
          temp[r] = this.resources[r].fromObject(data.resources[r]);
        } else {
          temp[r] = new _this._S.classes.Resources(_this._S, data.resources[r]);
        }
      }
      delete data.resources;
      this.resources = temp;
    }
    _.assign(_this, data);
    return _this;
  }

  getFilePath() {
    return path.join(this._S.config.projectPath, 's-project.json');
  }

  getRootPath() {
    let args = _.toArray( arguments );
    args.unshift(path.dirname(this.getFilePath()));
    return path.join.apply( path, args );
  }

  getName() {
    return this.name;
  }

  getAllFunctions() {
    return _.values( this.functions );
  }

  getFunction( functionName ){
    return _.find( _.values( this.functions ), f => {
      return f.getName() === functionName;
    });
  }

  setFunction( func ) {
    this.functions[ func.name ] = func;
  }

  getAllPlugins(){
    return this.plugins;
  }

  addPlugin( pluginName ){
    this.plugins.push( pluginName );
  }

  getAllEndpoints() {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEndpoints() ) );
  }

  getEndpoint(endpointName){
    return _.find( _.values( this.getAllEndpoints() ), e =>
      e.getName() === endpointName
    )
  }

  getEndpointsByNames(names) {
    let _this = this;
    let endpoints = [];
    names.forEach(function(name) {
      let endpoint = _this.getEndpoint(name);
      if (!endpoint) throw new SError(`Endpoint "${name}" doesn't exist in your project`);
      endpoints.push(endpoint);
    });
    return endpoints;
  }

  getAllEvents() {
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

  getAllRegionNames(stageName){
    return _.map(this.getAllRegions(stageName), 'name');
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