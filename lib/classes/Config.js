'use strict'

const _ = require('lodash');

class Config {

  constructor(S, config) {
    this._class = 'Config';
    this.S = S;

    if (config) this.update(config);
  }

  update(config) {
    return _.merge(this, config);
  }
}

module.exports = Config;

