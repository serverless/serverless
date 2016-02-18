'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  fs           = require('fs'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');


class Resources {

  constructor(S, config) {
    this._S       = S;
    this._class   = 'Resources';
    this._config  = config;
    this._modules = [];
  }

  setModule(m) {
    this._modules.push(m);
  }

}

module.exports = Resources;
