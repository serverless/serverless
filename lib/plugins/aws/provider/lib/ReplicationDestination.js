'use strict';

module.exports = {
  type: 'object',
  properties: {
    AccessControlTranslation: require('./AccessControlTranslation'),
    Account: {
      type: 'string',
      pattern: '^\\d{12}$',
    },
    Bucket: { $ref: '#/definitions/awsArn' },
    EncryptionConfiguration: require('./EncryptionConfiguration'),
    Metrics: require('./Metrics'),
    ReplicationTime: require('./ReplicationTime'),
    StorageClass: {
      enum: [
        'DEEP_ARCHIVE',
        'GLACIER',
        'INTELLIGENT_TIERING',
        'ONEZONE_IA',
        'OUTPOSTS',
        'REDUCED_REDUNDANCY',
        'STANDARD',
        'STANDARD_IA',
      ],
    },
  },
  required: ['Bucket'],
  additionalProperties: false,
  dependencies: {
    AccessControlTranslation: ['Account'],
  },
};
