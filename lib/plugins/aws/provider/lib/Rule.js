'use strict';

module.exports = {
  type: 'object',
  properties: {
    AbortIncompleteMultipartUpload: require('./AbortIncompleteMultipartUpload'),
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
    NoncurrentVersionTransition: require('./NoncurrentVersionTransition'),
    NoncurrentVersionTransitions: {
      type: 'array',
      items: require('./NoncurrentVersionTransition'),
    },
    Prefix: {
      type: 'string',
    },
    Status: {
      type: 'string',
    },
    TagFilters: {
      type: 'array',
      items: require('./TagFilter'),
    },
    Transition: require('./Transition'),
    Transitions: {
      type: 'array',
      items: require('./Transition'),
    },
  },
  required: ['Status'],
  additionalProperties: false,
};
