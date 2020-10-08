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
    StorageClassAnalysis: require('./AWS::S3::Bucket.StorageClassAnalysis'),
    TagFilters: {
      type: 'array',
      items: require('./AWS::S3::Bucket.TagFilter'),
    },
  },
  required: ['Id', 'StorageClassAnalysis'],
  additionalProperties: false,
};
