'use strict';

module.exports = {
  type: 'object',
  properties: {
    Days: {
      type: 'integer',
    },
    Mode: {
      enum: ['COMPLIANCE', 'GOVERNANCE'],
    },
    Years: {
      type: 'integer',
    },
  },
  required: [],
  additionalProperties: false,
};
