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

  getName() {
    return this.name;
  }

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {
    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    // Populate
    return SUtils.populate(this.getVariables(), this.getTemplates(), this.toObject(), options.stage, options.region);
  }

  fromObject(data) {
    return _.assign(this, data);
  }

  /**
   * Set Partials
   * - Optional: For file system serializer
   * Format: { path: "", partial: {} }
   */

  // TODO: Backwards Compatibility support.  Move to SerializerFileSystem and remove eventually

  _setPartial(m) {
    this._partials.push(m);
  }
}

module.exports = Resources;
