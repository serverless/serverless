'use strict';

module.exports = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
    },
    Filter: require('./AWS::S3::Bucket.NotificationFilter'),
    Queue: {
      type: 'string',
    },
  },
  required: ['Event', 'Queue'],
  additionalProperties: false,
};
