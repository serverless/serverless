'use strict';

module.exports = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: require('./NotificationFilter'),
    Function: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Function'],
  additionalProperties: false,
};
