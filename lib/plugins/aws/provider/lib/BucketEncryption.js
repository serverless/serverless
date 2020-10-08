'use strict';

module.exports = {
  type: 'object',
  properties: {
    ServerSideEncryptionConfiguration: {
      type: 'array',
      items: require('./ServerSideEncryptionRule'),
    },
  },
  required: ['ServerSideEncryptionConfiguration'],
  additionalProperties: false,
};
