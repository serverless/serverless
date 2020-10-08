'use strict';

module.exports = {
  type: 'object',
  properties: {
    Rules: {
      type: 'array',
      items: require('./AWS::S3::Bucket.FilterRule'),
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};
