'use strict';

module.exports = {
  type: 'object',
  properties: {
    Name: {
      enum: ['prefix', 'suffix'],
    },
    Value: {
      type: 'string',
    },
  },
  required: ['Name', 'Value'],
  additionalProperties: false,
};
