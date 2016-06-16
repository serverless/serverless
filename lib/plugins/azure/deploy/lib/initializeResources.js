'use strict';

const merge     = require('lodash').merge;
const path      = require('path');
const BbPromise = require('bluebird');

module.exports = {
  initializeResources() {
    const template = JSON.parse(this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath, 'templates', 'azure-arm.json'), 'utf8'
    ));

    // Update basic properties
    template.variables.siteName = `serverless-${this.serverless.service.service}`;
    template.variables.location = this.options.region || template.variables.location;
    // Todo: See below - where to store options?
    // template.variables.storageAccountType = this.options.azure.storageAccountType || template.variables.storageAccountType

    if (this.serverless.service.resources.azure) {
      // Merge additional resources provided by other plugins or the
      // user in with what we'll come up with
      Object.keys(template.resources).forEach(resourceName => {
        const resourceObj = {
          [resourceName]: template.resources[resourceName],
        };

        merge(this.serverless.service.resources.azure.resources, resourceObj);
      });
    } else {
      // If we don't merge any user-provided resources in,
      // this template should already work
      this.serverless.service.resources.azure = template;
    }

    return BbPromise.resolve();
  },
};
