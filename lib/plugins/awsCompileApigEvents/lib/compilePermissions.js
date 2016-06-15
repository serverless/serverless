'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

module.exports = {
  compilePermissions() {
    forEach(this.serverless.service.functions, (functionObj, functionName) => {
      forEach(functionObj.events.aws.http_endpoints, (path, method) => {
        const normalizedMethod = method[0].toUpperCase() + method.substr(1);
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

        const permissionLogicalId = `ApigPermission${normalizedMethod}${this
          .resourcePaths.indexOf(path)}`;
        const newPermissionObject = {
          [permissionLogicalId]: JSON.parse(permissionTemplate),
        };

        merge(this.serverless.service.resources.aws.Resources, newPermissionObject);
      });
    });

    return BbPromise.resolve();
  },
};
