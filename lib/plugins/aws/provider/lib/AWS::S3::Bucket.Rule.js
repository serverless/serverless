'use strict';

module.exports = {
  type: 'object',
  properties: {
    AbortIncompleteMultipartUpload: require('./AWS::S3::Bucket.AbortIncompleteMultipartUpload'),
    ExpirationDate: {
      type: 'timestamp',
    },
    ExpirationInDays: {
      type: 'integer',
    },
    Id: {
      type: 'string',
    },
    NoncurrentVersionExpirationInDays: {
      type: 'integer',
    },
    NoncurrentVersionTransition: require('./AWS::S3::Bucket.NoncurrentVersionTransition'),
    NoncurrentVersionTransitions: {
      type: 'array',
      items: require('./AWS::S3::Bucket.NoncurrentVersionTransition'),
    },
    Prefix: {
      type: 'string',
    },
    Status: {
      type: 'string',
    },
    TagFilters: {
      type: 'array',
      items: require('./AWS::S3::Bucket.TagFilter'),
    },
    Transition: require('./AWS::S3::Bucket.Transition'),
    Transitions: {
      type: 'array',
      items: require('./AWS::S3::Bucket.Transition'),
    },
  },
  required: ['Status'],
  additionalProperties: false,
};
