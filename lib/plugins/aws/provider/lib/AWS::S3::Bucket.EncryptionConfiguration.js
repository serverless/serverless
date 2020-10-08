'use strict';

module.exports = {
  type: 'object',
  properties: {
    ReplicaKmsKeyID: {
      type: 'string',
    },
  },
  required: ['ReplicaKmsKeyID'],
  additionalProperties: false,
};
