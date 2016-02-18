'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird');

class Region extends SerializerFileSystem {

  constructor(S, stage, name) {
    super();

    this._S = S;
    this._stage = stage;

    this.name = name;
  }

  getName(){
    return this.name;
  }

  save() {
    let _this = this;
    return BbPromise.try(function () {
      return _this.saveVarsToFile( `s-variables-${_this._stage.getName()}-${Region.regionNameToVarsFilename(_this.getName())}.json` );
    })
  }

  destroy() {

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

module.exports = Region;
