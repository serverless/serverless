'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  fs           = require('fs'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

class Resources {

  constructor(S, config) {
    this._S        = S;
    this._class    = 'Resources';
    this._config   = config;
    this._partials = [];
    this.name      = 'resources-' + SUtils.generateShortId(4);
  }

  load() {
    return this.deserialize(this);
  }

  save() {
    return this.serialize(this);
  }

  toObject() {}

  toObjectPopulated() {}

  /**
   * Set Partials
   * - Optional: For file system serializer
   * Format: { path: "", partial: {} }
   */

  _setPartial(m) {
    this._partials.push(m);
  }

}

module.exports = Resources;
