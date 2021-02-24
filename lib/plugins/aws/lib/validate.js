'use strict';

const ServerlessError = require('../../../serverless-error');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new ServerlessError('This command can only be run inside a service directory');
    }

    this.options.stage = this.provider.getStage();
    this.options.region = this.provider.getRegion();
  },
};
