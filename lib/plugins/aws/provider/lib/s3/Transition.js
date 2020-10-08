'use strict';

module.exports = {
  type: 'object',
  properties: {
    StorageClass: {
      enum: ['DEEP_ARCHIVE', 'GLACIER', 'INTELLIGENT_TIERING', 'ONEZONE_IA', 'STANDARD_IA'],
    },
    TransitionDate: {
      type: 'date-time',
    },
    TransitionInDays: {
      type: 'integer',
      minimum: 1,
    },
  },
  required: ['StorageClass'],
  additionalProperties: false,
};
