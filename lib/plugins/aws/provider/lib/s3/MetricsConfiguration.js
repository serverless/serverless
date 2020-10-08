'use strict';

module.exports = {
  type: 'object',
  properties: {
    Id: {
      type: 'string',
    },
    Prefix: {
      type: 'string',
    },
    TagFilters: {
      type: 'array',
      items: require('./TagFilter'),
    },
  },
  required: ['Id'],
  additionalProperties: false,
};
