'use strict';

const BbPromise = require('bluebird');

module.exports = {
  validateInput() {
    if (!this.serverless.service.resources.aws.Resources) {
      throw new this.serverless.Error(
        'This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    return BbPromise.resolve();
  },
};


