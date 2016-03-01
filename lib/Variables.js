'use strict';

const SError           = require('./Error'),
  SerializerFileSystem = require('./SerializerFileSystem'),
  fs                   = require('fs'),
  _                    = require('lodash'),
  BbPromise            = require('bluebird');

let SUtils;

class Variables extends SerializerFileSystem  {

  constructor(S, data, config) {
    super(S);

    SUtils = S.utils;

    this._S      = S;
    this._class  = 'Variables';
    this._config = config || {};

    if (data) this.fromObject(data);
  }

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  fromObject(data) {
    return _.merge(this, data);
  }
}

module.exports = Variables;
