'use strict';

module.exports = {
  type: 'object',
  properties: {
    ObjectLockEnabled: {
      const: 'Enabled',
    },
    Rule: require('./ObjectLockRule'),
  },
  required: [],
  additionalProperties: false,
};
