'use strict';

module.exports = {
  type: 'object',
  properties: {
    StorageClass: {
      type: 'string',
    },
    TransitionDate: {
      type: 'timestamp',
    },
    TransitionInDays: {
      type: 'integer',
    },
  },
  required: ['StorageClass'],
  additionalProperties: false,
};
