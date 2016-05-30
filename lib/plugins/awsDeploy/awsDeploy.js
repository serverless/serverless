'use strict';

const deployCore = require('./lib/deployCore');

class awsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    Object.assign(this, deployCore);
  }
}

module.exports = awsDeploy;
