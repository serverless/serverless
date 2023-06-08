'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../serverless-error');

module.exports = {
  mergeCustomProviderResources() {
    if (this.serverless.service.resources && !this.serverless.service.resources.Resources) {
      this.serverless.service.resources.Resources = {};
    }
    if (this.serverless.service.resources && !this.serverless.service.resources.Outputs) {
      this.serverless.service.resources.Outputs = {};
    }

    const extensions = this.serverless.service.resources
      ? this.serverless.service.resources.extensions
      : null;
    if (extensions) {
      delete this.serverless.service.resources.extensions;
    }

    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate,
      this.serverless.service.resources
    );

    if (extensions) {
      const template = this.serverless.service.provider.compiledCloudFormationTemplate;

      for (const [resourceName, resourceDefinition] of Object.entries(extensions)) {
        for (const [extensionAttributeName, value] of Object.entries(resourceDefinition)) {
          if (!template.Resources[resourceName]) {
            throw new ServerlessError(
              `Cannot extend "${resourceName}" resource, as it's not found in generated stack`,
              'RESOURCE_EXTENSION_NOT_EXISTING'
            );
          }

          switch (extensionAttributeName) {
            case 'Condition':
            case 'CreationPolicy':
            case 'DeletionPolicy':
            case 'UpdatePolicy':
            case 'UpdateReplacePolicy':
              template.Resources[resourceName][extensionAttributeName] = value;
              break;

            case 'Properties':
              if (!template.Resources[resourceName].Properties) {
                template.Resources[resourceName].Properties = {};
              }

              Object.assign(template.Resources[resourceName].Properties, value);
              break;

            case 'DependsOn':
              if (!template.Resources[resourceName].DependsOn) {
                template.Resources[resourceName].DependsOn = [];
              } else if (typeof template.Resources[resourceName].DependsOn === 'string') {
                template.Resources[resourceName].DependsOn = [
                  template.Resources[resourceName].DependsOn,
                ];
              }

              template.Resources[resourceName].DependsOn.push(...value);
              break;

            case 'Metadata':
              if (!template.Resources[resourceName].Metadata) {
                template.Resources[resourceName].Metadata = {};
              }

              Object.assign(template.Resources[resourceName].Metadata, value);
              break;

            // default includes any future attributes we don't know about yet.
            default:
              throw new ServerlessError(
                `Cannot extend "${resourceName}" resource, as extending ` +
                  `the "${extensionAttributeName}" ` +
                  'attribute at this point is not supported. Feel free to propose support ' +
                  'for it in the Framework issue tracker: ' +
                  'https://github.com/serverless/serverless/issues',
                'RESOURCE_EXTENSION_UNSUPPORTED_ATTRIBUTE'
              );
          }
        }
      }
    }
  },
};
