'use strict';

module.exports = {
  type: 'object',
  properties: {
    DataExport: require('./AWS::S3::Bucket.DataExport'),
  },
  required: [],
  additionalProperties: false,
};
