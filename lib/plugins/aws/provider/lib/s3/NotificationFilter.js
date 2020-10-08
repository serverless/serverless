'use strict';

module.exports = {
  type: 'object',
  properties: {
    S3Key: require('./S3KeyFilter'),
  },
  required: ['S3Key'],
  additionalProperties: false,
};
