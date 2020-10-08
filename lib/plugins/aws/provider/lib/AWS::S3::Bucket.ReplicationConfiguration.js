'use strict';

module.exports = {
  type: 'object',
  properties: {
    Role: {
      type: 'string',
    },
    Rules: {
      type: 'array',
      items: require('./AWS::S3::Bucket.ReplicationRule'),
    },
  },
  required: ['Role', 'Rules'],
  additionalProperties: false,
};
