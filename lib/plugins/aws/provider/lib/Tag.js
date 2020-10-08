'use strict';

module.exports = {
  type: 'object',
  properties: {
    Key: {
      type: 'string',
    },
    Value: {
      type: 'string',
    },
  },
  required: ['Key', 'Value'],
  additionalProperties: false,
};
