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
              authorizerName = event.http.authorizer;
            } else if (typeof event.http.authorizer === 'object') {
              authorizerName = event.http.authorizer.name;
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
