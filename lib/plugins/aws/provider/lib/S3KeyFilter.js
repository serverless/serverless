'use strict';

module.exports = {
  type: 'object',
  properties: {
    Rules: {
      type: 'array',
      items: require('./FilterRule'),
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};
