'use strict';

module.exports = {
  type: 'object',
  properties: {
    AccelerationStatus: {
      enum: ['Enabled', 'Suspended'],
    },
  },
  required: ['AccelerationStatus'],
  additionalProperties: false,
};
