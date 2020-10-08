'use strict';

module.exports = {
  type: 'object',
  properties: {
    And: {
      type: 'ReplicationRuleAndOperator',
    },
    Prefix: {
      type: 'string',
    },
    TagFilter: {
      type: 'TagFilter',
    },
  },
  required: [],
  additionalProperties: false,
};
