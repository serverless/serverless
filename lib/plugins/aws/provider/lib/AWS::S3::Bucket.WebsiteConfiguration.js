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
    RedirectAllRequestsTo: require('./AWS::S3::Bucket.RedirectAllRequestsTo'),
    RoutingRules: {
      type: 'array',
      items: require('./AWS::S3::Bucket.RoutingRule'),
    },
  },
  required: [],
  additionalProperties: false,
};
