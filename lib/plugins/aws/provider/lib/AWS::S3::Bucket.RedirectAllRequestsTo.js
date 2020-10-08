'use strict';

module.exports = {
  type: 'object',
  properties: {
    HostName: {
      type: 'string',
    },
    Protocol: {
      type: 'string',
    },
  },
  required: ['HostName'],
  additionalProperties: false,
};
