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

          const permissionLogicalId = `${functionName}ApigPermmission`;

          const newPermissionObject = {
            [permissionLogicalId]: JSON.parse(permissionTemplate),
          };

          _.merge(this.serverless.service.resources.Resources, newPermissionObject);

          if (event.http.authorizer) {
            let authorizerName;
            if (typeof event.http.authorizer === 'string') {
              if (event.http.authorizer.indexOf(':') === -1) {
                authorizerName = event.http.authorizer;
              } else {
                const authorizerArn = event.http.authorizer;
                const splittedAuthorizerArn = authorizerArn.split(':');
                const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                  .length - 1].split('-');
                authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
              }
            } else if (typeof event.http.authorizer === 'object') {
              if (event.http.authorizer.arn) {
                const authorizerArn = event.http.authorizer.arn;
                const splittedAuthorizerArn = authorizerArn.split(':');
                const splittedLambdaName = splittedAuthorizerArn[splittedAuthorizerArn
                  .length - 1].split('-');
                authorizerName = splittedLambdaName[splittedLambdaName.length - 1];
              } else if (event.http.authorizer.name) {
                authorizerName = event.http.authorizer.name;
              }
            }
            const authorizerPermissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${authorizerName}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "apigateway.amazonaws.com"
                }
              }
            `;
            const authorizerPermissionLogicalId = `${authorizerName}ApigPermmission`;

            const newAuthPermissionObject = {
              [authorizerPermissionLogicalId]: JSON.parse(authorizerPermissionTemplate),
            };
            _.merge(this.serverless.service.resources.Resources, newAuthPermissionObject);
          }
        }
      });
    });
    return BbPromise.resolve();
  },
};
