'use strict';

module.exports = {
  type: 'object',
  properties: {
    Destination: {
      type: require('./Destination'),
    },
    OutputSchemaVersion: {
      const: 'V_1',
    },
  },
  required: ['Destination', 'OutputSchemaVersion'],
  additionalProperties: false,
};
