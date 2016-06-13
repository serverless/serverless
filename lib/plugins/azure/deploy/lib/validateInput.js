'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validateInput() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service');
    }

    // Todo: Validate Input, ensure everything is a-ok

    return BbPromise.resolve();
  },
};
