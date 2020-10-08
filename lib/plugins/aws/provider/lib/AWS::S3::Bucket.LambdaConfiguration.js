'use strict';

module.exports = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
    },
    Filter: require('./AWS::S3::Bucket.NotificationFilter'),
    Function: {
      type: 'string',
    },
  },
  required: ['Event', 'Function'],
  additionalProperties: false,
};
