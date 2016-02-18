'use strict';

const SError           = require('./Error'),
  SUtils               = require('./utils/index'),
  SerializerFileSystem = require('./SerializerFileSystem'),
  fs                   = require('fs'),
  _                    = require('lodash'),
  BbPromise            = require('bluebird');

class Variables extends SerializerFileSystem  {

  constructor(S) {
    super();
    this._S     = S;
    this._class = 'Variables';
  }

  load() {
    return this.deserializeVariables(this);
  }

  save() {
    return this.serializeVariables(this);
  }

}

module.exports = Variables;
