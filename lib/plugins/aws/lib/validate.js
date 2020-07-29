'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validate() {
    if (!this.serverless.config.servicePath) {
      const error = new this.serverless.classes.Error(
        'This command can only be run inside a service directory'
      );
      return BbPromise.reject(error);
    }

    this.options.stage = this.provider.getStage();
    this.options.region = this.provider.getRegion();

    return BbPromise.resolve();
  },
};
