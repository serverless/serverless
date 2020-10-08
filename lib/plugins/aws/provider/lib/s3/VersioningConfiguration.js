'use strict';

module.exports = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Enabled', 'Suspended'],
    },
  },
  required: ['Status'],
  additionalProperties: false,
};
