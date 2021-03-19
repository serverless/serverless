'use strict';

module.exports = {
  stripNullPropsFromTemplateResources() {
    const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    for (const resource of Object.values(resources)) {
      if (resource.Properties) {
        for (const [propName, propVal] of Object.entries(resource.Properties)) {
          if (propVal === null) {
            delete resource.Properties[propName];
          }
        }
      }
    }
  },
};
