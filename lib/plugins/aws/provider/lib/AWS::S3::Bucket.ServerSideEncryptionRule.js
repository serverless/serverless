'use strict';

module.exports = {
  type: 'object',
  properties: {
    ServerSideEncryptionByDefault: require('./AWS::S3::Bucket.ServerSideEncryptionByDefault'),
  },
  required: [],
  additionalProperties: false,
};
