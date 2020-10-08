'use strict';

module.exports = {
  type: 'object',
  properties: {
    StorageClass: {
      type: 'string',
    },
    TransitionInDays: {
      type: 'integer',
    },
  },
  required: ['StorageClass', 'TransitionInDays'],
  additionalProperties: false,
};
