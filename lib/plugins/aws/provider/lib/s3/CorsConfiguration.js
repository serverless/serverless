'use strict';

module.exports = {
  type: 'object',
  properties: {
    CorsRules: {
      type: 'array',
      items: require('./CorsRule'),
      maxItems: 100,
    },
  },
  required: ['CorsRules'],
  additionalProperties: false,
};
