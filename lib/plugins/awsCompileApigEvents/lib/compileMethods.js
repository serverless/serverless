'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

module.exports = {
  compileMethods() {
    forEach(this.serverless.service.functions, (functionObject) => {
      forEach(functionObject.events.aws.http_endpoints, (path, method) => {
        const resourceLogicalId = this.resourceLogicalIds[path];
        const normalizedMethod = method[0].toUpperCase() + method.substr(1);
        const extractedResourceId = resourceLogicalId.match(/\d+$/)[0];

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
              "ResourceId" : { "Ref": "${resourceLogicalId}" },
              "RestApiId" : { "Ref": "RestApiApigEvent" }
            }
          }
        `;

        const methodObject = {
          [`${normalizedMethod}MethodApigEvent${extractedResourceId}`]: JSON.parse(methodTemplate),
        };

        merge(this.serverless.service.resources.aws.Resources,
          methodObject);
      });
    });

    return BbPromise.resolve();
  },
};
