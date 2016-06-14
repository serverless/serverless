'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compilePermissions() {
    _.forEach(this.serverless.service.functions, (functionObj, functionName) => {
      _.forEach(functionObj.events.aws.http_endpoints, (path, method) => {
        const pathIndex = this.resourcePaths.indexOf(path);
        const permissionTemplate = `
          {
            "Type": "AWS::Lambda::Permission",
            "Properties": {
              "FunctionName": { "Fn::GetAtt": ["${functionName}", "Arn"] },
              "Action": "lambda:InvokeFunction",
              "Principal": "apigateway.amazonaws.com",
              "SourceArn": { "Fn::GetAtt": ["${method}MethodApigEvent${pathIndex}", "Arn"] }
            }
          }
        `;

        const permissionLogicalId = `ApigPermission${method}${this.resourcePaths.indexOf(path)}`;
        const newPermissionObject = {
          [permissionLogicalId]: JSON.parse(permissionTemplate),
        };

        _.merge(this.serverless.service.resources.aws.Resources, newPermissionObject);
      });
    });

    return BbPromise.resolve();
  },
};
