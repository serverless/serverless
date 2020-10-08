'use strict';

module.exports = {
  type: 'object',
  properties: {
    RedirectRule: {
      type: 'RedirectRule',
    },
    RoutingRuleCondition: {
      type: 'RoutingRuleCondition',
    },
  },
  required: ['RedirectRule'],
  additionalProperties: false,
};
