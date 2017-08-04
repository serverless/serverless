'use strict';

const _ = require('lodash');

module.exports = {
  normalizeCloudFormationTemplate(template) {
    const normalizedTemplate = _.cloneDeep(template);

    // reset all the S3Keys for AWS::Lambda::Function resources
    _.forEach(normalizedTemplate.Resources, (value) => {
      if (value.Type && value.Type === 'AWS::Lambda::Function') {
        const newVal = value;
        newVal.Properties.Code.S3Key = '';
      }
    });

    return normalizedTemplate;
  },
};
