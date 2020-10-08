'use strict';

module.exports = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: [],
  additionalProperties: false,
};
