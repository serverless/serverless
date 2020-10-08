'use strict';

module.exports = {
  type: 'object',
  properties: {
    BlockPublicAcls: {
      type: 'boolean',
    },
    BlockPublicPolicy: {
      type: 'boolean',
    },
    IgnorePublicAcls: {
      type: 'boolean',
    },
    RestrictPublicBuckets: {
      type: 'boolean',
    },
  },
  required: [],
  additionalProperties: false,
};
