'use strict';

module.exports = {
  type: 'object',
  properties: {
    EventThreshold: {
      type: 'ReplicationTimeValue',
    },
    Status: {
      type: 'string',
    },
  },
  required: ['EventThreshold', 'Status'],
  additionalProperties: false,
};
