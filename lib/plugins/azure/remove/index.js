'use strict';

const BbPromise           = require('bluebird');
const removeResourceGroup = require('./lib/removeResourceGroup');
const azureCLI = require('./utils/azureCli');

class AzureRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'remove:remove': () => {
        return BbPromise.bind(this)
          .then(this.validateInput)
          .then(() => azureCLI.deleteResourceGroup(`${this.serverless.service.service}-${this.options.stage}`))
          .then(this.removeStack)
          .then(() => this.serverless.cli.log('Resource removal successful!'));
      },
    };
  }
}
