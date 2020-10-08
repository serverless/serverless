'use strict';

module.exports = {
  type: 'object',
  properties: {
    Rules: {
      type: 'array',
      items: require('./Rule'),
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};
