'use strict';

const SError           = require('./Error'),
  SerializerFileSystem = require('./SerializerFileSystem'),
  fs                   = require('fs'),
  _                    = require('lodash'),
  BbPromise            = require('bluebird');

let SUtils;

class Variables extends SerializerFileSystem  {

  constructor(S, data, filePath) {
    super(S);

    SUtils = S.utils;

    this._S        = S;
    this._class    = 'Variables';
    this._filePath = filePath;

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
    return _.merge(this, data);
  }

  getFilePath() {
    return this._filePath;
  }

  getRootPath() {
    let args = _.toArray( arguments );
    args.unshift(path.dirname(this.getFilePath()));
    return path.join.apply( path, args );
  }
}

module.exports = Variables;
