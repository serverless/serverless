'use strict';

module.exports = {
  type: 'object',
  properties: {
    SseKmsEncryptedObjects: {
      type: 'SseKmsEncryptedObjects',
    },
  },
  required: ['SseKmsEncryptedObjects'],
  additionalProperties: false,
};
