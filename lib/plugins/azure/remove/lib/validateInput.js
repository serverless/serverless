'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validateInput() {
    return new BbPromise((resolve, reject) => {
      if (!this.serverless.config.servicePath) {
        reject(
          new this.serverless.classes.Error('This command can only be run inside a service.')
        );
        return;
      }

      if (!this.serverless.service.service) {
        reject(new this.serverless.classes.Error('Service name is missing.'));
        return;
      }

      if (!this.options.stage) {
        reject(new this.serverless.classes.Error('Stage option is missing.'));
        return;
      }

      resolve();
    });
  },
};
