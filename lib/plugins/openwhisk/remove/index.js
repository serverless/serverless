'use strict';

const BbPromise = require('bluebird');
const validate = require('./lib/validate');
const removeFunctions = require('./lib/removeFunctions');
const removeTriggers = require('./lib/removeTriggers');

class OpenWhiskRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    Object.assign(this, validate, removeFunctions, removeTriggers);

    this.hooks = {
      'remove:remove': () => BbPromise.bind(this)
          .then(this.validate)
          .then(this.removeFunctions)
          .then(this.removeTriggers)
          .then(() => this.serverless.cli.log('Resource removal successful!')),
    };
  }
}

module.exports = OpenWhiskRemove;
