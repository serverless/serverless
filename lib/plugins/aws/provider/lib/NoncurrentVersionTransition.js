'use strict';

module.exports = {
  type: 'object',
  properties: {
    StorageClass: {
      enum: ['DEEP_ARCHIVE', 'GLACIER', 'INTELLIGENT_TIERING', 'ONEZONE_IA', 'STANDARD_IA'],
    },
    TransitionInDays: {
      type: 'integer',
    },
  },
  required: ['StorageClass', 'TransitionInDays'],
  additionalProperties: false,
};
