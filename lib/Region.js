'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird');

let SUtils;

class Region extends SerializerFileSystem {

  constructor(S, stage, data) {
    super(S);

    if (!S || !stage || !data) throw new SError('Missing required parameters');

    this._S         = S;
    this._class     = 'Region';
    this._stage     = stage;
    SUtils          = S.utils;

    this.name       = data.name;
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

  setVariables(variables) {
    return this.variables = variables;
  }

  destroy() {} // TODO: Finish

  static regionNameToVarsFilename( name ){
    return name.replace(/-/g, '');
  }

  static varsFilenameToRegionName(name ){
    if( name.includes('useast1') )      return 'us-east-1';
    if( name.includes('uswest2') )      return 'us-west-2';
    if( name.includes('euwest1') )      return 'eu-west-1';
    if( name.includes('apnortheast1') ) return 'ap-northeast-1';
  }
}

module.exports = Region;
