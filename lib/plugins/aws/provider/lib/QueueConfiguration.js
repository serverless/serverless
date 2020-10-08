'use strict';

module.exports = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: require('./NotificationFilter'),
    Queue: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Queue'],
  additionalProperties: false,
};
