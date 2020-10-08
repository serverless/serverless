'use strict';

module.exports = {
  type: 'object',
  properties: {
    HostName: {
      type: 'string',
    },
    HttpRedirectCode: {
      type: 'string',
    },
    Protocol: {
      enum: ['http', 'https'],
    },
    ReplaceKeyPrefixWith: {
      type: 'string',
    },
    ReplaceKeyWith: {
      type: 'string',
    },
  },
  required: [],
  additionalProperties: false,
};
