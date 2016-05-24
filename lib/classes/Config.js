'use strict';

const _ = require('lodash');
const path = require('path');

class Config {

  constructor(S, config) {
    this.S = S;
    this.serverlessPath = path.join(__dirname, '..');

    if (config) this.update(config);
  }

  update(config) {
    return _.merge(this, config);
  }
}

module.exports = Config;

