'use strict';

const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  initializeResources() {
    const template = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath, 'templates', 'azure-arm.json'), 'utf8'
    );
    const azureResources = this.serverless.service.resources.azure;

    // Update basic properties
    template.variables.siteName = `serverless-${this.serverless.service.service}-${this.options.stage}`;
    template.variables.location = this.options.region || template.variables.location;
    template.variables.storageAccountType = this.options.storageAccountType
      || template.variables.storageAccountType;

    if (azureResources && azureResources.resources) {
      // Merge additional resources provided by other plugins or the
      // user in with what we'll come up with
      Object.keys(azureResources.resources).forEach(resourceName => {
        template.resources.push(azureResources.resources[resourceName]);
      });
    }

    this.serverless.service.resources.azure = template;

    return BbPromise.resolve();
  },
};
