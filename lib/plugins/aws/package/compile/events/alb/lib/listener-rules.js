'use strict';

module.exports = {
  compileListenerRules() {
    const { authorizers, events } = this.validated;

    events.forEach((event) => {
      const listenerRuleLogicalId = this.provider.naming.getAlbListenerRuleLogicalId(
        event.functionName,
        event.priority
      );
      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        event.functionName,
        event.albId,
        event.multiValueHeaders
      );

      let Order = 0;
      const Actions = [];
      if (event.authorizers) {
        event.authorizers.forEach((authName) => {
          const auth = authorizers[authName];
          if (auth.type === 'cognito') {
            const config = {
              UserPoolArn: auth.userPoolArn,
              UserPoolClientId: auth.userPoolClientId,
              UserPoolDomain: auth.userPoolDomain,
              OnUnauthenticatedRequest: auth.onUnauthenticatedRequest,
              AuthenticationRequestExtraParams: auth.requestExtraParams,
              Scope: auth.scope,
              SessionCookieName: auth.sessionCookieName,
              SessionTimeout: auth.sessionTimeout,
            };
            const authObj = {
              Type: 'authenticate-cognito',
              Order: 1 + Order++,
              AuthenticateCognitoConfig: config,
            };
            Actions.push(authObj);
          } else {
            const config = {
              AuthorizationEndpoint: auth.authorizationEndpoint,
              ClientId: auth.clientId,
              Issuer: auth.issuer,
              TokenEndpoint: auth.tokenEndpoint,
              UserInfoEndpoint: auth.userInfoEndpoint,
              OnUnauthenticatedRequest: auth.onUnauthenticatedRequest,
              AuthenticationRequestExtraParams: auth.requestExtraParams,
              Scope: auth.scope,
              SessionCookieName: auth.sessionCookieName,
              SessionTimeout: auth.sessionTimeout,
            };
            if (auth.clientSecret) {
              config.ClientSecret = auth.clientSecret;
            } else {
              config.UseExistingClientSecret = true;
            }
            const authObj = {
              Type: 'authenticate-oidc',
              Order: ++Order,
              AuthenticateOidcConfig: config,
            };
            Actions.push(authObj);
          }
        });
      }
      const forwardAction = {
        Type: 'forward',
        TargetGroupArn: {
          Ref: targetGroupLogicalId,
        },
      };
      if (Order) {
        forwardAction.Order = ++Order;
      }
      Actions.push(forwardAction);

      const Conditions = [];
      if (event.conditions.path) {
        Conditions.push({
          Field: 'path-pattern',
          Values: event.conditions.path,
        });
      }
      if (event.conditions.host) {
        Conditions.push({
          Field: 'host-header',
          HostHeaderConfig: {
            Values: event.conditions.host,
          },
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
        event.conditions.header.forEach(({ name, values }) => {
          Conditions.push({
            Field: 'http-header',
            HttpHeaderConfig: {
              HttpHeaderName: name,
              Values: values,
            },
          });
        });
      }
      if (event.conditions.query) {
        Conditions.push({
          Field: 'query-string',
          QueryStringConfig: {
            Values: Object.keys(event.conditions.query).map((key) => ({
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
            Actions,
            Conditions,
            ListenerArn: event.listenerArn,
            Priority: event.priority,
          },
        },
      });
    });
  },
};
