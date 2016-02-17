'use strict';

const SError   = require('./ServerlessError'),
  BbPromise    = require('bluebird'),
  _            = require('lodash'),
  VarContainer = require('./ServerlessVarContainer');

/**
 * This is the class which represents deployment Stage
 */

class ServerlessStage extends VarContainer {
  constructor(S, project, name) {
    super( S, project, { stage: name } );

    this.S = S;
    this._name = name;
    this._regions = {};
  }

  save(){
    let _this = this;
    return BbPromise.try(function(){
      return _this.saveVarsToFile( `s-variables-${_this.getName()}.json` );
    })
    .then(function(){
      BbPromise.each( _.values(_this._regions), function(region){
        return region.save();
      });
    });
  }

  getName(){
    return this._name;
  }

  getRegion( name ){
    return this._regions[ name ];
  }

  getRegionNames(){
    return Object.keys( this._regions );
  }

  hasRegion( name ){
    return this._regions[ name ] != undefined;
  }

  addRegion( region ){
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

module.exports = ServerlessStage;
