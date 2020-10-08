'use strict';

module.exports = {
  type: 'object',
  properties: {
    Destination: require('./AWS::S3::Bucket.Destination'),
    Enabled: {
      type: 'boolean',
    },
    Id: {
      type: 'string',
    },
    IncludedObjectVersions: {
      enun: ['All', 'Current'],
    },
    OptionalFields: {
      type: 'array',
      items: {type: 'string'},
    },
    Prefix: {
      type: 'string',
    },
    ScheduleFrequency: {
      enum: ['Daily', 'Weekly'],
    },
  },
  required: ['Destination', 'Enabled', 'Id', 'IncludedObjectVersions', 'ScheduleFrequency'],
  additionalProperties: false,
};
