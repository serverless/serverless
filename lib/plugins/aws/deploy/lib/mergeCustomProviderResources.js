'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  mergeCustomProviderResources() {
    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate,
      this.serverless.service.resources
    );

    return BbPromise.resolve();
  },
};
