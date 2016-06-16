'use strict';

const merge     = require('lodash').merge;
const path      = require('path');
const BbPromise = require('bluebird');

module.exports = {
  deployResources() {
    const azureResources = this.serverless.service.resources.azure;

    // Todo: Deploy the resources

    return BbPromise.resolve();
  },
};
