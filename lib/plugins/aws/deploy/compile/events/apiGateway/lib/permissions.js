'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compilePermissions() {
    _.forEach(this.serverless.service.functions, (functionObj, functionName) => {
      functionObj.events.forEach(event => {
        if (event.http) {
          const logicalFunctionName = this.provider.naming.getLogicalLambdaName(functionName);
          const permissionName = this.provider.naming
            .getLambdaApiGatewayPermissionName(functionName);

          const permissionTemplate = `
          {
            "Type": "AWS::Lambda::Permission",
            "Properties": {
              "FunctionName": { "Fn::GetAtt": ["${logicalFunctionName}", "Arn"] },
              "Action": "lambda:InvokeFunction",
              "Principal": "apigateway.amazonaws.com"
            }
          }
        `;

          const newPermissionObject = {
            [permissionName]: JSON.parse(permissionTemplate),
          };

          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
            newPermissionObject);

          if (event.http.authorizer) {
            let authorizerName;
            let authorizerArn;
            if (typeof event.http.authorizer === 'string') {
              if (event.http.authorizer.indexOf(':') === -1) { // isARN?
                authorizerName = event.http.authorizer;
                authorizerArn = `{ "Fn::GetAtt": ["${
                  this.provider.naming.getLogicalLambdaName(authorizerName)}", "Arn"] }`;
              } else {
                authorizerArn = `"${event.http.authorizer}"`;
                authorizerName = this.provider.naming
                  .extractAuthorizerIdFromArn(event.http.authorizer);
              }
            } else if (typeof event.http.authorizer === 'object') {
              if (event.http.authorizer.arn) {
                authorizerArn = `"${event.http.authorizer.arn}"`;
                authorizerName = this.provider.naming
                  .extractAuthorizerIdFromArn(event.http.authorizer.arn);
              } else if (event.http.authorizer.name) {
                authorizerName = event.http.authorizer.name;
                authorizerArn = `{ "Fn::GetAtt": ["${
                  this.provider.naming.getLogicalLambdaName(authorizerName)}", "Arn"] }`;
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

            const authorizerPermissionId = this.provider.naming
              .getLambdaApiGatewayPermissionName(authorizerName);

            const newAuthorizerPermissionObject = {
              [authorizerPermissionId]: JSON.parse(authorizerPermissionTemplate),
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newAuthorizerPermissionObject);
          }
        }
      });
    });
    return BbPromise.resolve();
  },
};
