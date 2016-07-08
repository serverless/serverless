'use strict';

const _ = require('lodash');
const path = require('path');
const util = require('util');
const debug = require('debug')('Config.js');

class Config {

  constructor(serverless, config) {
    this.serverless = serverless;
    this.serverlessPath = path.join(__dirname, '..');

    if (config) this.update(config);

    debug(`Running Serverless with config: ${util.inspect(config, false, null)}`);
  }

  update(config) {
    return _.merge(this, config);
  }
}

module.exports = Config;

