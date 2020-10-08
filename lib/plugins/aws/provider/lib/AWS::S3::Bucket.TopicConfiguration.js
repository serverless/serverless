'use strict';

module.exports = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
    },
    Filter: require('./AWS::S3::Bucket.NotificationFilter'),
    Topic: {
      type: 'string',
    },
  },
  required: ['Event', 'Topic'],
  additionalProperties: false,
};
