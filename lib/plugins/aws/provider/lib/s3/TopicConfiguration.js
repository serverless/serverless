'use strict';

module.exports = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: require('./NotificationFilter'),
    Topic: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Topic'],
  additionalProperties: false,
};
