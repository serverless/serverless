'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compilePermissions() {
    this.validated.events.forEach(event => {
      const websocketApiId = this.provider.getApiGatewayWebsocketApiId();
      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(event.functionName);

      const websocketsPermissionLogicalId = this.provider.naming.getLambdaWebsocketsPermissionLogicalId(
        event.functionName
      );

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsPermissionLogicalId]: {
          Type: 'AWS::Lambda::Permission',
          DependsOn:
            websocketApiId.Ref !== undefined
              ? [websocketApiId.Ref, lambdaLogicalId]
              : [lambdaLogicalId],
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            },
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
          },
        },
      });

      if (event.authorizer) {
        const websocketsAuthorizerPermissionLogicalId = this.provider.naming.getLambdaWebsocketsPermissionLogicalId(
          event.authorizer.name
        );

        const authorizerPermissionTemplate = {
          [websocketsAuthorizerPermissionLogicalId]: {
            Type: 'AWS::Lambda::Permission',
            DependsOn: websocketApiId.Ref !== undefined ? [websocketApiId.Ref] : [],
            Properties: {
              Action: 'lambda:InvokeFunction',
              Principal: 'apigateway.amazonaws.com',
            },
          },
        };

        if (event.authorizer.permission.includes(':')) {
          authorizerPermissionTemplate[
            websocketsAuthorizerPermissionLogicalId
          ].Properties.FunctionName = event.authorizer.permission;
        } else {
          authorizerPermissionTemplate[
            websocketsAuthorizerPermissionLogicalId
          ].Properties.FunctionName = {
            'Fn::GetAtt': [event.authorizer.permission, 'Arn'],
          };

          authorizerPermissionTemplate[websocketsAuthorizerPermissionLogicalId].DependsOn.push(
            event.authorizer.permission
          );
        }

        _.merge(
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
          authorizerPermissionTemplate
        );
      }
    });

    return BbPromise.resolve();
  },
};
