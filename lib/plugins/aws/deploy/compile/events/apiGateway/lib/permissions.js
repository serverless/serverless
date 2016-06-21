'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compilePermissions() {
    _.forEach(this.serverless.service.functions, (functionObj, functionName) => {
      functionObj.events.forEach(event => {
        if (event.http) {
          const normalizedMethod = event.http.method[0].toUpperCase() +
            event.http.method.substr(1).toLowerCase();

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

          const permissionLogicalId = `${normalizedMethod}PermissionApigEvent${this
            .resourcePaths.indexOf(event.http.path)}`;

          const newPermissionObject = {
            [permissionLogicalId]: JSON.parse(permissionTemplate),
          };

          _.merge(this.serverless.service.resources.Resources, newPermissionObject);
        }
      });
    });
    return BbPromise.resolve();
  },
};
