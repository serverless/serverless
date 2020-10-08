'use strict';

module.exports = {
  type: 'object',
  properties: {
    KMSMasterKeyID: {
      type: 'string',
    },
    SSEAlgorithm: {
      type: 'string',
    },
  },
  required: ['SSEAlgorithm'],
  additionalProperties: false,
};
