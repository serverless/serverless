'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  _                     = require('lodash');

class Stage extends SerializerFileSystem {

  constructor(S, project, name) {
    super();

    this._S         = S;
    this._class     = 'Stage';
    this._project   = project;

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

  getRegions(){
    return Object.keys( this.regions );
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
}

module.exports = Stage;
