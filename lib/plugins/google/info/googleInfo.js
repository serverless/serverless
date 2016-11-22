'use strict';

const BbPromise = require('bluebird');
const displayServiceInfo = require('./lib/displayServiceInfo');
const validate = require('../shared/validate');

class GoogleInfo {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('google');

    Object.assign(
      this,
      validate,
      displayServiceInfo
    );

    this.hooks = {
      'before:info:info': () => BbPromise.bind(this)
        .then(this.validate),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.displayServiceInfo),

      'info:info': () => BbPromise.bind(this)
        .then(this.displayServiceInfo),
    };
  }
}

module.exports = GoogleInfo;
