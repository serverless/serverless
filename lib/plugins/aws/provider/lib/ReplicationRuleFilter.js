'use strict';

module.exports = {
  type: 'object',
  properties: {
    And: require('./ReplicationRuleAndOperator'),
    Prefix: {
      type: 'string',
    },
    TagFilter: require('./TagFilter'),
  },
  required: [],
  additionalProperties: false,
};
