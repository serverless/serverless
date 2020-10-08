'use strict';

module.exports = {
  type: 'object',
  properties: {
    Bucket: {
      type: 'string',
    },
    PolicyDocument: {
      type: 'object',
    },
  },
  required: ['Bucket', 'PolicyDocument'],
  additionalProperties: false,
};
