'use strict';

module.exports = {
  type: 'object',
  properties: {
    EventThreshold: require('./ReplicationTimeValue'),
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['EventThreshold', 'Status'],
  additionalProperties: false,
};
