'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird');

let SUtils;

class Region extends SerializerFileSystem {

  constructor(S, stage, name) {
    super(S);

    if (!S || !stage || !name) throw new SError('Missing required parameters');

    this._S         = S;
    this._class     = 'Region';
    this._stage     = stage;
    SUtils          = S.utils;

    this.name       = name;
    this.variables  = new this._S.classes.Variables(this._S);
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

  getStage() {
    return this._stage;
  }

  getProject() {
    return this._S._project;
  }

  getVariables() {
    return this.variables;
  }

  destroy() {} // TODO: Finish

  static regionNameToVarsFilename( name ){
    return name.replace(/-/g, '');
  }

  static varsFilenameToRegionName(name ){
    if( name === 'useast1' )      name = 'us-east-1';
    if( name === 'uswest2' )      name = 'us-west-2';
    if( name === 'euwest1' )      name = 'eu-west-1';
    if( name === 'apnortheast1' ) name = 'ap-northeast-1';

    return( name );
  }
}

module.exports = Region;
