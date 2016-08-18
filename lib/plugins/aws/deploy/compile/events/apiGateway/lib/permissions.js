'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compilePermissions() {
    _.forEach(this.serverless.service.functions, (functionObj, functionName) => {
      functionObj.events.forEach(event => {
        if (event.http) {
          const permissionTemplate = `
          {
            "Type": "AWS::Lambda::Permission",
            "Properties": {
              "FunctionName": { "Fn::GetAtt": ["${functionName}", "Arn"] },
              "Action": "lambda:InvokeFunction",
              "Principal": "apigateway.amazonaws.com"
            }
          }
        `;

          const permissionLogicalId = `${functionName}ApigPermission`;

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
                authorizerArn = `{ "Fn::GetAtt": ["${authorizerName}", "Arn"] }`;
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
                authorizerArn = `{ "Fn::GetAtt": ["${authorizerName}", "Arn"] }`;
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

            const authorizerPermissionLogicalId = `${authorizerName}ApigPermission`;

            const newAuthPermissionObject = {
              [authorizerPermissionLogicalId]: JSON.parse(authorizerPermissionTemplate),
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newAuthPermissionObject);
          }
        }
      });
    });
    return BbPromise.resolve();
  },
};
