'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

module.exports = {
  compileMethods() {
    let methodIndex = 0;

    forEach(this.serverless.service.functions, (functionObject, functionName) => {
      forEach(functionObject.events.aws.http_endpoints, (path, method) => {
        const resourceId = this.resourceLogicalIds[path];

        const methodTemplate = `
          {
            "Type" : "AWS::ApiGateway::Method",
            "Properties" : {
              "AuthorizationType" : "NONE",
              "HttpMethod" : "${method.toUpperCase()}",
              "MethodResponses" : [
                {
                  "ResponseModels" : {},
                  "ResponseParameters" : {},
                  "StatusCode" : "200"
                }
              ],
              "RequestParameters" : {},
              "ResourceId" : { "Ref": "${resourceId}" },
              "RestApiId" : { "Ref": "RestApiApigEvent" }
            }
          }
        `;

        const methodObject = {
          [`${functionName}Method${methodIndex}ApigEvent`]: JSON.parse(methodTemplate),
        };

        merge(this.serverless.service.resources.aws.Resources,
          methodObject);

        methodIndex += 1;
      });
    });

    return BbPromise.resolve();
  },
};
