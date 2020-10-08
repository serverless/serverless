'use strict';

module.exports = {
  type: 'object',
  properties: {
    ObjectLockEnabled: {
      type: 'string',
    },
    Rule: require('./AWS::S3::Bucket.ObjectLockRule'),
  },
  required: [],
  additionalProperties: false,
};
