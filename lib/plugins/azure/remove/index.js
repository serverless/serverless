'use strict';

const BbPromise           = require('bluebird');
const removeResourceGroup = require('./lib/removeResourceGroup');

class AzureRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'remove:remove': () => {
        // Todo: Handle removal (get rid of the *whole* thing)

        return BbPromise.bind(this)
          .then(this.validateInput)
          // Todo: If we pair Storage Accounts with
          // Resource Groups, we should empty/delete
          // them here
          .then(this.removeStack)
          .then(() => this.serverless.cli.log('Resource removal successful!'));
      }
    };
  }
}
