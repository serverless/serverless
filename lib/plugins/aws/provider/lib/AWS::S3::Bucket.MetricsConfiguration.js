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
      items: require('./AWS::S3::Bucket.TagFilter'),
    },
  },
  required: ['Id'],
  additionalProperties: false,
};
