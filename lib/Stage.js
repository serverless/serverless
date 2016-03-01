'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  _                     = require('lodash');

let SUtils;

class Stage extends SerializerFileSystem {

  constructor(S, project, data, config) {

    super(S);

    SUtils          = S.utils;

    if (!S || !project || !data) throw new SError('Missing required parameters');

    this._S         = S;
    this._class     = 'Stage';
    this._config    = config || {};
    this._project   = project;

    // Set Defaults
    this.name      = data.name;
    this.regions   = {};
    this.variables = new this._S.classes.Variables(this._S);

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

  fromObject(data) {

    // Regions
    if (data.regions) {
      _.each(data.regions, (regionData, regionName) => {
        let region = new this._S.classes.Region(this._S, this, regionData);
        this.setRegion(region);
      });

      delete data.regions;
    }

    // Variables
    if (data.variables) {
     this.variables = new this._S.classes.Variables(this._S, data.variables);
      delete data.variables;
    }

    return _.assign(this, data);
  }

  getName() {
    return this.name;
  }

  getRegion( name ){
    return this.regions[ name ];
  }

  getAllRegions() {
    let regions = [];
    for (let i = 0; i < Object.keys(this.regions).length; i++) {
      regions.push(this.regions[Object.keys(this.regions)[i]]);
    }
    return regions;
  }

  hasRegion( name ){
    return this.regions[ name ] != undefined;
  }

  setRegion(region ){
    this.regions[ region.getName() ] = region;
  }

  removeRegion( region ){
    delete this.regions[ region ];
  }

  getVariables() {
    return this.variables;
  }

  setVariables(variables) {
    this.variables = variables;
  }

  addVariables(variablesObj) {
    return this.getVariables().fromObject(variablesObj);
  }

  getProject() {
    return this._project;
  }
}

module.exports = Stage;
