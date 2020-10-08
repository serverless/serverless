'use strict';

module.exports = {
  type: 'object',
  properties: {
    RedirectRule: require('./RedirectRule'),
    RoutingRuleCondition: require('./RoutingRuleCondition'),
  },
  required: ['RedirectRule'],
  additionalProperties: false,
};
