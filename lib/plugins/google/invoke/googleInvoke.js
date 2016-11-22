'use strict';

const BbPromise = require('bluebird');
const invokeFunction = require('./lib/invokeFunction');
const validate = require('../shared/validate');

class GoogleInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('google');

    Object.assign(
      this,
      validate,
      invokeFunction
    );

    this.hooks = {
      'before:invoke:invoke': () => BbPromise.bind(this)
        .then(this.validate),

      'invoke:invoke': () => BbPromise.bind(this)
        .then(this.invokeFunction),
    };
  }
}

module.exports = GoogleInvoke;
