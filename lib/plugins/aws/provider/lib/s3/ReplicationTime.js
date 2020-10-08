'use strict';

module.exports = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
    Time: require('./ReplicationTimeValue'),
  },
  required: ['Status', 'Time'],
  additionalProperties: false,
};
