'use strict';

module.exports = {
  type: 'object',
  properties: {
    ServerSideEncryptionConfiguration: {
      type: 'array',
      items: require('./AWS::S3::Bucket.ServerSideEncryptionRule'),
    },
  },
  required: ['ServerSideEncryptionConfiguration'],
  additionalProperties: false,
};
