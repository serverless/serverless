'use strict';

const BbPromise = require('bluebird');
const validate = require('./lib/validate');
const remove = require('./lib/remove');

class OpenWhiskRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    Object.assign(this, validate, remove);

    this.hooks = {
      'remove:remove': () => BbPromise.bind(this)
          .then(this.validate)
          .then(this.remove)
          .then(() => this.serverless.cli.log('Resource removal successful!')),
    };
  }
}

module.exports = OpenWhiskRemove;
