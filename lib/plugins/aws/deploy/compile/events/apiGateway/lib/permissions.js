'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compilePermissions() {
    _.forEach(this.serverless.service.functions, (functionObj, functionName) => {
      functionObj.events.forEach(event => {
        if (event.http) {
          const normalizedFunctionName = functionName[0].toUpperCase() + functionName.substr(1);
          const permissionTemplate = `
          {
            "Type": "AWS::Lambda::Permission",
            "Properties": {
              "FunctionName": { "Fn::GetAtt": ["${normalizedFunctionName}LambdaFunction", "Arn"] },
              "Action": "lambda:InvokeFunction",
              "Principal": "apigateway.amazonaws.com"
            }
          }
        `;

          const permissionLogicalId = `${normalizedFunctionName}LambdaPermissionApiGateway`;

          const newPermissionObject = {
            [permissionLogicalId]: JSON.parse(permissionTemplate),
          };

          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
            newPermissionObject);

          if (event.http.authorizer) {
            let authorizerName;
            let authorizerArn;
            if (typeof event.http.authorizer === 'string') {
              if (event.http.authorizer.indexOf(':') === -1) {
                authorizerName = event.http.authorizer;
                const normalizedAuthorizerName = authorizerName[0]
                    .toUpperCase() + authorizerName.substr(1);
                authorizerArn = `{ "Fn::GetAtt": ["LambdaFunction${
                  normalizedAuthorizerName}", "Arn"] }`;
              } else {
                authorizerArn = `"${event.http.authorizer}"`;
                const splittedAuthorizerArn = event.http.authorizer.split(':');
                const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                  .length - 1].split('-');
                authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
              }
            } else if (typeof event.http.authorizer === 'object') {
              if (event.http.authorizer.arn) {
                authorizerArn = `"${event.http.authorizer.arn}"`;
                const splittedAuthorizerArn = event.http.authorizer.arn.split(':');
                const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                  .length - 1].split('-');
                authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
              } else if (event.http.authorizer.name) {
                authorizerName = event.http.authorizer.name;
                const normalizedAuthorizerName = authorizerName[0]
                    .toUpperCase() + authorizerName.substr(1);
                authorizerArn = `{ "Fn::GetAtt": ["${
                  normalizedAuthorizerName}LambdaFunction", "Arn"] }`;
              }
            }

            const authorizerPermissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": ${authorizerArn},
                  "Action": "lambda:InvokeFunction",
                  "Principal": "apigateway.amazonaws.com"
                }
              }
            `;

            const normalizedAuthorizerName = authorizerName[0]
                .toUpperCase() + authorizerName.substr(1);
            const authorizerPermissionLogicalId = `${
              normalizedAuthorizerName}LambdaPermissionApiGateway`;

            const newAuthrizerPermissionObject = {
              [authorizerPermissionLogicalId]: JSON.parse(authorizerPermissionTemplate),
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newAuthrizerPermissionObject);
          }
        }
      });
    });
    return BbPromise.resolve();
  },
};
