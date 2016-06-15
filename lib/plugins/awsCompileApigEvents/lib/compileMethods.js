'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

module.exports = {
  compileMethods() {
    forEach(this.serverless.service.functions, (functionObject, functionName) => {
      forEach(functionObject.events.aws.http_endpoints, (path, method) => {
        const resourceLogicalId = this.resourceLogicalIds[path];
        const normalizedMethod = method[0].toUpperCase() + method.substr(1);
        const extractedResourceId = resourceLogicalId.match(/\d+$/)[0];
        const awsAccountNumber = this.serverless.service
          .getVariables(this.options.stage, this.options.region).iamRoleArnLambda
          .match(/(.*):(.*):(.*):(.*):(.*):role\/.*/)[5];

        const lambdaUri = 'arn:aws:apigateway:' +
          this.options.region +
          ':lambda:path/2015-03-31/functions/arn:aws:lambda:' +
          this.options.region +
          ':' +
          awsAccountNumber +
          ':' +
          functionName +
          '/invocations';

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
              "Integration" : {
                "IntegrationHttpMethod" : "${method.toUpperCase()}",
                "Type" : "AWS",
                "Uri" : "${lambdaUri}"
              },
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

        // store a method logical id to be used by Deployment resources "DependsOn" property
        if (!this.methodDep) {
          this.methodDep = `${normalizedMethod}MethodApigEvent${extractedResourceId}`;
        }
      });
    });

    return BbPromise.resolve();
  },
};
