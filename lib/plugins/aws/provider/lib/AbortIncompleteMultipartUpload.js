'use strict';

module.exports = {
  type: 'object',
  properties: {
    DaysAfterInitiation: {
      type: 'integer',
    },
  },
  required: ['DaysAfterInitiation'],
  additionalProperties: false,
};
