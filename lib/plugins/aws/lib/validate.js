'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes
        .Error('This command can only be run inside a service directory');
    }

    this.options.stage = this.options.stage
      || (this.serverless.service.provider && this.serverless.service.provider.stage)
      || 'dev';
    this.options.region = this.options.region
      || (this.serverless.service.provider && this.serverless.service.provider.region)
      || 'us-east-1';

    return BbPromise.resolve();
  },
};
