'use strict';

module.exports = {
  type: 'object',
  properties: {
    Prefix: {
      type: 'string',
    },
    TagFilters: {
      type: 'array',
      items: require('./TagFilter'),
    },
  },
  required: [],
  additionalProperties: false,
};
