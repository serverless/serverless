'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

module.exports = {
  compilePermissions() {
    forEach(this.serverless.service.functions, (functionObject, functionName) => {
      // checking all three levels in the obj tree
      // to avoid "can't read property of undefined" error
      if (functionObject.events && functionObject.events.aws
        && functionObject.events.aws.http_endpoints) {
        forEach(functionObject.events.aws.http_endpoints, (path, method) => {
          const pathIndex = this.resourcePaths.indexOf(path);
          const normalizedMethod = method[0].toUpperCase() + method.substr(1);
          const permissionTemplate = `
            {
              "Type": "AWS::Lambda::Permission",
              "Properties": {
                "FunctionName": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                "Action": "lambda:InvokeFunction",
                "Principal": "apigateway.amazonaws.com",
                "SourceArn": {
                  "Fn::GetAtt": ["${normalizedMethod}MethodApigEvent${pathIndex}", "Arn"]
                }
              }
            }
          `;

          const permissionLogicalId =
            `ApigPermission${normalizedMethod}${this.resourcePaths.indexOf(path)}`;

          const newPermissionObject = {
            [permissionLogicalId]: JSON.parse(permissionTemplate),
          };

          merge(this.serverless.service.resources.aws.Resources, newPermissionObject);
        });
      }
    });

    return BbPromise.resolve();
  },
};
