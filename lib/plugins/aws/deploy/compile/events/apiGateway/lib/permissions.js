'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compilePermissions() {
    _.forEach(this.serverless.service.functions, (functionObj, functionName) => {
      functionObj.events.forEach(event => {
        if (event.http) {
          let method;
          let path;

          if (typeof event.http === 'object') {
            method = event.http.method;
            path = event.http.path;
          } else if (typeof event.http === 'string') {
            method = event.http.split(' ')[0];
            path = event.http.split(' ')[1];
          } else {
            const errorMessage = [
              `HTTP event of function ${functionName} is not an object nor a string.`,
              ' The correct syntax is: http: get users/list',
              ' OR an object with "path" and "method" proeprties.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          const normalizedMethod = method[0].toUpperCase() +
            method.substr(1).toLowerCase();

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
            .resourcePaths.indexOf(path)}`;

          const newPermissionObject = {
            [permissionLogicalId]: JSON.parse(permissionTemplate),
          };

          _.merge(this.serverless.service.resources.Resources, newPermissionObject);

          // if authorizer is defined, we need to add
          // permission to invoke this lambda function too
          // TODO: if the authorizer function has http event,
          //       will that permision conflict?
          if (event.http.authorizer) {
            const authorizerPermissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${event.http.authorizer}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "apigateway.amazonaws.com"
                }
              }
            `;
            const authorizerPermissionLogicalId = `${normalizedMethod}AuthPermissionApigEvent${this
              .resourcePaths.indexOf(path)}`;

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
