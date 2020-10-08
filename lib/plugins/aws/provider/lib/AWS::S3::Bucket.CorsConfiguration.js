'use strict';

module.exports = {
  type: 'object',
  properties: {
    CorsRules: {
      type: 'array',
      items: require('./AWS::S3::Bucket.CorsRule'),
    },
  },
  required: ['CorsRules'],
  additionalProperties: false,
};
