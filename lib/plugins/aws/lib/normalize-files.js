'use strict';

const deepSortObjectByKey = require('../../../utils/deep-sort-object-by-key');
const _ = require('lodash');

module.exports = {
  normalizeCloudFormationTemplate(template) {
    const normalizedTemplate = _.cloneDeep(template);

    Object.entries(normalizedTemplate.Resources).forEach(([key, value]) => {
      if (key.startsWith('ApiGatewayDeployment')) {
        delete Object.assign(normalizedTemplate.Resources, {
          ApiGatewayDeployment: normalizedTemplate.Resources[key],
        })[key];
      }
      if (key.startsWith('WebsocketsDeployment') && key !== 'WebsocketsDeploymentStage') {
        delete Object.assign(normalizedTemplate.Resources, {
          WebsocketsDeployment: normalizedTemplate.Resources[key],
        })[key];
      }
      if (key === 'WebsocketsDeploymentStage' && _.get(value.Properties, 'DeploymentId')) {
        const newVal = value;
        newVal.Properties.DeploymentId.Ref = 'WebsocketsDeployment';
      }
      if (value.Type && value.Type === 'AWS::Lambda::Function' && _.get(value.Properties, 'Code')) {
        const newVal = value;
        newVal.Properties.Code.S3Key = '';
      }
      if (
        value.Type &&
        value.Type === 'AWS::Lambda::LayerVersion' &&
        _.get(value.Properties, 'Content')
      ) {
        const newVal = value;
        newVal.Properties.Content.S3Key = '';
      }
    });

    // Sort resources and outputs to ensure consistent hashing
    normalizedTemplate.Resources = deepSortObjectByKey(normalizedTemplate.Resources);
    if (normalizedTemplate.Outputs) {
      normalizedTemplate.Outputs = deepSortObjectByKey(normalizedTemplate.Outputs);
    }

    return normalizedTemplate;
  },
  normalizeState(state) {
    const result = deepSortObjectByKey(state);
    delete result.service.initialServerlessConfig;
    delete result.service.provider.coreCloudFormationTemplate;
    delete result.service.provider.compiledCloudFormationTemplate;
    delete result.package.artifactDirectoryName;
    return result;
  },
};
