'use strict';

module.exports = {
  type: 'object',
  properties: {
    Role: { $ref: '#/definitions/awsArn' },
    Rules: {
      type: 'array',
      items: require('./ReplicationRule'),
      minItems: 1,
      maxItems: 1000,
    },
  },
  required: ['Role', 'Rules'],
  additionalProperties: false,
};
