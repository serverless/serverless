'use strict';

module.exports = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['Status'],
  additionalProperties: false,
};
