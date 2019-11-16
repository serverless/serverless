'use strict';

const _ = require('lodash');

module.exports = {
  normalizeCloudFormationTemplate(template) {
    const normalizedTemplate = _.cloneDeep(template);

    _.forEach(normalizedTemplate.Resources, (value, key) => {
      if (key.startsWith('ApiGatewayDeployment')) {
        delete Object.assign(normalizedTemplate.Resources, {
          ApiGatewayDeployment: normalizedTemplate.Resources[key],
        })[key];
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
