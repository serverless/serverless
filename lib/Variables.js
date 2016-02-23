'use strict';

const SError           = require('./Error'),
  SUtils               = require('./utils/index'),
  SerializerFileSystem = require('./SerializerFileSystem'),
  fs                   = require('fs'),
  _                    = require('lodash'),
  BbPromise            = require('bluebird');

class Variables extends SerializerFileSystem  {

  constructor(S, config) {
    super(S);
    this._S     = S;
    this._class = 'Variables';
    this.updateConfig(config);
  }

  updateConfig(config) {
    if (config) this._config = _.merge(this._config, config);
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
}

module.exports = Variables;
