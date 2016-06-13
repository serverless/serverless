'use strict';

const merge     = require('lodash').merge;
const path      = require('path');
const BbPromise = require('bluebird');

module.exports = {
  initializeResources() {
    const armTemplate = this.serverless.utils.readFileSync(
      // Todo: Make a suitable template (or, alternatively, go without it, you lunatic)
      path.join(this.serverless.config.serverlessPath, 'templates', 'azure-arm.json')
    );

    // Todo: Update all the "general" properties with useful information
    // This might include storage containers, function-hosting websites, etc

    if (this.serverless.service.resources.azure) {
      // Todo: Merge additional resources provided by other plugins or the
      // user in with what we'll come up with
      Object.keys(armTemplate.resources).forEach(resourceName => {
        const resourceObj = {
          [resourceName]: armTemplate.Resources[resourceName],
        };

        merge(this.serverless.service.resources.azure.resources, resourceObj);
      });
    } else {
      // Todo: If we don't merge any user-provided resources in,
      // this template should already work
      this.serverless.service.resources.azure = armTemplate;
    }

    return BbPromise.resolve();
  },
};
