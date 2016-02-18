'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  fs           = require('fs'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

class Templates {

  constructor(S, config) {
    this._S      = S;
    this._config = config;
  }
}

module.exports = Templates;
