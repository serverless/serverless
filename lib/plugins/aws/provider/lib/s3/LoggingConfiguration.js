'use strict';

module.exports = {
  type: 'object',
  properties: {
    DestinationBucketName: {
      oneOf: [{ $ref: '#/definitions/awsS3BucketName' }, { $ref: '#/definitions/awsCfFunction' }],
    },
    LogFilePrefix: {
      type: 'string',
    },
  },
  required: [],
  additionalProperties: false,
};
