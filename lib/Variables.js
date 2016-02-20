'use strict';

const SError           = require('./Error'),
  SUtils               = require('./utils/index'),
  SerializerFileSystem = require('./SerializerFileSystem'),
  fs                   = require('fs'),
  _                    = require('lodash'),
  BbPromise            = require('bluebird');

class Variables extends SerializerFileSystem  {

  constructor(S) {
    super(S);
    this._S     = S;
    this._class = 'Variables';
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
}

module.exports = Variables;
