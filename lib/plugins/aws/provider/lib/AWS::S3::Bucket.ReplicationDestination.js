'use strict';

module.exports = {
  type: 'object',
  properties: {
    AccessControlTranslation: {
      type: 'AccessControlTranslation',
    },
    Account: {
      type: 'string',
    },
    Bucket: {
      type: 'string',
    },
    EncryptionConfiguration: {
      type: 'EncryptionConfiguration',
    },
    Metrics: {
      type: 'Metrics',
    },
    ReplicationTime: {
      type: 'ReplicationTime',
    },
    StorageClass: {
      type: 'string',
    },
  },
  required: ['Bucket'],
  additionalProperties: false,
};
