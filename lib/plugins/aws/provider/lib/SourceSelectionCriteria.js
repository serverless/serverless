'use strict';

module.exports = {
  type: 'object',
  properties: {
    SseKmsEncryptedObjects: require('./SseKmsEncryptedObjects'),
  },
  required: ['SseKmsEncryptedObjects'],
  additionalProperties: false,
};
