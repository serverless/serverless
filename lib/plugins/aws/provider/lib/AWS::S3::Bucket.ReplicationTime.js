'use strict';

module.exports = {
  type: 'object',
  properties: {
    Status: {
      type: 'string',
    },
    Time: {
      type: 'ReplicationTimeValue',
    },
  },
  required: ['Status', 'Time'],
  additionalProperties: false,
};
