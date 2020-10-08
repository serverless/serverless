'use strict';

module.exports = {
  type: 'object',
  properties: {
    KMSMasterKeyID: {
      oneOf: [{ $ref: '#/definitions/awsArn' }, { type: 'string', pattern: '^[a-f0-9-]+$' }],
    },
    SSEAlgorithm: {
      enum: ['AES256', 'aws:kms'],
    },
  },
  required: ['SSEAlgorithm'],
  additionalProperties: false,
};
