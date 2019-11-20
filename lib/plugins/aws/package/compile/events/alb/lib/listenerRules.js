'use strict';

module.exports = {
  compileListenerRules() {
    this.validated.events.forEach(event => {
      const listenerRuleLogicalId = this.provider.naming.getAlbListenerRuleLogicalId(
        event.functionName,
        event.priority
      );
      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        event.functionName,
        event.albId,
        event.multiValueHeaders
      );

      const Conditions = [
        {
          Field: 'path-pattern',
          Values: event.conditions.path,
        },
      ];
      if (event.conditions.host) {
        Conditions.push({
          Field: 'host-header',
          Values: event.conditions.host,
        });
      }
      if (event.conditions.method) {
        Conditions.push({
          Field: 'http-request-method',
          HttpRequestMethodConfig: {
            Values: event.conditions.method,
          },
        });
      }
      if (event.conditions.header) {
        Conditions.push({
          Field: 'http-header',
          HttpHeaderConfig: {
            HttpHeaderName: event.conditions.header.name,
            Values: event.conditions.header.values,
          },
        });
      }
      if (event.conditions.query) {
        Conditions.push({
          Field: 'query-string',
          QueryStringConfig: {
            Values: Object.keys(event.conditions.query).map(key => ({
              Key: key,
              Value: event.conditions.query[key],
            })),
          },
        });
      }
      if (event.conditions.ip) {
        Conditions.push({
          Field: 'source-ip',
          SourceIpConfig: {
            Values: event.conditions.ip,
          },
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
