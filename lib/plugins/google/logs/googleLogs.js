'use strict';

const BbPromise = require('bluebird');
const retrieveLogs = require('./lib/retrieveLogs');
const validate = require('../shared/validate');

class GoogleLogs {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('google');

    Object.assign(
      this,
      validate,
      retrieveLogs
    );

    this.hooks = {
      'before:logs:logs': () => BbPromise.bind(this)
        .then(this.validate),

      'logs:logs': () => BbPromise.bind(this)
        .then(this.retrieveLogs),
    };
  }
}

module.exports = GoogleLogs;
