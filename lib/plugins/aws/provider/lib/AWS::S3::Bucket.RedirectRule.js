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
      type: 'string',
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
