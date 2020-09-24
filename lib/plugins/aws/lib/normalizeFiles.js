'use strict';

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
      if (key === 'WebsocketsDeploymentStage') {
        const newVal = value;
        newVal.Properties.DeploymentId.Ref = 'WebsocketsDeployment';
      }
      if (value.Type && value.Type === 'AWS::Lambda::Function') {
        const newVal = value;
        newVal.Properties.Code.S3Key = '';
      }
      if (value.Type && value.Type === 'AWS::Lambda::LayerVersion') {
        const newVal = value;
        newVal.Properties.Content.S3Key = '';
      }
    });

    return normalizedTemplate;
  },
};
