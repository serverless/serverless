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
    this._regions   = {};
    this._variables = new this._S.classes.Variables(this._S);

    this.name = name;
  }

  load() {
    return this.deserializeStage(this);
  }

  save() {
    return this.serializeStage(this);
  }

  getName(){
    return this.name;
  }

  getRegion( name ){
    return this._regions[ name ];
  }

  getRegions(){
    return Object.keys( this._regions );
  }

  hasRegion( name ){
    return this._regions[ name ] != undefined;
  }

  setRegion(region ){
    this._regions[ region.getName() ] = region;
  }

  removeRegion( name ){
    let region = this._regions[ name ];

    delete this._regions[ name ];

    return BbPromise.try(function(){
      if( region ){
        return region.destroy();
      }
    });
  }
}

module.exports = Stage;
