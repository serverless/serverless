'use strict';

const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  initializeResources() {
    // save the custom resources (e.g. Resources, Outputs etc.) the user has added
    // so that they can be merged in later on
    this.serverless.service.customProviderResources = {};

    if (this.serverless.service.resources && this.serverless.service.resources.Resources) {
      this.serverless.service.customProviderResources = this.serverless.service.resources;
    }

    this.serverless.service.resources = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'lib',
        'core-cloudformation-template.json')
    );

    return BbPromise.resolve();
  },
};
