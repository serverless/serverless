'use strict';

const _ = require('lodash');
const resolveLambdaTarget = require('../../../../../utils/resolve-lambda-target');

module.exports = {
  compilePermissions() {
    this.validated.events.forEach((event) => {
      const websocketApiId = this.provider.getApiGatewayWebsocketApiId();
      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(event.functionName);
      const functionObj = this.serverless.service.getFunction(event.functionName);
      const aliasDependsOn = _.get(functionObj.targetAlias, 'logicalId');

      const websocketsPermissionLogicalId =
        this.provider.naming.getLambdaWebsocketsPermissionLogicalId(event.functionName);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsPermissionLogicalId]: {
          Type: 'AWS::Lambda::Permission',
          DependsOn: [websocketApiId.Ref, aliasDependsOn || lambdaLogicalId].filter(Boolean),
          Properties: {
            FunctionName: resolveLambdaTarget(event.functionName, functionObj),
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
          },
        },
      });

      if (event.authorizer) {
        const websocketsAuthorizerPermissionLogicalId =
          this.provider.naming.getLambdaWebsocketsPermissionLogicalId(event.authorizer.name);

        const authorizerPermissionTemplate = {
          [websocketsAuthorizerPermissionLogicalId]: {
            Type: 'AWS::Lambda::Permission',
            DependsOn: websocketApiId.Ref ? [websocketApiId.Ref] : [],
            Properties: {
              Action: 'lambda:InvokeFunction',
              Principal: 'apigateway.amazonaws.com',
            },
          },
        };

        if (_.isObject(event.authorizer.permission) || event.authorizer.permission.includes(':')) {
          authorizerPermissionTemplate[
            websocketsAuthorizerPermissionLogicalId
          ].Properties.FunctionName = event.authorizer.permission;
        } else {
          const permissionFunctionObj = this.serverless.service.getFunction(event.authorizer.name);
          const permissionAliasDependsOn = _.get(permissionFunctionObj.targetAlias, 'logicalId');

          authorizerPermissionTemplate[
            websocketsAuthorizerPermissionLogicalId
          ].Properties.FunctionName = resolveLambdaTarget(
            event.authorizer.name,
            permissionFunctionObj
          );

          authorizerPermissionTemplate[websocketsAuthorizerPermissionLogicalId].DependsOn.push(
            event.authorizer.permission
          );

          if (permissionAliasDependsOn) {
            authorizerPermissionTemplate[websocketsAuthorizerPermissionLogicalId].DependsOn.push(
              permissionAliasDependsOn
            );
          }
        }

        _.merge(
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
          authorizerPermissionTemplate
        );
      }
    });
  },
};
