'use strict';

module.exports = {
  type: 'object',
  properties: {
    Status: {
      type: 'string',
    },
    Time: require('./ReplicationTimeValue'),
  },
  required: ['Status', 'Time'],
  additionalProperties: false,
};
