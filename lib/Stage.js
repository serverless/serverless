'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  _                     = require('lodash');

let SUtils;

class Stage extends SerializerFileSystem {

  constructor(S, project, name) {

    super(S);

    if (!S || !project || !name) throw new SError('Missing required parameters');

    this._S         = S;
    this._class     = 'Stage';
    this._project   = project;
    SUtils          = S.utils;

    // Set Defaults
    this.name      = name;
    this.regions   = {};
    this.variables = new this._S.classes.Variables(this._S);
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

  removeRegion( name ){
    let region = this.regions[ name ];

    delete this.regions[ name ];

    return BbPromise.try(function(){
      if( region ){
        return region.destroy();
      }
    });
  }

  destroy(){}

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
