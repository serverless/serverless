'use strict';

const _ = require('lodash');

class Config {

  constructor(S, config) {
    this.S = S;

    if (config) this.update(config);
  }

  update(config) {
    return _.merge(this, config);
  }
}

module.exports = Config;

