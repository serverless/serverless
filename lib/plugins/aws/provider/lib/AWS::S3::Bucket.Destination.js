'use strict';

module.exports = {
  type: 'object',
  properties: {
    BucketAccountId: {
      type: 'string',
      pattern: '\\d{12}'
    },
    BucketArn: { $ref: '#/definitions/awsArnString' },
    Format: {
      enum: ['CSV', 'ORC', 'Parquet'],
    },
    Prefix: {
      type: 'string',
    },
  },
  required: ['BucketArn', 'Format'],
  additionalProperties: false,
};
