'use strict';

module.exports = {
  type: 'object',
  properties: {
    Destination: {
      type: require('./AWS::S3::Bucket.Destination'),
    },
    OutputSchemaVersion: {
      const: 'V_1',
    },
  },
  required: ['Destination', 'OutputSchemaVersion'],
  additionalProperties: false,
};
