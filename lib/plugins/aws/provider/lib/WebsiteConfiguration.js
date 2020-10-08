'use strict';

module.exports = {
  type: 'object',
  properties: {
    ErrorDocument: {
      type: 'string',
    },
    IndexDocument: {
      type: 'string',
    },
    RedirectAllRequestsTo: require('./RedirectAllRequestsTo'),
    RoutingRules: {
      type: 'array',
      items: require('./RoutingRule'),
    },
  },
  required: [],
  additionalProperties: false,
};
