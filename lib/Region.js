'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird');

class Region extends SerializerFileSystem {

  constructor(S, stage, name) {
    super();

    this._S         = S;
    this._class     = 'Region';
    this._stage     = stage;
    this._variables = new this._S.classes.Variables();

    this.name       = name;
  }

  load() {
    return this.deserializeRegion(this);
  }

  save() {
    return this.serializeRegion(this);
  }

  getName() {
    return this.name;
  }

  getStage() {
    return this._stage;
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
