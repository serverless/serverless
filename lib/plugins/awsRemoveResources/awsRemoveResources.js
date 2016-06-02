'use strict';

const BbPromise = require('bluebird');
const validateInput = require('./lib/validateInput');

class AwsRemoveResources {
  constructor(serverless) {
    this.serverless = serverless;

    Object.assign(this, validateInput);

    this.hooks = {
      'remove:resources:removeResources': (options) => {
        this.options = options || {};

        return BbPromise.bind(this)
          .then(this.validateInput)
          .then(() => this.serverless.cli.log('Resource removal successful!'));
      },
    };
  }
}

module.exports = AwsRemoveResources;
