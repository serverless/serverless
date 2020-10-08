'use strict';

module.exports = {
  type: 'object',
  properties: {
    Owner: {
      const: 'Destination',
    },
  },
  required: ['Owner'],
  additionalProperties: false,
};
