'use strict';

module.exports = {
  type: 'object',
  properties: {
    Rules: {
      type: 'array',
      items: require('./AWS::S3::Bucket.Rule'),
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};
