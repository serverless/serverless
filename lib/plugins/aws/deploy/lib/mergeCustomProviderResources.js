'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  mergeCustomProviderResources() {
    if (this.serverless.service.resources && !this.serverless.service.resources.Resources) {
      this.serverless.service.resources.Resources = {};
    }
    if (this.serverless.service.resources && !this.serverless.service.resources.Outputs) {
      this.serverless.service.resources.Outputs = {};
    }

    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate,
      this.serverless.service.resources
    );

    return BbPromise.resolve();
  },
};
