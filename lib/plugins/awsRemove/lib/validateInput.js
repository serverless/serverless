'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validateInput() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    return BbPromise.resolve();
  },
};
