'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  fs           = require('fs'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

class Templates {

  constructor(S, config) {
    this._S       = S;
    this._class   = 'Templates';
    this._config  = config;
    this._parents = [];
  }

  /**
   * Add Parent
   * - Parent templates which this template extends
   * - Format: {parent}
   */

  addParent(parent) {

  }

}

module.exports = Templates;
