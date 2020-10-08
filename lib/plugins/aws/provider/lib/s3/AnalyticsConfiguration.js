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
    StorageClassAnalysis: require('./StorageClassAnalysis'),
    TagFilters: {
      type: 'array',
      items: require('./TagFilter'),
    },
  },
  required: ['Id', 'StorageClassAnalysis'],
  additionalProperties: false,
};
