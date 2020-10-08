'use strict';

module.exports = {
  type: 'object',
  properties: {
    S3Key: {
      type: 'S3KeyFilter',
    },
  },
  required: ['S3Key'],
  additionalProperties: false,
};
