'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes
        .Error('This command can only be run inside a service directory');
    }

    this.options.stage = this.provider.getStage();
    this.options.region = this.provider.getRegion();

    return BbPromise.resolve();
  },
};
