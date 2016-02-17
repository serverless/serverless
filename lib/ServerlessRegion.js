'use strict';

const SError     = require('./ServerlessError'),
  BbPromise    = require('bluebird'),
  VarContainer = require('./ServerlessVarContainer');

/**
 * This is the class which represents deployment Stage
 */

class ServerlessRegion extends VarContainer {
  constructor(S, stage, name) {
    super( S, stage, { region: name } );

    this.S = S;
    this._name = name;
    this._stage = stage;
  }

  getName(){
    return this._name;
  }

  save() {
    let _this = this;
    return BbPromise.try(function () {
      return _this.saveVarsToFile( `s-variables-${_this._stage.getName()}-${ServerlessRegion.regionNameToVarsFilename(_this.getName())}.json` );
    })
  }

  destroy(){

  }

  static regionNameToVarsFilename( name ){
    return name.replace(/-/g, '');
  }

  static varsFilenameToTegionName( name ){
    if( name === 'useast1' )      name = 'us-east-1';
    if( name === 'uswest2' )      name = 'us-west-2';
    if( name === 'euwest1' )      name = 'eu-west-1';
    if( name === 'apnortheast1' ) name = 'ap-northeast-1';

    return( name );
  }
}

module.exports = ServerlessRegion;
