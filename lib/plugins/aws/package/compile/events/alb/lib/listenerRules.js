'use strict';

module.exports = {
  compileListenerRules() {
    this.validated.events.forEach((event) => {
      const listenerRuleLogicalId = this.provider.naming
        .getAlbListenerRuleLogicalId(event.functionName, event.priority);
      const targetGroupLogicalId = this.provider.naming
        .getAlbTargetGroupLogicalId(event.functionName);

      const Conditions = [
        {
          Field: 'path-pattern',
          Values: [event.conditions.path],
        },
      ];
      if (event.conditions.host) {
        Conditions.push({
          Field: 'host-header',
          Values: [event.conditions.host],
        });
      }

      Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [listenerRuleLogicalId]: {
          Type: 'AWS::ElasticLoadBalancingV2::ListenerRule',
          Properties: {
            Actions: [
              {
                Type: 'forward',
                TargetGroupArn: {
                  Ref: targetGroupLogicalId,
                },
              },
            ],
            Conditions,
            ListenerArn: event.listenerArn,
            Priority: event.priority,
          },
        },
      });
    });
  },
};
