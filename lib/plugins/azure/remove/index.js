'use strict';

const BbPromise = require('bluebird');
const removeResourceGroup = require('./lib/removeResourceGroup');
const validateInput = require('./lib/validateInput');

class AzureRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      validateInput,
      removeResourceGroup
    );

    this.hooks = {
      'remove:remove': () =>
        BbPromise.bind(this)
          .then(this.validateInput)
          .then(this.remove)
          .then(() => this.serverless.cli.log('Resource removal successful!')),
    };
  }
}

module.exports = AzureRemove;
