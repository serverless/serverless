'use strict';

module.exports = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
    },
    Filter: require('./NotificationFilter'),
    Topic: {
      type: 'string',
    },
  },
  required: ['Event', 'Topic'],
  additionalProperties: false,
};
