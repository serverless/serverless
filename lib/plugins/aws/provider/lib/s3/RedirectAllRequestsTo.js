'use strict';

module.exports = {
  type: 'object',
  properties: {
    HostName: {
      type: 'string',
    },
    Protocol: {
      enum: ['http', 'https'],
    },
  },
  required: ['HostName'],
  additionalProperties: false,
};
